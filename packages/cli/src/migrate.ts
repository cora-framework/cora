import type { CoraDb, CoraDbConfig, CoraMigration } from "@cora-framework/db"
import { runMigrations } from "@cora-framework/db"
import { err, ok, type Result } from "@cora-framework/lib"

export interface MigrateConfig {
  db: CoraDbConfig
  migrations: CoraMigration[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function validateMigration(
  value: unknown,
  index: number,
): Result<CoraMigration, string> {
  if (!isRecord(value)) {
    return err(`migrations[${index}] must be an object`)
  }

  if (typeof value.module !== "string") {
    return err(`migrations[${index}].module must be a string`)
  }

  if (typeof value.sequence !== "number") {
    return err(`migrations[${index}].sequence must be a number`)
  }

  if (typeof value.name !== "string") {
    return err(`migrations[${index}].name must be a string`)
  }

  if (typeof value.up !== "function") {
    return err(`migrations[${index}].up must be a function`)
  }

  return ok({
    module: value.module,
    sequence: value.sequence,
    name: value.name,
    up: value.up as CoraMigration["up"],
  })
}

/**
 * Structurally validate an unknown value as a `MigrateConfig`, producing
 * error messages that name the offending path (e.g.
 * "migrations[2].sequence must be a number").
 */
export function validateMigrateConfig(
  value: unknown,
): Result<MigrateConfig, string> {
  if (!isRecord(value)) {
    return err("Migrate config must be an object")
  }

  if (!isRecord(value.db)) {
    return err("db must be an object")
  }

  if (!Array.isArray(value.migrations)) {
    return err("migrations must be an array")
  }

  const migrations: CoraMigration[] = []
  for (let index = 0; index < value.migrations.length; index += 1) {
    const result = validateMigration(value.migrations[index], index)
    if (!result.ok) {
      return err(result.error)
    }
    migrations.push(result.value)
  }

  return ok({
    db: value.db as unknown as CoraDbConfig,
    migrations,
  })
}

/**
 * Run pending migrations against an already-constructed database handle.
 * Thin delegation to @cora-framework/db's `runMigrations`, kept as its own function so
 * the bin command can inject the database for testing.
 */
export async function runMigrateWithDb(
  db: CoraDb,
  migrations: CoraMigration[],
): Promise<Result<{ applied: string[] }, string>> {
  return runMigrations(db, migrations)
}
