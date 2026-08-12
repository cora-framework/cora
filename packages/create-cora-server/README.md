# create-cora-server

Scaffolder for new CORA server projects - creates a minimal, typed Node.js application with database migrations pre-configured.

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

## Install

```sh
pnpm add create-cora-server
```

## Usage

Create a new server project:

```sh
pnpm create cora-server my-server
```

Or with npx (when published to npm):

```sh
npx create-cora-server my-server
```

The scaffolder creates a directory named `my-server` with the following structure:

```
my-server/
  .gitignore
  package.json
  tsconfig.json
  biome.json
  cora.config.ts
  cora.migrate.mjs
  README.md
  src/
    server/
      index.ts
      build-modules.ts
      build-modules.test.ts
```

Generated files include:
- **package.json**: Dependencies on the published `@cora-framework/{core,db,lib,ui,characters,inventory,money}` packages plus `kysely` and `mysql2`, and devDependencies for TypeScript, Vitest, Biome, and the React tooling the UI modules need to typecheck
- **tsconfig.json**: TypeScript configuration targeting ES2022 with strict mode
- **biome.json**: Code formatter and linter configuration
- **.gitignore**: Standard Node.js exclusions
- **cora.config.ts**: The project's single configuration surface - database settings from `CORA_DB_*` environment variables, an example item catalog, inventory slot/weight limits, and starting character balances
- **cora.migrate.mjs**: Aggregated migration list (core permissions plus the characters, inventory, and money module migrations) for the `cora migrate` CLI
- **src/server/build-modules.ts**: Builds the wired module list (characters, inventory, money) from `cora.config.ts`, usable both by the real entry point and headlessly in tests
- **src/server/index.ts**: The real server entry - boots the live CyberMP platform adapter, the database, and a kernel running the modules from `build-modules.ts`
- **src/server/build-modules.test.ts**: A headless Vitest test that boots the same module wiring against a test platform and test database

## Next Steps

After scaffolding, navigate to the project and install dependencies:

```sh
cd my-server
pnpm install
```

Then:
- Edit `cora.config.ts` to change the item catalog and starting balances
- Run `pnpm test` to boot the wired kernel headlessly and confirm it works
- Run `pnpm migrate` to apply migrations against your database
- Run `pnpm build` to compile to JavaScript
- Deploy the build inside a running CyberMP server, which is required to
  actually start `src/server/index.ts` (it needs the live `mp` global)

See the generated project's own `README.md` for the full getting-started
guide, including how the modules integrate with each other via the
active-character kernel service.
