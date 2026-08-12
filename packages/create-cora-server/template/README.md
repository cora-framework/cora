# __PROJECT_NAME__

A CORA server project. It ships already wired: a kernel booted with the
`characters`, `inventory`, and `money` modules, an example item catalog, and
database migrations for all four schemas (core permissions plus the three
modules).

## What's included

- `cora.config.ts`: the single top-level configuration surface. Database
  connection settings (from `CORA_DB_*` environment variables), an example
  item catalog (`defineItemCatalog`) covering weapon, consumable, gear, and
  misc items, inventory slot/weight limits, and starting cash/bank balances
  for new characters.
- `src/server/build-modules.ts`: builds the module list (`characters`,
  `inventory`, `money`) from `cora.config.ts`. Pure and platform-agnostic, so
  it boots the same way in production and in tests.
- `src/server/index.ts`: the real server entry. Boots the live CyberMP
  platform adapter, connects to the database, and starts a kernel with the
  modules from `build-modules.ts`. This file only runs inside a live CyberMP
  server process - it needs the native `mp` global that CyberMP provides at
  runtime, so it cannot be started directly with `node` outside of it.
- `src/server/build-modules.test.ts`: a headless test that boots the same
  module wiring against a test platform and test database, proving the
  assembly works without needing a live CyberMP process.
- `cora.migrate.mjs`: the migration list for the `cora migrate` CLI,
  aggregating core permissions plus the characters, inventory, and money
  module migrations.

## How it fits together

`characters` provides the active-character service that the CORA kernel's
service registry exposes to every other module (see RFC 0002). `inventory`
and `money` both resolve that service automatically the first time one of
their handlers runs - there is no manual wiring to do in this project beyond
listing all three modules, which `build-modules.ts` already does. Without
`characters` booted alongside them, `inventory` and `money` still work, but
fall back to an allow-all check and log a warning, which is fine for a quick
local test but not for production.

For the full module and kernel model, see the docs site at
https://cora-framework.github.io/cora/, and RFC 0001 (module system) and RFC
0002 (active-character service) in particular.

## Prerequisites

- Node.js 22 or newer
- pnpm
- A MySQL or MariaDB database reachable from the server process
- A running CyberMP server to actually start `src/server/index.ts` in
  (the packages install and typecheck outside CyberMP, but the entry point
  itself only runs inside it)

## Install

The `@cora-framework` packages are published on npm, so a plain install is
enough:

```sh
pnpm install
```

## Configure

Set the database connection through environment variables before running
migrations or starting the server:

```sh
export CORA_DB_HOST=127.0.0.1
export CORA_DB_PORT=3306
export CORA_DB_USER=root
export CORA_DB_PASSWORD=
export CORA_DB_DATABASE=cora_app
```

Edit `cora.config.ts` to change the item catalog and the starting
cash/bank balances for new characters. `cora.migrate.mjs` reads the same
`CORA_DB_*` variables independently (it is plain JavaScript, loaded directly
by the `cora migrate` CLI with no build step), so keep both files in sync by
hand if you change the database defaults.

## Run migrations

```sh
pnpm migrate
```

## Build

```sh
pnpm build
```

## Test

```sh
pnpm test
```

This runs `src/server/build-modules.test.ts`, which boots the wired kernel
headlessly against a test platform and test database - the same wiring
`src/server/index.ts` uses against the real CyberMP platform.

## Run

`src/server/index.ts` exports a guarded `startServer()` entry point that only
runs when the file is the process's main module. Deploy the built output
(`pnpm build` first) inside your CyberMP server so it can start against the
live `mp` global; it cannot run standalone with plain `node` outside of
CyberMP.
