# @cora/cli

Command-line tools for the [CORA framework](https://github.com/cora-framework/cora) - usable standalone for managing database migrations and checking the development environment.

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

## Install

```sh
pnpm add @cora/cli
```

## Usage

### cora doctor

Check that the current environment satisfies CORA requirements:

```sh
cora doctor
```

This command verifies:
- **node**: Must be version 22 or higher (parses semver major version)
- **pnpm**: Must be installed and version 9 or higher (parses semver major version)
- **platform**: Reports the current platform (always passes)

Output format:

```
[ok] node    node 22.0.0 satisfies the minimum (>= 22)
[ok] pnpm    pnpm 9.1.0 satisfies the minimum (>= 9)
[ok] platform running on linux
```

Exit codes:
- `0`: All checks passed
- `1`: One or more checks failed

### cora migrate

Run pending database migrations from a configuration file:

```sh
cora migrate --config ./cora.migrate.mjs
```

The `--config` option (short: `-c`) specifies the path to a migration configuration file. Defaults to `./cora.migrate.mjs` in the current working directory.

Configuration file format (ESM):

```mjs
import { defineMigrations } from "@cora/db"

const migrations = defineMigrations("app", [
  {
    sequence: 1,
    name: "create-players",
    async up(db) {
      await db.schema
        .createTable("players")
        .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
        .addColumn("identifier", "text", (col) => col.notNull().unique())
        .addColumn("name", "text", (col) => col.notNull())
        .addColumn("created_at", "text", (col) => col.notNull())
        .execute()
    },
  },
])

export default {
  db: {
    host: process.env.CORA_DB_HOST ?? "127.0.0.1",
    port: Number(process.env.CORA_DB_PORT ?? 3306),
    user: process.env.CORA_DB_USER ?? "root",
    password: process.env.CORA_DB_PASSWORD ?? "",
    database: process.env.CORA_DB_DATABASE ?? "cora_app",
  },
  migrations,
}
```

The config file must export a default object with:
- **db**: A `CoraDbConfig` object (host, port, user, password, database)
- **migrations**: An array of migrations from `defineMigrations`

Exit codes:
- `0`: Migrations ran successfully (or no pending migrations)
- `1`: Config file not found or failed to load
- `1`: Config validation failed
- `1`: Migration execution failed

Output:
- Successful runs print each applied migration: `Applied <id>`
- If no pending migrations exist: `No pending migrations`
- Errors are printed to stderr with details for troubleshooting

## TypeScript Support

@cora/cli exports types for programmatic use:

```ts
import {
  type DoctorCheck,
  type DoctorEnv,
  runDoctor,
  type MigrateConfig,
  validateMigrateConfig,
  runMigrateWithDb,
} from "@cora/cli"
```

- `runDoctor(env: DoctorEnv): DoctorCheck[]` - Run environment checks
- `validateMigrateConfig(value: unknown): Result<MigrateConfig, string>` - Validate a migration config
- `runMigrateWithDb(db: CoraDb, migrations: CoraMigration[]): Promise<Result<...>>` - Apply migrations to a database handle
