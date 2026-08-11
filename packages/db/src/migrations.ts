import { createHash } from "node:crypto"
import { err, ok, type Result } from "@cora-framework/lib"
import type { Kysely } from "kysely"
import type { CoraDb } from "./database"

/**
 * A single registered migration, forward-only.
 */
export interface CoraMigration {
  module: string
  sequence: number
  name: string
  up(db: Kysely<unknown>): Promise<void>
}

interface CoraMigrationsTable {
  cora_migrations: {
    module: string
    sequence: number
    name: string
    checksum: string
    applied_at: string
  }
}

/**
 * Bundle a list of migrations under a module name, producing `CoraMigration`
 * entries consumable by `runMigrations`.
 */
export function defineMigrations(
  module: string,
  migrations: Array<{
    sequence: number
    name: string
    up(db: Kysely<unknown>): Promise<void>
  }>,
): CoraMigration[] {
  return migrations.map((migration) => ({
    module,
    sequence: migration.sequence,
    name: migration.name,
    up: migration.up,
  }))
}

function migrationId(
  migration: Pick<CoraMigration, "module" | "sequence" | "name">,
): string {
  return `${migration.module}/${migration.sequence}-${migration.name}`
}

function checksumOf(migration: CoraMigration): string {
  return createHash("sha256").update(migration.up.toString()).digest("hex")
}

function sortKey(migration: CoraMigration): [string, number] {
  return [migration.module, migration.sequence]
}

async function ensureTrackingTable(
  db: CoraDb<CoraMigrationsTable>,
): Promise<void> {
  await db.schema
    .createTable("cora_migrations")
    .ifNotExists()
    .addColumn("module", "text")
    .addColumn("sequence", "integer")
    .addColumn("name", "text")
    .addColumn("checksum", "text")
    .addColumn("applied_at", "text")
    .execute()
}

/**
 * Apply pending migrations, in (module asc, sequence asc) order, each inside
 * its own transaction alongside its tracking-table row. Already-applied
 * migrations are skipped after checksum verification. Forward-only, no
 * down().
 */
export async function runMigrations(
  db: CoraDb,
  migrations: CoraMigration[],
): Promise<Result<{ applied: string[] }, string>> {
  const seen = new Map<string, CoraMigration>()
  for (const migration of migrations) {
    const key = `${migration.module}/${migration.sequence}`
    if (seen.has(key)) {
      return err(
        `Duplicate migration registered for ${migration.module}/${migration.sequence}`,
      )
    }
    seen.set(key, migration)
  }

  const sorted = [...migrations].sort((a, b) => {
    const [moduleA, sequenceA] = sortKey(a)
    const [moduleB, sequenceB] = sortKey(b)
    if (moduleA !== moduleB) return moduleA < moduleB ? -1 : 1
    return sequenceA - sequenceB
  })

  const trackedDb = db as unknown as CoraDb<CoraMigrationsTable>
  await ensureTrackingTable(trackedDb)

  const appliedRows = await trackedDb
    .selectFrom("cora_migrations")
    .select(["module", "sequence", "checksum"])
    .execute()
  const appliedByKey = new Map(
    appliedRows.map((row) => [`${row.module}/${row.sequence}`, row.checksum]),
  )

  const applied: string[] = []

  for (const migration of sorted) {
    const key = `${migration.module}/${migration.sequence}`
    const id = migrationId(migration)
    const checksum = checksumOf(migration)
    const existingChecksum = appliedByKey.get(key)

    if (existingChecksum !== undefined) {
      if (existingChecksum !== checksum) {
        return err(`Checksum mismatch for already-applied migration ${id}`)
      }
      continue
    }

    try {
      await trackedDb.transaction().execute(async (trx) => {
        await migration.up(trx as unknown as Kysely<unknown>)
        await trx
          .insertInto("cora_migrations")
          .values({
            module: migration.module,
            sequence: migration.sequence,
            name: migration.name,
            checksum,
            applied_at: new Date().toISOString(),
          })
          .execute()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return err(`Migration ${id} failed: ${message}`)
    }

    applied.push(id)
  }

  return ok({ applied })
}
