import type { CoraDb } from "@cora-framework/db"
import type {
  AccountBalances,
  AccountKind,
  MoneyErrorResult,
} from "../contract.js"
import type { MoneyAccountsTable, MoneyLedgerTable } from "../migrations.js"

/**
 * A db handle (plain or a `withTransaction` handle) scoped to both money
 * tables. Every function in this file is a plain async function over such a
 * handle - none of them opens its own transaction. Callers that chain more
 * than one of these functions together (`transfer`, `moveBetweenOwn`, or any
 * bespoke combination) MUST invoke them inside `withTransaction` (from
 * `@cora-framework/db`) so the whole operation commits or rolls back as one
 * unit - see `src/server/money-module.ts` (Task 3).
 */
export type MoneyDb = CoraDb<MoneyAccountsTable & MoneyLedgerTable>

/**
 * The subset of `MoneyModuleOptions` this file needs: the starting balances
 * used to provision a character's `money_accounts` row the first time it is
 * mutated. `crypto` has no starting-balance option - it always starts at 0.
 */
export interface AccountsConfig {
  startingCash: number
  startingBank: number
}

/** Options for `adjust`. */
export interface AdjustOptions {
  /**
   * When `true`, `adjust` allows the resulting balance to go negative
   * instead of returning `insufficient_funds`. Defaults to `false`.
   * Player-facing paths (`transfer`, `moveBetweenOwn`) never pass this -
   * only admin `adjust` tooling (Task 3) may opt in, per module policy.
   */
  allowNegative?: boolean
}

export type AdjustEngineResult =
  | { ok: true; balanceAfter: number }
  | MoneyErrorResult

export type TransferEngineResult =
  | { ok: true; fromBalance: number; toBalance: number }
  | MoneyErrorResult

export type MoveBetweenOwnResult =
  | { ok: true; fromBalance: number; toBalance: number }
  | MoneyErrorResult

/** Builds a single-column update object for `kind`, keeping `.set()` fully typed. */
function balanceUpdate(
  kind: AccountKind,
  value: number,
): { cash: number } | { bank: number } | { crypto: number } {
  switch (kind) {
    case "cash":
      return { cash: value }
    case "bank":
      return { bank: value }
    case "crypto":
      return { crypto: value }
  }
}

/**
 * Returns `characterId`'s `money_accounts` row, provisioning it (via
 * `config.startingCash`/`config.startingBank`, `crypto` always 0) if it does
 * not exist yet. Not atomic on its own (a plain select-then-insert, matching
 * the codebase's existing convention in
 * `packages/modules/characters/src/server/characters-module.ts` - see that
 * file's comment on why this is acceptable against sqlite's single-writer
 * test/dev target) - callers that need this to be part of a larger atomic
 * operation must already be running inside `withTransaction`.
 *
 * Audit invariant: a character+kind's balance must always equal the sum of
 * that character+kind's `money_ledger` deltas. A nonzero starting balance is
 * therefore itself recorded as a `"seed"` ledger row (one for `cash`, one
 * for `bank`, each only written if its starting value is nonzero - `crypto`
 * always starts at 0, so it never gets a seed row) at provision time, before
 * any real `adjust` can append its own row on top. Written in the same call
 * as the `money_accounts` insert, so a caller running this inside
 * `withTransaction` gets both atomically.
 */
async function fetchOrProvisionRow(
  db: MoneyDb,
  characterId: number,
  config: AccountsConfig,
): Promise<{
  character_id: number
  cash: number
  bank: number
  crypto: number
}> {
  const existing = await db
    .selectFrom("money_accounts")
    .selectAll()
    .where("character_id", "=", characterId)
    .executeTakeFirst()
  if (existing) return existing

  const row = {
    character_id: characterId,
    cash: config.startingCash,
    bank: config.startingBank,
    crypto: 0,
  }
  await db.insertInto("money_accounts").values(row).execute()

  const now = new Date().toISOString()
  const seedRows: Array<{
    character_id: number
    kind: AccountKind
    delta: number
    reason: string
    balance_after: number
    created_at: string
  }> = []
  if (config.startingCash !== 0) {
    seedRows.push({
      character_id: characterId,
      kind: "cash",
      delta: config.startingCash,
      reason: "seed",
      balance_after: config.startingCash,
      created_at: now,
    })
  }
  if (config.startingBank !== 0) {
    seedRows.push({
      character_id: characterId,
      kind: "bank",
      delta: config.startingBank,
      reason: "seed",
      balance_after: config.startingBank,
      created_at: now,
    })
  }
  for (const seedRow of seedRows) {
    await db.insertInto("money_ledger").values(seedRow).execute()
  }

  return row
}

/**
 * Returns `characterId`'s three balances, without writing anything. A
 * character with no `money_accounts` row yet gets the configured starting
 * values (`crypto` always 0) - see `fetchOrProvisionRow` for the mutating
 * counterpart used by `adjust`.
 */
export async function getBalances(
  db: MoneyDb,
  characterId: number,
  config: AccountsConfig,
): Promise<AccountBalances> {
  const row = await db
    .selectFrom("money_accounts")
    .selectAll()
    .where("character_id", "=", characterId)
    .executeTakeFirst()
  if (row) return { cash: row.cash, bank: row.bank, crypto: row.crypto }
  return { cash: config.startingCash, bank: config.startingBank, crypto: 0 }
}

/**
 * Applies `delta` (a signed integer, minor units) to `characterId`'s `kind`
 * balance and appends a `money_ledger` audit row in the same call, so a
 * caller running this inside `withTransaction` gets both writes atomically.
 *
 * Provisions the `money_accounts` row from the configured starting defaults
 * on a character's first `adjust` (see `fetchOrProvisionRow`).
 *
 * Returns `insufficient_funds` (writing nothing) if the resulting balance
 * would be negative, unless `options.allowNegative` is `true`. Returns
 * `invalid_input` (defense in depth - the rpc boundary's zod schema already
 * requires an integer `delta`) if `delta` is not a finite integer.
 */
export async function adjust(
  db: MoneyDb,
  characterId: number,
  kind: AccountKind,
  delta: number,
  reason: string,
  config: AccountsConfig,
  options: AdjustOptions = {},
): Promise<AdjustEngineResult> {
  if (!Number.isInteger(delta)) {
    return {
      ok: false,
      error: "invalid_input",
      details: "delta must be an integer",
    }
  }

  const allowNegative = options.allowNegative ?? false
  const row = await fetchOrProvisionRow(db, characterId, config)
  const current = row[kind]
  const newBalance = current + delta

  if (newBalance < 0 && !allowNegative) {
    return { ok: false, error: "insufficient_funds" }
  }

  await db
    .updateTable("money_accounts")
    .set(balanceUpdate(kind, newBalance))
    .where("character_id", "=", characterId)
    .execute()

  await db
    .insertInto("money_ledger")
    .values({
      character_id: characterId,
      kind,
      delta,
      reason,
      balance_after: newBalance,
      created_at: new Date().toISOString(),
    })
    .execute()

  return { ok: true, balanceAfter: newBalance }
}

/**
 * Moves `amount` (a positive integer, minor units) of `kind` from `fromId`
 * to `toId`, as two `adjust` calls (the source leg first) plus their two
 * `money_ledger` rows. The caller MUST invoke this inside `withTransaction`
 * (from `@cora-framework/db`) so a failure partway through (e.g. the
 * destination leg throwing) rolls back the source leg's already-applied
 * write too - see `src/server/money-module.ts` (Task 3) and the rollback
 * atomicity test in `accounts.test.ts`.
 *
 * `amount_not_positive` if `amount` is not a positive integer,
 * `same_account` if `fromId === toId` (a same-character, same-kind transfer
 * is a no-op that would otherwise write a pointless ledger pair - checked
 * before either leg runs, so a `same_account` result never writes anything).
 * `insufficient_funds` propagates from the source leg's `adjust` call
 * (neither leg is written in that case, since the destination leg never
 * runs).
 */
export async function transfer(
  db: MoneyDb,
  fromId: number,
  toId: number,
  kind: AccountKind,
  amount: number,
  config: AccountsConfig,
): Promise<TransferEngineResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: "amount_not_positive" }
  }
  if (fromId === toId) {
    return { ok: false, error: "same_account" }
  }

  const fromResult = await adjust(
    db,
    fromId,
    kind,
    -amount,
    `transfer:out:${toId}`,
    config,
  )
  if (!fromResult.ok) return fromResult

  const toResult = await adjust(
    db,
    toId,
    kind,
    amount,
    `transfer:in:${fromId}`,
    config,
  )
  if (!toResult.ok) return toResult

  return {
    ok: true,
    fromBalance: fromResult.balanceAfter,
    toBalance: toResult.balanceAfter,
  }
}

/**
 * Moves `amount` (a positive integer, minor units) from `fromKind` to
 * `toKind` within a single character's own account (`cash` <-> `bank`,
 * used by the `deposit`/`withdraw` rpc handlers in Task 3). Same atomicity
 * requirement as `transfer`: the caller MUST invoke this inside
 * `withTransaction`.
 *
 * `amount_not_positive` if `amount` is not a positive integer,
 * `same_account` if `fromKind === toKind` (nothing would change, so nothing
 * is written). `insufficient_funds` propagates from the source leg's
 * `adjust` call.
 */
export async function moveBetweenOwn(
  db: MoneyDb,
  characterId: number,
  fromKind: AccountKind,
  toKind: AccountKind,
  amount: number,
  config: AccountsConfig,
): Promise<MoveBetweenOwnResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: "amount_not_positive" }
  }
  if (fromKind === toKind) {
    return { ok: false, error: "same_account" }
  }

  const fromResult = await adjust(
    db,
    characterId,
    fromKind,
    -amount,
    `move:${fromKind}->${toKind}`,
    config,
  )
  if (!fromResult.ok) return fromResult

  const toResult = await adjust(
    db,
    characterId,
    toKind,
    amount,
    `move:${fromKind}->${toKind}`,
    config,
  )
  if (!toResult.ok) return toResult

  return {
    ok: true,
    fromBalance: fromResult.balanceAfter,
    toBalance: toResult.balanceAfter,
  }
}
