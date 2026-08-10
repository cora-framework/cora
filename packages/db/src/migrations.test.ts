import { describe, expect, it } from "vitest"
import { createTestDatabase } from "./database"
import { defineMigrations, runMigrations } from "./migrations"

function freshDb() {
  return createTestDatabase()
}

describe("runMigrations", () => {
  it("applies all pending migrations on a fresh database and records rows", async () => {
    const db = freshDb()
    const migrations = defineMigrations("moduleA", [
      {
        sequence: 1,
        name: "create-widgets",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
      {
        sequence: 2,
        name: "create-gadgets",
        up: async (trx) => {
          await trx.schema
            .createTable("gadgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])

    const result = await runMigrations(db, migrations)

    expect(result).toEqual({
      ok: true,
      value: {
        applied: ["moduleA/1-create-widgets", "moduleA/2-create-gadgets"],
      },
    })

    const rows = await db
      .selectFrom("cora_migrations" as never)
      .selectAll()
      .execute()
    expect(rows).toHaveLength(2)
  })

  it("applies nothing on a second run", async () => {
    const db = freshDb()
    const migrations = defineMigrations("moduleA", [
      {
        sequence: 1,
        name: "create-widgets",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])

    await runMigrations(db, migrations)
    const second = await runMigrations(db, migrations)

    expect(second).toEqual({ ok: true, value: { applied: [] } })
  })

  it("applies only a newly appended migration", async () => {
    const db = freshDb()
    const first = defineMigrations("moduleA", [
      {
        sequence: 1,
        name: "create-widgets",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])
    await runMigrations(db, first)

    const [firstMigration] = first
    if (!firstMigration) throw new Error("expected first migration")
    const second = defineMigrations("moduleA", [
      firstMigration,
      {
        sequence: 2,
        name: "create-gadgets",
        up: async (trx) => {
          await trx.schema
            .createTable("gadgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])

    const result = await runMigrations(db, second)

    expect(result).toEqual({
      ok: true,
      value: { applied: ["moduleA/2-create-gadgets"] },
    })
  })

  it("errs on checksum mismatch and applies nothing further", async () => {
    const db = freshDb()
    const original = defineMigrations("moduleA", [
      {
        sequence: 1,
        name: "create-widgets",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])
    await runMigrations(db, original)

    const edited = defineMigrations("moduleA", [
      {
        sequence: 1,
        name: "create-widgets",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets")
            .addColumn("id", "integer")
            .addColumn("extra", "text")
            .execute()
        },
      },
      {
        sequence: 2,
        name: "create-gadgets",
        up: async (trx) => {
          await trx.schema
            .createTable("gadgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])

    const result = await runMigrations(db, edited)

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("moduleA/1-create-widgets"),
    })

    const gadgets = await db.introspection.getTables()
    expect(gadgets.some((t) => t.name === "gadgets")).toBe(false)
  })

  it("errs on duplicate (module, sequence) before applying anything", async () => {
    const db = freshDb()
    const migrations = defineMigrations("moduleA", [
      {
        sequence: 1,
        name: "create-widgets",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
      {
        sequence: 1,
        name: "create-widgets-dup",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets_dup")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])

    const result = await runMigrations(db, migrations)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("moduleA/1")
    }

    const tables = await db.introspection.getTables()
    expect(tables.some((t) => t.name === "widgets")).toBe(false)
  })

  it("interleaves two modules deterministically by module asc then sequence asc", async () => {
    const db = freshDb()
    const moduleA = defineMigrations("moduleA", [
      {
        sequence: 2,
        name: "second",
        up: async (trx) => {
          await trx.schema
            .createTable("a2")
            .addColumn("id", "integer")
            .execute()
        },
      },
      {
        sequence: 1,
        name: "first",
        up: async (trx) => {
          await trx.schema
            .createTable("a1")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])
    const moduleB = defineMigrations("moduleB", [
      {
        sequence: 1,
        name: "first",
        up: async (trx) => {
          await trx.schema
            .createTable("b1")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])

    const result = await runMigrations(db, [...moduleB, ...moduleA])

    expect(result).toEqual({
      ok: true,
      value: {
        applied: ["moduleA/1-first", "moduleA/2-second", "moduleB/1-first"],
      },
    })
  })

  it("leaves earlier migrations recorded when a later one throws mid-run", async () => {
    const db = freshDb()
    const migrations = defineMigrations("moduleA", [
      {
        sequence: 1,
        name: "create-widgets",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
      {
        sequence: 2,
        name: "boom",
        up: async () => {
          throw new Error("boom")
        },
      },
      {
        sequence: 3,
        name: "create-gadgets",
        up: async (trx) => {
          await trx.schema
            .createTable("gadgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ])

    const result = await runMigrations(db, migrations)

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("moduleA/2-boom"),
    })

    const rows = await db
      .selectFrom("cora_migrations" as never)
      .selectAll()
      .execute()
    expect(rows).toHaveLength(1)

    const tables = await db.introspection.getTables()
    expect(tables.some((t) => t.name === "gadgets")).toBe(false)
  })
})
