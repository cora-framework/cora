---
"create-cora-server": minor
---

The scaffolder now emits a fully-wired multi-module server: `pnpm create cora-server my-server` generates a project with a kernel boot (`src/server/index.ts` and `src/server/build-modules.ts`) already assembling the `characters`, `inventory`, and `money` modules, a `cora.config.ts` with an example item catalog and starting character balances, and an aggregated `cora.migrate.mjs` covering all four schemas. Generated `package.json` dependencies now point at the real published `@cora-framework` packages instead of workspace-only stubs.
