import {
  activeCharacterProviderToken,
  type CoraModule,
  type CoraModuleContext,
  defineModule,
} from "@cora-framework/core"
import type { CoraDb } from "@cora-framework/db"
import { z } from "zod"
import {
  type AccountBalances,
  CORA_MONEY_GET,
  type GetAccountResult,
  getAccountInputSchema,
  type MoneyErrorResult,
} from "../contract.js"
import { type MoneyAccountsTable, moneyMigrations } from "../migrations.js"

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
 * Task 1 wires only `get` (read-only, no transaction). `transfer`,
 * `deposit`, `withdraw`, and `adjust` are the transactional balance-mutating
 * procedures added in Task 2 (the engine, `src/server/accounts.ts`) and
 * Task 3 (their rpc handlers here) - they are intentionally omitted from
 * this file until then, per the phase-2d plan.
 */
export function createMoneyHandlers(
  ctx: CoraModuleContext,
  resolvedOptions: ResolvedMoneyOptions,
) {
  const db = ctx.db as unknown as CoraDb<MoneyAccountsTable>

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
  }
}

/**
 * Builds the `money` `CoraModule`: registers the `money_accounts` and
 * `money_ledger` table migrations and the `cora.money.get` rpc handler.
 *
 * The remaining `cora.money.*` handlers (transfer/deposit/withdraw/adjust)
 * are added in Task 3, once the transactional engine they depend on
 * (Task 2, `src/server/accounts.ts`) exists.
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
    },
  })
}
