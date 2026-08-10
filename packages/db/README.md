# @cora/db

Typed database client for the [CORA framework](https://github.com/cora-framework/cora) - usable standalone in any CyberMP project, no framework required.

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

## Install

```sh
pnpm add @cora/db kysely mysql2
```

## Usage

### Configuration

Resolve database configuration from environment variables (or pass explicit values):

```ts
import { resolveConfig, createDatabase } from "@cora/db"

const configResult = resolveConfig({
  env: {
    CORA_DB_HOST: "localhost",
    CORA_DB_PORT: "3306",
    CORA_DB_USER: "root",
    CORA_DB_PASSWORD: "secret",
    CORA_DB_DATABASE: "myapp",
  },
})

if (!configResult.ok) {
  throw new Error(configResult.err)
}

const config = configResult.val
```

Expected environment variables:
- `CORA_DB_HOST` - database hostname
- `CORA_DB_PORT` - database port (optional, defaults to 3306)
- `CORA_DB_USER` - database user
- `CORA_DB_PASSWORD` - database password
- `CORA_DB_DATABASE` - database name

### Quickstart

Define your schema and create a typed database handle:

```ts
import { createDatabase, type CoraDb } from "@cora/db"
import type { Insertable, Selectable } from "kysely"

interface User {
  id: number
  email: string
  created_at: string
}

interface Schema {
  users: User
}

const db = createDatabase<Schema>(config)

// Query with full type safety
const user = await db
  .selectFrom("users")
  .select(["id", "email"])
  .where("id", "=", 1)
  .executeTakeFirst()

if (user) {
  console.log(user.email) // type-safe
}
```

## Migrations

Define migrations using `defineMigrations` and run them with `runMigrations`. Migrations are forward-only and checksummed - never edit an already-applied migration.

```ts
import { defineMigrations, runMigrations } from "@cora/db"
import type { Kysely } from "kysely"

const migrations = defineMigrations("schema", [
  {
    sequence: 1,
    name: "create_users",
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("users")
        .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
        .addColumn("email", "varchar(255)", (col) => col.notNull().unique())
        .addColumn("created_at", "timestamp", (col) =>
          col.defaultTo(db.fn.now()).notNull()
        )
        .execute()
    },
  },
  {
    sequence: 2,
    name: "add_users_name",
    async up(db: Kysely<unknown>) {
      await db.schema
        .alterTable("users")
        .addColumn("name", "varchar(255)")
        .execute()
    },
  },
])

// Apply migrations before querying
const result = await runMigrations(db, migrations)
if (!result.ok) {
  throw new Error(result.err)
}

console.log(`Applied: ${result.val.applied.join(", ")}`)
```

Migration execution is idempotent - already-applied migrations (verified by checksum) are skipped. Forward-only means there is no `down()` method; rollback is handled at the application level (point-in-time restore, schema rollback branches, etc.).

## Testing

For tests and local development, use `createTestDatabase` to spin up an in-memory SQLite database:

```ts
import { createTestDatabase } from "@cora/db"

const testDb = createTestDatabase<Schema>()

// Use exactly like createDatabase
const user = await testDb
  .selectFrom("users")
  .selectAll()
  .execute()
```

Install `better-sqlite3` as a devDependency:

```sh
pnpm add -D better-sqlite3
```

## Performance Notes

- **mysql2** is an optional peer dependency and imported lazily - importing @cora/db never requires it to be installed.
- **better-sqlite3** is a devDependency and imported lazily - only `createTestDatabase` requires it.
- Both are imported on first query execution, not at module load time.

## SQL Dialect Notes

@cora/db supports MySQL (via mysql2) and SQLite (via better-sqlite3). All internal Kysely calls use dialect-portable builder patterns. Migration authors must be aware of dialect-specific SQL syntax when writing custom `up()` functions - for example, SQLite has different `ALTER TABLE` behavior than MySQL.
