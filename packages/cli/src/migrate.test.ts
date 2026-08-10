import type { CoraMigration } from "@cora/db"
import { createTestDatabase } from "@cora/db"
import { describe, expect, it } from "vitest"
import {
  type MigrateConfig,
  runMigrateWithDb,
  validateMigrateConfig,
} from "./migrate"

const validDb = {
  host: "localhost",
  user: "root",
  password: "secret",
  database: "cora",
}

const validMigration = {
  module: "moduleA",
  sequence: 1,
  name: "create-widgets",
  up: async () => {},
}

describe("validateMigrateConfig", () => {
  it("accepts a well-formed config", () => {
    const result = validateMigrateConfig({
      db: validDb,
      migrations: [validMigration],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const config: MigrateConfig = result.value
      expect(config.db).toEqual(validDb)
      expect(config.migrations).toHaveLength(1)
    }
  })

  it("accepts an empty migrations array", () => {
    const result = validateMigrateConfig({ db: validDb, migrations: [] })
    expect(result.ok).toBe(true)
  })

  it("rejects a non-object value", () => {
    const result = validateMigrateConfig("nope")
    expect(result).toEqual({
      ok: false,
      error: "Migrate config must be an object",
    })
  })

  it("rejects null", () => {
    const result = validateMigrateConfig(null)
    expect(result).toEqual({
      ok: false,
      error: "Migrate config must be an object",
    })
  })

  it("rejects a missing db field", () => {
    const result = validateMigrateConfig({ migrations: [validMigration] })
    expect(result).toEqual({
      ok: false,
      error: "db must be an object",
    })
  })

  it("rejects a non-object db field", () => {
    const result = validateMigrateConfig({
      db: "not-an-object",
      migrations: [],
    })
    expect(result).toEqual({
      ok: false,
      error: "db must be an object",
    })
  })

  it("rejects a missing migrations field", () => {
    const result = validateMigrateConfig({ db: validDb })
    expect(result).toEqual({
      ok: false,
      error: "migrations must be an array",
    })
  })

  it("rejects a non-array migrations field", () => {
    const result = validateMigrateConfig({ db: validDb, migrations: "nope" })
    expect(result).toEqual({
      ok: false,
      error: "migrations must be an array",
    })
  })

  it("names the offending path when a migration entry has a wrong-typed module", () => {
    const result = validateMigrateConfig({
      db: validDb,
      migrations: [{ ...validMigration, module: 123 }],
    })
    expect(result).toEqual({
      ok: false,
      error: "migrations[0].module must be a string",
    })
  })

  it("names the offending path when a migration entry has a wrong-typed sequence", () => {
    const result = validateMigrateConfig({
      db: validDb,
      migrations: [{ ...validMigration, sequence: "1" }],
    })
    expect(result).toEqual({
      ok: false,
      error: "migrations[0].sequence must be a number",
    })
  })

  it("names the offending path when a migration entry has a wrong-typed name", () => {
    const result = validateMigrateConfig({
      db: validDb,
      migrations: [{ ...validMigration, name: 42 }],
    })
    expect(result).toEqual({
      ok: false,
      error: "migrations[0].name must be a string",
    })
  })

  it("names the offending path when a migration entry has a wrong-typed up", () => {
    const result = validateMigrateConfig({
      db: validDb,
      migrations: [{ ...validMigration, up: "not-a-function" }],
    })
    expect(result).toEqual({
      ok: false,
      error: "migrations[0].up must be a function",
    })
  })

  it("names the offending index for the second migration entry", () => {
    const result = validateMigrateConfig({
      db: validDb,
      migrations: [validMigration, { ...validMigration, sequence: "2" }],
    })
    expect(result).toEqual({
      ok: false,
      error: "migrations[1].sequence must be a number",
    })
  })

  it("rejects a non-object migration entry", () => {
    const result = validateMigrateConfig({
      db: validDb,
      migrations: [null],
    })
    expect(result).toEqual({
      ok: false,
      error: "migrations[0] must be an object",
    })
  })
})

describe("runMigrateWithDb", () => {
  it("applies migrations against a real database and reports applied ids", async () => {
    const db = createTestDatabase()
    const migrations: CoraMigration[] = [
      {
        module: "moduleA",
        sequence: 1,
        name: "create-widgets",
        up: async (trx) => {
          await trx.schema
            .createTable("widgets")
            .addColumn("id", "integer")
            .execute()
        },
      },
    ]

    const result = await runMigrateWithDb(db, migrations)

    expect(result).toEqual({
      ok: true,
      value: { applied: ["moduleA/1-create-widgets"] },
    })

    await db
      .insertInto("widgets" as never)
      .values({ id: 1 } as never)
      .execute()
    const rows = await db
      .selectFrom("widgets" as never)
      .selectAll()
      .execute()
    expect(rows).toHaveLength(1)
  })
})
