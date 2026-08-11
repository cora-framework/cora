import { Kysely, MysqlDialect, SqliteDialect } from "kysely"
import type { CoraDbConfig } from "./config"

/**
 * A typed Kysely database handle for the given schema.
 */
export type CoraDb<Schema = Record<string, unknown>> = Kysely<Schema>

const DEFAULT_PORT = 3306
const DEFAULT_CONNECTION_LIMIT = 10

/**
 * Create a database handle backed by a mysql2 connection pool.
 *
 * mysql2 is an optional peer dependency of @cora-framework/db. It is imported lazily
 * inside the pool factory (called once by kysely on the first query) so
 * that importing this module - or the package entry point - never requires
 * mysql2 to be installed. Only calling `createDatabase` and then running a
 * query does.
 */
export function createDatabase<Schema = Record<string, unknown>>(
  config: CoraDbConfig,
): CoraDb<Schema> {
  const port = config.port ?? DEFAULT_PORT
  const connectionLimit = config.connectionLimit ?? DEFAULT_CONNECTION_LIMIT

  return new Kysely<Schema>({
    dialect: new MysqlDialect({
      pool: async () => {
        const { createPool } = await import("mysql2")
        return createPool({
          host: config.host,
          port,
          user: config.user,
          password: config.password,
          database: config.database,
          connectionLimit,
        })
      },
    }),
  })
}

/**
 * Create an in-memory SQLite-backed database handle, intended for tests and
 * local development only - not for production use.
 *
 * better-sqlite3 is a devDependency of @cora-framework/db. It is imported lazily
 * inside the database factory (called once by kysely on the first query) so
 * that importing this module - or the package entry point - never requires
 * better-sqlite3 to be installed unless `createTestDatabase` is actually
 * used.
 */
export function createTestDatabase<
  Schema = Record<string, unknown>,
>(): CoraDb<Schema> {
  return new Kysely<Schema>({
    dialect: new SqliteDialect({
      database: async () => {
        const { default: Database } = await import("better-sqlite3")
        return new Database(":memory:")
      },
    }),
  })
}

/**
 * Run `fn` inside a database transaction, committing on success and rolling
 * back if `fn` throws.
 */
export async function withTransaction<Schema, T>(
  db: CoraDb<Schema>,
  fn: (trx: Kysely<Schema>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(fn)
}
