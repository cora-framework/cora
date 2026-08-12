# create-cora-server

## 0.2.0

### Minor Changes

- cbbe327: The scaffolder now emits a fully-wired multi-module server: `pnpm create cora-server my-server` generates a project with a kernel boot (`src/server/index.ts` and `src/server/build-modules.ts`) already assembling the `characters`, `inventory`, and `money` modules, a `cora.config.ts` with an example item catalog and starting character balances, and an aggregated `cora.migrate.mjs` covering all four schemas. Generated `package.json` dependencies now point at the real published `@cora-framework` packages instead of workspace-only stubs.

## 0.1.0

### Minor Changes

- 9a79d79: Initial release of create-cora-server - a scaffolder for creating new CORA server projects. Copies an embedded template directory and personalizes it with the project name, generating a minimal Node.js application with TypeScript, Vitest, Biome, database migrations, and pre-configured dependencies. The template includes a starter server module using Result types and zone utilities from @cora-framework/lib, example migration configuration, and documentation for getting started.

### Patch Changes

- Updated dependencies [3c82165]
  - @cora-framework/lib@0.1.0
