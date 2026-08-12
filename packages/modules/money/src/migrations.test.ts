import { createTestDatabase, runMigrations } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import {
  type MoneyAccountsTable,
  type MoneyLedgerTable,
  moneyMigrations,
} from "./migrations.js"

type Schema = MoneyAccountsTable & MoneyLedgerTable

describe("moneyMigrations", () => {
  it("applies cleanly against a fresh database", async () => {
    const db = createTestDatabase()

    const result = await runMigrations(db, moneyMigrations)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.applied).toEqual([
        "money/1-create-money-accounts-table",
        "money/2-create-money-ledger-table",
      ])
    }
  })

  it("is idempotent to re-apply against the same database", async () => {
    const db = createTestDatabase()
    await runMigrations(db, moneyMigrations)

    const second = await runMigrations(db, moneyMigrations)

    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(second.value.applied).toEqual([])
    }
  })

  it("creates a money_accounts table keyed by character_id, defaulting balances to 0", async () => {
    const db = createTestDatabase<Schema>()
    await runMigrations(
      db as unknown as Parameters<typeof runMigrations>[0],
      moneyMigrations,
    )

    await db.insertInto("money_accounts").values({ character_id: 1 }).execute()

    const row = await db
      .selectFrom("money_accounts")
      .selectAll()
      .where("character_id", "=", 1)
      .executeTakeFirstOrThrow()

    expect(row).toEqual({ character_id: 1, cash: 0, bank: 0, crypto: 0 })

    // The character_id primary key must reject a duplicate insert.
    await expect(
      db.insertInto("money_accounts").values({ character_id: 1 }).execute(),
    ).rejects.toThrow()
  })

  it("creates an append-only money_ledger table with an autoincrement id", async () => {
    const db = createTestDatabase<Schema>()
    await runMigrations(
      db as unknown as Parameters<typeof runMigrations>[0],
      moneyMigrations,
    )

    const insertRow = async (characterId: number) =>
      db
        .insertInto("money_ledger")
        .values({
          character_id: characterId,
          kind: "cash",
          delta: 100,
          reason: "test",
          balance_after: 100,
          created_at: new Date().toISOString(),
        })
        .execute()

    await insertRow(1)
    await insertRow(1)

    const rows = await db
      .selectFrom("money_ledger")
      .selectAll()
      .where("character_id", "=", 1)
      .orderBy("id", "asc")
      .execute()

    expect(rows).toHaveLength(2)
    expect(rows[0]?.id).not.toBe(rows[1]?.id)
    expect(rows[0]?.balance_after).toBe(100)
  })
})
