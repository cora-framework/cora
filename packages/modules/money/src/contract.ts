import { z } from "zod"

/** RPC procedure names, namespaced `cora.money.*` per RFC 0001. */
export const CORA_MONEY_GET = "cora.money.get"
export const CORA_MONEY_TRANSFER = "cora.money.transfer"
export const CORA_MONEY_DEPOSIT = "cora.money.deposit"
export const CORA_MONEY_WITHDRAW = "cora.money.withdraw"
export const CORA_MONEY_ADJUST = "cora.money.adjust"

/** Permission required to invoke `cora.money.adjust` (admin/server tooling). */
export const CORA_MONEY_ADJUST_PERMISSION = "cora.money.adjust"

/**
 * The three balances a character owns. All amounts across this module are
 * integers in minor units (e.g. cents) - never floats, to avoid rounding
 * drift on money. `crypto` is a third, cash/bank-shaped balance (no
 * exchange-rate or external-price semantics in this module).
 */
export type AccountKind = "cash" | "bank" | "crypto"

/**
 * Error union shared by every `cora.money.*` procedure result.
 *
 * - `invalid_input`: zod boundary parse failure.
 * - `not_active_character`: `characterId` (or, for `transfer`,
 *   `fromCharacterId`) is not the caller's currently active character per
 *   the configured `isActiveCharacter` check.
 * - `insufficient_funds`: the operation would take a cash/bank/crypto
 *   balance below zero.
 * - `permission_denied`: caller lacks the permission required for the
 *   procedure (currently only `cora.money.adjust`).
 * - `same_account`: `transfer` targeted the same character and kind as the
 *   source (a no-op that would otherwise write a pointless ledger pair).
 * - `amount_not_positive`: a transfer/deposit/withdraw amount was not a
 *   positive integer. The `cora.money.*` zod schemas already require
 *   `amount` to be a positive integer, so this is normally caught as
 *   `invalid_input` at the rpc boundary first - `amount_not_positive` is
 *   what the transactional engine (`src/server/accounts.ts`, Task 2) itself
 *   returns when its functions are called directly with a trx handle
 *   (bypassing the zod boundary), as defense in depth for the module's
 *   most safety-critical code path.
 *
 * There is no `unknown_account` error: a character's account row is
 * provisioned lazily (see `src/server/money-module.ts`), so every
 * `characterId` has an implicit zero-balance account.
 */
export type MoneyError =
  | "invalid_input"
  | "not_active_character"
  | "insufficient_funds"
  | "permission_denied"
  | "same_account"
  | "amount_not_positive"

export interface MoneyErrorResult {
  ok: false
  error: MoneyError
  details?: string
}

/** A character's three balances, as returned by `cora.money.get`. */
export interface AccountBalances {
  cash: number
  bank: number
  crypto: number
}

export type GetAccountResult =
  | ({ ok: true } & AccountBalances)
  | MoneyErrorResult

export type TransferResult = { ok: true } | MoneyErrorResult

export type DepositResult = { ok: true } | MoneyErrorResult

export type WithdrawResult = { ok: true } | MoneyErrorResult

export type AdjustResult = { ok: true; balance: number } | MoneyErrorResult

export const getAccountInputSchema = z
  .object({
    characterId: z.number().int().positive(),
  })
  .strict()
export type GetAccountInput = z.infer<typeof getAccountInputSchema>

const accountKindSchema = z.enum(["cash", "bank", "crypto"])

export const transferInputSchema = z
  .object({
    fromCharacterId: z.number().int().positive(),
    toCharacterId: z.number().int().positive(),
    kind: accountKindSchema,
    amount: z.number().int().positive(),
  })
  .strict()
export type TransferInput = z.infer<typeof transferInputSchema>

export const depositInputSchema = z
  .object({
    characterId: z.number().int().positive(),
    amount: z.number().int().positive(),
  })
  .strict()
export type DepositInput = z.infer<typeof depositInputSchema>

export const withdrawInputSchema = z
  .object({
    characterId: z.number().int().positive(),
    amount: z.number().int().positive(),
  })
  .strict()
export type WithdrawInput = z.infer<typeof withdrawInputSchema>

export const adjustInputSchema = z
  .object({
    characterId: z.number().int().positive(),
    kind: accountKindSchema,
    delta: z.number().int(),
    reason: z.string().min(1),
  })
  .strict()
export type AdjustInput = z.infer<typeof adjustInputSchema>
