import {
  createTestDatabase,
  runMigrations,
  withTransaction,
} from "@cora-framework/db"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MoneyAccountsTable, MoneyLedgerTable } from "../migrations.js"
import { moneyMigrations } from "../migrations.js"
import {
  type AccountsConfig,
  adjust,
  getBalances,
  moveBetweenOwn,
  transfer,
} from "./accounts.js"

type Schema = MoneyAccountsTable & MoneyLedgerTable

const CONFIG: AccountsConfig = { startingCash: 500, startingBank: 1000 }
const CHARACTER_A = 1
const CHARACTER_B = 2

async function setupDb() {
  const db = createTestDatabase<Schema>()
  const result = await runMigrations(
    db as unknown as Parameters<typeof runMigrations>[0],
    moneyMigrations,
  )
  if (!result.ok) throw new Error("migrations failed")
  return db
}

async function ledgerRows(
  db: ReturnType<typeof createTestDatabase<Schema>>,
  characterId?: number,
) {
  let query = db.selectFrom("money_ledger").selectAll().orderBy("id", "asc")
  if (characterId !== undefined) {
    query = query.where("character_id", "=", characterId)
  }
  return query.execute()
}

async function accountRow(
  db: ReturnType<typeof createTestDatabase<Schema>>,
  characterId: number,
) {
  return db
    .selectFrom("money_accounts")
    .selectAll()
    .where("character_id", "=", characterId)
    .executeTakeFirst()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("adjust", () => {
  it("provisions the account row from starting defaults on first adjust", async () => {
    const db = await setupDb()

    const result = await adjust(db, CHARACTER_A, "cash", 100, "seed", CONFIG)

    expect(result).toEqual({ ok: true, balanceAfter: 600 })
    const row = await accountRow(db, CHARACTER_A)
    expect(row).toEqual({
      character_id: CHARACTER_A,
      cash: 600,
      bank: 1000,
      crypto: 0,
    })
  })

  it("adds a positive delta", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 100, "seed", CONFIG)

    const result = await adjust(db, CHARACTER_A, "cash", 250, "add", CONFIG)

    expect(result).toEqual({ ok: true, balanceAfter: 850 })
  })

  it("subtracts a negative delta", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 100, "seed", CONFIG)

    const result = await adjust(
      db,
      CHARACTER_A,
      "cash",
      -200,
      "subtract",
      CONFIG,
    )

    expect(result).toEqual({ ok: true, balanceAfter: 400 })
  })

  it("returns insufficient_funds and writes nothing when the result would go negative", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 0, "seed", CONFIG)

    const result = await adjust(
      db,
      CHARACTER_A,
      "cash",
      -1000,
      "overdraw",
      CONFIG,
    )

    expect(result).toEqual({ ok: false, error: "insufficient_funds" })
    const row = await accountRow(db, CHARACTER_A)
    expect(row?.cash).toBe(500)
    const rows = await ledgerRows(db, CHARACTER_A)
    expect(rows).toHaveLength(1) // only the seed adjust above
  })

  it("writes a money_ledger row with the correct balance_after", async () => {
    const db = await setupDb()

    await adjust(db, CHARACTER_A, "bank", 250, "paycheck", CONFIG)

    const rows = await ledgerRows(db, CHARACTER_A)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      character_id: CHARACTER_A,
      kind: "bank",
      delta: 250,
      reason: "paycheck",
      balance_after: 1250,
    })
    expect(typeof rows[0]?.created_at).toBe("string")
  })

  it("allowNegative permits the balance to go negative", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 0, "seed", CONFIG)

    const result = await adjust(
      db,
      CHARACTER_A,
      "cash",
      -900,
      "penalty",
      CONFIG,
      {
        allowNegative: true,
      },
    )

    expect(result).toEqual({ ok: true, balanceAfter: -400 })
    const row = await accountRow(db, CHARACTER_A)
    expect(row?.cash).toBe(-400)
  })

  it("rejects a non-integer delta defensively", async () => {
    const db = await setupDb()

    const result = await adjust(db, CHARACTER_A, "cash", 1.5, "bad", CONFIG)

    expect(result).toEqual({
      ok: false,
      error: "invalid_input",
      details: "delta must be an integer",
    })
    const row = await accountRow(db, CHARACTER_A)
    expect(row).toBeUndefined()
  })
})

describe("transfer", () => {
  it("moves the amount between two accounts and writes exactly two ledger rows", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 0, "seed", CONFIG)
    await adjust(db, CHARACTER_B, "cash", 0, "seed", CONFIG)

    const result = await transfer(
      db,
      CHARACTER_A,
      CHARACTER_B,
      "cash",
      200,
      CONFIG,
    )

    expect(result).toEqual({ ok: true, fromBalance: 300, toBalance: 700 })
    expect((await accountRow(db, CHARACTER_A))?.cash).toBe(300)
    expect((await accountRow(db, CHARACTER_B))?.cash).toBe(700)

    const fromRows = await ledgerRows(db, CHARACTER_A)
    const toRows = await ledgerRows(db, CHARACTER_B)
    // one seed row each plus one transfer row each
    expect(fromRows).toHaveLength(2)
    expect(toRows).toHaveLength(2)
    expect(fromRows[1]).toMatchObject({ delta: -200, balance_after: 300 })
    expect(toRows[1]).toMatchObject({ delta: 200, balance_after: 700 })
  })

  it("insufficient_funds leaves zero mutations and writes zero ledger rows", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 0, "seed", CONFIG)
    await adjust(db, CHARACTER_B, "cash", 0, "seed", CONFIG)

    const result = await transfer(
      db,
      CHARACTER_A,
      CHARACTER_B,
      "cash",
      10_000,
      CONFIG,
    )

    expect(result).toEqual({ ok: false, error: "insufficient_funds" })
    expect((await accountRow(db, CHARACTER_A))?.cash).toBe(500)
    expect((await accountRow(db, CHARACTER_B))?.cash).toBe(500)
    // only the two seed rows from the setup above - none from transfer
    expect(await ledgerRows(db)).toHaveLength(2)
  })

  it("returns same_account when fromId === toId", async () => {
    const db = await setupDb()

    const result = await transfer(
      db,
      CHARACTER_A,
      CHARACTER_A,
      "cash",
      100,
      CONFIG,
    )

    expect(result).toEqual({ ok: false, error: "same_account" })
    expect(await accountRow(db, CHARACTER_A)).toBeUndefined()
    expect(await ledgerRows(db)).toHaveLength(0)
  })

  it("returns amount_not_positive for a zero or negative amount", async () => {
    const db = await setupDb()

    const zero = await transfer(db, CHARACTER_A, CHARACTER_B, "cash", 0, CONFIG)
    const negative = await transfer(
      db,
      CHARACTER_A,
      CHARACTER_B,
      "cash",
      -50,
      CONFIG,
    )

    expect(zero).toEqual({ ok: false, error: "amount_not_positive" })
    expect(negative).toEqual({ ok: false, error: "amount_not_positive" })
    expect(await ledgerRows(db)).toHaveLength(0)
  })

  it("rolls back both legs and both ledger rows when the destination leg fails mid-transaction", async () => {
    const outerDb = await setupDb()
    await adjust(outerDb, CHARACTER_A, "cash", 0, "seed", CONFIG)
    await adjust(outerDb, CHARACTER_B, "cash", 0, "seed", CONFIG)

    await expect(
      withTransaction(outerDb, async (trx) => {
        // Poison the destination leg: throw on the second money_ledger
        // insert within this transaction (the source leg's ledger row is
        // the first, and is allowed to succeed before the poison fires),
        // simulating a failure partway through the destination `adjust`
        // call.
        let ledgerInsertCount = 0
        type InsertIntoFn = typeof trx.insertInto
        const originalInsertInto: InsertIntoFn = trx.insertInto.bind(trx)
        vi.spyOn(trx, "insertInto").mockImplementation(((
          table: Parameters<InsertIntoFn>[0],
        ) => {
          if (table === "money_ledger") {
            ledgerInsertCount += 1
            if (ledgerInsertCount === 2) {
              throw new Error("poisoned destination leg")
            }
          }
          return originalInsertInto(table)
        }) as InsertIntoFn)

        const result = await transfer(
          trx,
          CHARACTER_A,
          CHARACTER_B,
          "cash",
          200,
          CONFIG,
        )
        if (!result.ok) throw new Error(`unexpected: ${result.error}`)
        return result
      }),
    ).rejects.toThrow("poisoned destination leg")

    // After rollback, neither balance changed and no rows from the failed
    // transfer attempt were persisted.
    expect((await accountRow(outerDb, CHARACTER_A))?.cash).toBe(500)
    expect((await accountRow(outerDb, CHARACTER_B))?.cash).toBe(500)
    expect(await ledgerRows(outerDb)).toHaveLength(2) // only the two seed rows
  })
})

describe("moveBetweenOwn", () => {
  it("deposit: moves cash to bank", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 0, "seed", CONFIG)

    const result = await moveBetweenOwn(
      db,
      CHARACTER_A,
      "cash",
      "bank",
      100,
      CONFIG,
    )

    expect(result).toEqual({ ok: true, fromBalance: 400, toBalance: 1100 })
    const row = await accountRow(db, CHARACTER_A)
    expect(row?.cash).toBe(400)
    expect(row?.bank).toBe(1100)
  })

  it("withdraw: moves bank to cash", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 0, "seed", CONFIG)

    const result = await moveBetweenOwn(
      db,
      CHARACTER_A,
      "bank",
      "cash",
      300,
      CONFIG,
    )

    expect(result).toEqual({ ok: true, fromBalance: 700, toBalance: 800 })
    const row = await accountRow(db, CHARACTER_A)
    expect(row?.bank).toBe(700)
    expect(row?.cash).toBe(800)
  })

  it("returns insufficient_funds and writes nothing when the source can't cover the amount", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "cash", 0, "seed", CONFIG)

    const result = await moveBetweenOwn(
      db,
      CHARACTER_A,
      "cash",
      "bank",
      10_000,
      CONFIG,
    )

    expect(result).toEqual({ ok: false, error: "insufficient_funds" })
    const row = await accountRow(db, CHARACTER_A)
    expect(row?.cash).toBe(500)
    expect(row?.bank).toBe(1000)
    expect(await ledgerRows(db, CHARACTER_A)).toHaveLength(1) // only the seed
  })
})

describe("getBalances", () => {
  it("returns starting defaults without writing a row when none exists", async () => {
    const db = await setupDb()

    const balances = await getBalances(db, CHARACTER_A, CONFIG)

    expect(balances).toEqual({ cash: 500, bank: 1000, crypto: 0 })
    expect(await accountRow(db, CHARACTER_A)).toBeUndefined()
  })

  it("returns the row's values once one exists", async () => {
    const db = await setupDb()
    await adjust(db, CHARACTER_A, "crypto", 42, "seed", CONFIG)

    const balances = await getBalances(db, CHARACTER_A, CONFIG)

    expect(balances).toEqual({ cash: 500, bank: 1000, crypto: 42 })
  })
})
