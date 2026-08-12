import { defineMigrations } from "@cora-framework/db"

/**
 * The `money_accounts` table's row shape: one row per character, holding
 * all three balances. `character_id` is a plain numeric id (no foreign key
 * to a `characters` table row): the money module is intentionally decoupled
 * from `@cora-framework/characters` (see module options docs in
 * `src/server/money-module.ts`), so it does not assume that table exists.
 *
 * All three balances are integer minor units (e.g. cents) - never floats,
 * to avoid rounding drift on money. A row is created lazily, on a
 * character's first balance mutation (see `src/server/money-module.ts`),
 * not on first read.
 */
export interface MoneyAccountsTable {
  money_accounts: {
    character_id: number
    cash: number
    bank: number
    crypto: number
  }
}

/**
 * The `money_ledger` table's row shape: an append-only audit log, one row
 * per balance mutation. `balance_after` is the resulting balance of `kind`
 * for `character_id` immediately after `delta` was applied, so the ledger
 * is independently auditable without replaying every prior row.
 */
export interface MoneyLedgerTable {
  money_ledger: {
    id: number
    character_id: number
    kind: string
    delta: number
    reason: string
    balance_after: number
    created_at: string
  }
}

export const moneyMigrations = defineMigrations("money", [
  {
    sequence: 1,
    name: "create-money-accounts-table",
    async up(trx) {
      await trx.schema
        .createTable("money_accounts")
        .addColumn("character_id", "integer", (col) =>
          col.notNull().primaryKey(),
        )
        .addColumn("cash", "integer", (col) => col.notNull().defaultTo(0))
        .addColumn("bank", "integer", (col) => col.notNull().defaultTo(0))
        .addColumn("crypto", "integer", (col) => col.notNull().defaultTo(0))
        .execute()
    },
  },
  {
    sequence: 2,
    name: "create-money-ledger-table",
    async up(trx) {
      await trx.schema
        .createTable("money_ledger")
        .addColumn("id", "integer", (col) =>
          col.notNull().primaryKey().autoIncrement(),
        )
        .addColumn("character_id", "integer", (col) => col.notNull())
        .addColumn("kind", "text", (col) => col.notNull())
        .addColumn("delta", "integer", (col) => col.notNull())
        .addColumn("reason", "text", (col) => col.notNull())
        .addColumn("balance_after", "integer", (col) => col.notNull())
        .addColumn("created_at", "text", (col) => col.notNull())
        .execute()
    },
  },
])
