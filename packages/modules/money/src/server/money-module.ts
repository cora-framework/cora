import {
  activeCharacterProviderToken,
  type CoraModule,
  type CoraModuleContext,
  defineModule,
} from "@cora-framework/core"
import { type CoraDb, withTransaction } from "@cora-framework/db"
import { z } from "zod"
import {
  type AccountBalances,
  type AdjustResult,
  adjustInputSchema,
  CORA_MONEY_ADJUST,
  CORA_MONEY_ADJUST_PERMISSION,
  CORA_MONEY_DEPOSIT,
  CORA_MONEY_GET,
  CORA_MONEY_TRANSFER,
  CORA_MONEY_UI_UPDATE,
  CORA_MONEY_WITHDRAW,
  type DepositResult,
  depositInputSchema,
  type GetAccountResult,
  getAccountInputSchema,
  type MoneyErrorResult,
  type MoneyUiUpdatePayload,
  type TransferResult,
  transferInputSchema,
  type WithdrawResult,
  withdrawInputSchema,
} from "../contract.js"
import {
  type MoneyAccountsTable,
  type MoneyLedgerTable,
  moneyMigrations,
} from "../migrations.js"
import {
  type AccountsConfig,
  adjust as adjustBalance,
  getBalances,
  moveBetweenOwn,
  transfer as transferBalance,
} from "./accounts.js"

/** Default starting cash balance for a character with no `money_accounts` row yet. */
export const DEFAULT_STARTING_CASH = 0

/** Default starting bank balance for a character with no `money_accounts` row yet. */
export const DEFAULT_STARTING_BANK = 0

/**
 * Options for `createMoneyModule`.
 *
 * `isActiveCharacter` decouples this module from `@cora-framework/characters`
 * (or any other character-owning module): the money module binds to a plain
 * numeric `characterId` and never imports characters-module code directly.
 * At handler call time (never at `register()`, so registration order between
 * money and whatever provides the service never matters) the actual check
 * is resolved in this order, identical to `@cora-framework/inventory`:
 *
 *  1. This `isActiveCharacter` option, if provided - always wins, even if a
 *     service is also available, so an explicit override is never silently
 *     shadowed.
 *  2. `ctx.services.get(activeCharacterProviderToken)` (see
 *     `docs/rfcs/0002-kernel-services.md`) - the core-standard service a
 *     character-owning module (e.g. `@cora-framework/characters`) publishes
 *     from its live session state. Used automatically when present, with no
 *     wiring code required beyond booting both modules on the same kernel.
 *  3. An allow-all fallback (every characterId is treated as active for
 *     every caller) - deliberately permissive so the module is usable out of
 *     the box in a single-module setup or in tests, but NOT a safe default
 *     for a production deployment. A `"warn"` is logged via `ctx.log` the
 *     first time this fallback is hit, once per module instance, not on
 *     every call.
 */
export interface MoneyModuleOptions {
  startingCash?: number
  startingBank?: number
  isActiveCharacter?: (
    playerId: number,
    characterId: number,
  ) => boolean | Promise<boolean>
}

type ResolvedMoneyOptions = {
  startingCash: number
  startingBank: number
  /**
   * Only set when the caller explicitly passed `isActiveCharacter` in
   * `MoneyModuleOptions` - left `undefined` otherwise so
   * `createMoneyHandlers` can tell "explicitly overridden" apart from
   * "resolve via the service registry, falling back to allow-all" at handler
   * call time. See the resolution order documented on
   * `MoneyModuleOptions`.
   */
  isActiveCharacter?: (
    playerId: number,
    characterId: number,
  ) => boolean | Promise<boolean>
}

/**
 * Turns a zod parse failure into the shared `"invalid_input"` typed error,
 * used at the rpc boundary of every handler, matching the
 * inventory/characters modules' convention.
 */
function invalidInput(error: z.ZodError): MoneyErrorResult {
  const flattened = z.flattenError(error)
  const lines: string[] = [...flattened.formErrors]
  const fieldErrors = flattened.fieldErrors as Record<
    string,
    string[] | undefined
  >
  for (const [field, messages] of Object.entries(fieldErrors)) {
    for (const message of messages ?? []) {
      lines.push(`${field}: ${message}`)
    }
  }
  return { ok: false, error: "invalid_input", details: lines.join("; ") }
}

/**
 * Builds the `cora.money.*` rpc handlers bound to `ctx` and the resolved
 * module options.
 *
 * `get` is read-only and does not open a transaction. Every balance-mutating
 * handler (`transfer`, `deposit`, `withdraw`, `adjust`) wraps its call into
 * `src/server/accounts.ts` in `withTransaction` (from `@cora-framework/db`)
 * so the balance update(s) and their `money_ledger` audit row(s) commit or
 * roll back as one atomic unit.
 *
 * `get`, `transfer` (on `fromCharacterId`), `deposit`, and `withdraw` are
 * ordinary player actions and are gated by `isActiveCharacter`, resolved
 * lazily per call in the order documented on `MoneyModuleOptions`: the
 * explicit option, then `ctx.services.get(activeCharacterProviderToken)`,
 * then an allow-all fallback (logged once as a `"warn"`). `adjust` is
 * admin/server tooling, authorized purely by the caller holding the
 * `cora.money.adjust` permission (checked via `ctx.permissions`) and is
 * deliberately NOT gated by `isActiveCharacter`, matching
 * `@cora-framework/inventory`'s `give` handler: the textbook use case is an
 * admin adjusting a balance for a character that is not the caller's own
 * active one. `adjust` never passes `allowNegative` to the engine, so even
 * admin tooling cannot drive a balance below zero through this rpc surface
 * (module policy per the phase-2d plan; a future module option could expose
 * this, but none does today).
 *
 * After every successful mutation, a `cora.money.ui.update` push (the
 * mutated character's full, freshly-read balances) is sent fire-and-forget
 * to the owning player - for `transfer`, to both the `fromCharacterId` and
 * `toCharacterId` players. Its rejection is caught and logged via `ctx.log`,
 * never allowed to become an unhandled rejection or to change the rpc
 * result, matching `@cora-framework/inventory`'s `pushRefresh` convention.
 * No push is sent when a handler returns an error.
 */
export function createMoneyHandlers(
  ctx: CoraModuleContext,
  resolvedOptions: ResolvedMoneyOptions,
) {
  const db = ctx.db as unknown as CoraDb<MoneyAccountsTable & MoneyLedgerTable>
  const config: AccountsConfig = {
    startingCash: resolvedOptions.startingCash,
    startingBank: resolvedOptions.startingBank,
  }

  // See the resolution order documented on `MoneyModuleOptions`. Resolved
  // fresh on every call (not cached at register time) so the explicit option
  // always wins and the service lookup always sees the registry's current
  // state - registration order between money and whatever provides
  // `activeCharacterProviderToken` never matters. `warnedAllowAllFallback`
  // only guards the log line, not the fallback behavior itself.
  let warnedAllowAllFallback = false
  async function isActiveCharacter(
    playerId: number,
    characterId: number,
  ): Promise<boolean> {
    if (resolvedOptions.isActiveCharacter) {
      return resolvedOptions.isActiveCharacter(playerId, characterId)
    }
    const provider = ctx.services.get(activeCharacterProviderToken)
    if (provider) {
      return provider.isActiveCharacter(playerId, characterId)
    }
    if (!warnedAllowAllFallback) {
      warnedAllowAllFallback = true
      ctx.log(
        "warn",
        "money: no isActiveCharacter option was provided and no " +
          "activeCharacterProviderToken service is registered - falling " +
          "back to allow-all (every characterId treated as active). This " +
          "is NOT safe for production: pass isActiveCharacter explicitly " +
          "or boot alongside a module that provides the service (e.g. " +
          "@cora-framework/characters).",
      )
    }
    return true
  }

  /**
   * Fire-and-forget `cora.money.ui.update` push: re-reads `characterId`'s
   * current balances (outside any transaction - reading the just-committed
   * state is enough for a best-effort UI hint, and this must never block or
   * fail the rpc result) and sends them to `playerId`. Its rejection is
   * caught and logged, never allowed to become an unhandled rejection or to
   * change the rpc result, matching `@cora-framework/inventory`'s
   * `pushRefresh` convention.
   */
  function pushUpdate(playerId: number, characterId: number): void {
    void (async () => {
      const balances = await getBalances(db, characterId, config)
      const payload: MoneyUiUpdatePayload = { characterId, balances }
      await ctx.platform.callClient(playerId, CORA_MONEY_UI_UPDATE, payload)
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      ctx.log(
        "error",
        `player ${playerId}: money ui.update push failed: ${message}`,
      )
    })
  }

  return {
    /**
     * Returns a character's three balances.
     *
     * Lazy provisioning: a character's `money_accounts` row is created on
     * its first balance *mutation* (Task 2's transactional engine), not on
     * read. A character with no row yet simply has no money history, so
     * `get` returns the configured starting values
     * (`startingCash`/`startingBank`, `crypto` always starts at 0 - there is
     * no `startingCrypto` option) without writing anything. This keeps
     * reads side-effect-free: calling `get` repeatedly for a
     * never-mutated character never creates rows, never contends on a
     * write lock, and never needs its own transaction.
     */
    async get(input: unknown, playerId: number): Promise<GetAccountResult> {
      const parsed = getAccountInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId } = parsed.data

      const active = await isActiveCharacter(playerId, characterId)
      if (!active) return { ok: false, error: "not_active_character" }

      const row = await db
        .selectFrom("money_accounts")
        .selectAll()
        .where("character_id", "=", characterId)
        .executeTakeFirst()

      const balances: AccountBalances = row
        ? { cash: row.cash, bank: row.bank, crypto: row.crypto }
        : {
            cash: resolvedOptions.startingCash,
            bank: resolvedOptions.startingBank,
            crypto: 0,
          }

      return { ok: true, ...balances }
    },

    /**
     * Moves `amount` of `kind` from `fromCharacterId` to `toCharacterId`,
     * atomically (both legs plus their two `money_ledger` rows, via
     * `withTransaction`). The caller must be currently active on
     * `fromCharacterId` - the source of the money, matching the
     * "you can only spend what your active character owns" rule. There is
     * no active-character requirement on `toCharacterId`: sending money to
     * another (including a non-active-owned or another player's) character
     * is the whole point of a transfer.
     */
    async transfer(input: unknown, playerId: number): Promise<TransferResult> {
      const parsed = transferInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { fromCharacterId, toCharacterId, kind, amount } = parsed.data

      const active = await isActiveCharacter(playerId, fromCharacterId)
      if (!active) return { ok: false, error: "not_active_character" }

      const result = await withTransaction(db, (trx) =>
        transferBalance(
          trx,
          fromCharacterId,
          toCharacterId,
          kind,
          amount,
          config,
        ),
      )
      if (!result.ok) return result

      pushUpdate(playerId, fromCharacterId)
      pushUpdate(playerId, toCharacterId)
      return { ok: true }
    },

    /**
     * Moves `amount` from `characterId`'s cash balance to its bank balance,
     * atomically. The caller must be currently active on `characterId`.
     */
    async deposit(input: unknown, playerId: number): Promise<DepositResult> {
      const parsed = depositInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId, amount } = parsed.data

      const active = await isActiveCharacter(playerId, characterId)
      if (!active) return { ok: false, error: "not_active_character" }

      const result = await withTransaction(db, (trx) =>
        moveBetweenOwn(trx, characterId, "cash", "bank", amount, config),
      )
      if (!result.ok) return result

      pushUpdate(playerId, characterId)
      return { ok: true }
    },

    /**
     * Moves `amount` from `characterId`'s bank balance to its cash balance,
     * atomically. The caller must be currently active on `characterId`.
     */
    async withdraw(input: unknown, playerId: number): Promise<WithdrawResult> {
      const parsed = withdrawInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId, amount } = parsed.data

      const active = await isActiveCharacter(playerId, characterId)
      if (!active) return { ok: false, error: "not_active_character" }

      const result = await withTransaction(db, (trx) =>
        moveBetweenOwn(trx, characterId, "bank", "cash", amount, config),
      )
      if (!result.ok) return result

      pushUpdate(playerId, characterId)
      return { ok: true }
    },

    /**
     * Applies a signed `delta` to `characterId`'s `kind` balance, atomically,
     * writing a `money_ledger` row carrying `reason`. Admin/server tooling:
     * authorized purely by the caller holding the `cora.money.adjust`
     * permission, NOT gated by `isActiveCharacter` (see the docstring on
     * `createMoneyHandlers`). Never passes `allowNegative` to the engine, so
     * a balance can never be driven below zero through this rpc surface,
     * even by an admin - module policy per the phase-2d plan.
     */
    async adjust(input: unknown, playerId: number): Promise<AdjustResult> {
      const parsed = adjustInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId, kind, delta, reason } = parsed.data

      const permitted = await ctx.permissions.hasPermission(
        playerId,
        CORA_MONEY_ADJUST_PERMISSION,
      )
      if (!permitted) return { ok: false, error: "permission_denied" }

      const result = await withTransaction(db, (trx) =>
        adjustBalance(trx, characterId, kind, delta, reason, config),
      )
      if (!result.ok) return result

      pushUpdate(playerId, characterId)
      return { ok: true, balance: result.balanceAfter }
    },
  }
}

/**
 * Builds the `money` `CoraModule`: registers the `money_accounts` and
 * `money_ledger` table migrations and every `cora.money.*` rpc handler
 * (get/transfer/deposit/withdraw/adjust), wiring `createMoneyHandlers` to
 * the resolved options.
 */
export function createMoneyModule(
  options: MoneyModuleOptions = {},
): CoraModule {
  const resolvedOptions: ResolvedMoneyOptions = {
    startingCash: options.startingCash ?? DEFAULT_STARTING_CASH,
    startingBank: options.startingBank ?? DEFAULT_STARTING_BANK,
    // Only set when explicitly supplied (`exactOptionalPropertyTypes`
    // deliberately distinguishes "omitted" from "set to undefined" here) -
    // see `createMoneyHandlers`, which resolves the actual check lazily at
    // handler call time (option -> service -> allow-all fallback).
    ...(options.isActiveCharacter
      ? { isActiveCharacter: options.isActiveCharacter }
      : {}),
  }

  return defineModule({
    id: "money",
    migrations: moneyMigrations,
    register(ctx) {
      const handlers = createMoneyHandlers(ctx, resolvedOptions)
      ctx.platform.registerRpcHandler(CORA_MONEY_GET, handlers.get)
      ctx.platform.registerRpcHandler(CORA_MONEY_TRANSFER, handlers.transfer)
      ctx.platform.registerRpcHandler(CORA_MONEY_DEPOSIT, handlers.deposit)
      ctx.platform.registerRpcHandler(CORA_MONEY_WITHDRAW, handlers.withdraw)
      ctx.platform.registerRpcHandler(CORA_MONEY_ADJUST, handlers.adjust)
    },
  })
}
