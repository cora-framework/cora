import { describe, expect, it } from "vitest"
import { createTestDatabase, withTransaction } from "./database"

interface Schema {
  t: { id: number; name: string }
}

async function setup() {
  const db = createTestDatabase<Schema>()
  await db.schema
    .createTable("t")
    .addColumn("id", "integer")
    .addColumn("name", "text")
    .execute()
  return db
}

describe("database handle", () => {
  it("round-trips rows through kysely", async () => {
    const db = await setup()
    await db.insertInto("t").values({ id: 1, name: "a" }).execute()
    const rows = await db.selectFrom("t").selectAll().execute()
    expect(rows).toEqual([{ id: 1, name: "a" }])
  })

  it("withTransaction commits on success", async () => {
    const db = await setup()
    await withTransaction(db, async (trx) => {
      await trx.insertInto("t").values({ id: 1, name: "a" }).execute()
    })
    expect(await db.selectFrom("t").selectAll().execute()).toHaveLength(1)
  })

  it("withTransaction rolls back on error", async () => {
    const db = await setup()
    await expect(
      withTransaction(db, async (trx) => {
        await trx.insertInto("t").values({ id: 1, name: "a" }).execute()
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(await db.selectFrom("t").selectAll().execute()).toHaveLength(0)
  })
})
