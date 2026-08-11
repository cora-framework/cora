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
  cora.migrate.mjs
  README.md
  src/
    server/
      index.ts
      index.test.ts
```

Generated files include:
- **package.json**: Dependencies for @cora-framework/lib, @cora-framework/db, @cora-framework/cli, kysely (workspace linked until first npm publish), plus TypeScript, Vitest, and Biome devDependencies
- **tsconfig.json**: TypeScript configuration targeting ES2022 with strict mode
- **biome.json**: Code formatter and linter configuration
- **.gitignore**: Standard Node.js exclusions
- **cora.migrate.mjs**: Example migration configuration for running `cora migrate`
- **src/server/index.ts**: Starter module using Result types and zone utilities from @cora-framework/lib
- **src/server/index.test.ts**: Minimal Vitest test demonstrating the test setup

## Next Steps

After scaffolding, navigate to the project and install dependencies:

```sh
cd my-server
pnpm install
```

Then:
- Review `cora.migrate.mjs` and add your database schema migrations
- Edit `src/server/index.ts` to build your application
- Run `pnpm test` to execute tests
- Run `pnpm migrate` to apply migrations
- Run `pnpm build` to compile to JavaScript

## Note: Pre-release Packages

The `@cora` packages are not yet published to npm. Until the first release, the generated `package.json` uses workspace ranges (e.g., `^0.1.0`) or local linking. If working in the CORA monorepo, this is automatic. If scaffolding outside the repo, manually link the packages:

```sh
pnpm link /path/to/cora/packages/lib
pnpm link /path/to/cora/packages/db
pnpm link /path/to/cora/packages/cli
```
