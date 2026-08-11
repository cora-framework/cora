# Contributing to CORA

Thanks for helping build the framework for CyberMP.

## Setup

1. Node ≥ 22, pnpm ≥ 9 (`corepack enable pnpm`)
2. `pnpm install`
3. `pnpm build` once, so workspace type declarations exist (packages typecheck against each other's build output)
4. `pnpm test` - everything should pass before you start

## Workflow

- Branch from `main`. Small, focused PRs merge fastest.
- Every PR must pass `pnpm lint`, `pnpm typecheck`, `pnpm test` (CI enforces this).
- User-facing changes need a changeset: `pnpm changeset`.
- Substantial design changes (new module, public API change) start as an RFC - see `docs/rfcs/README.md`. Opening a PR that redesigns an API without an RFC will be redirected there.

## Code style

Biome enforces formatting and lint (`pnpm lint:fix`). TypeScript is strict; don't introduce `any`.

## Releasing

CORA uses [Changesets](https://github.com/changesets/changesets) to version and publish packages.

- Add a changeset to your PR with `pnpm changeset` whenever you change the public behavior of a published package. Pick the affected package(s), the bump type, and describe the change for the changelog.
- Once changesets land on `main`, an automated workflow opens (or updates) a "chore: release packages" pull request that bumps versions and compiles changelogs.
- Merging that pull request publishes the updated packages to npm.

## Governance

CORA is maintained by its founding core team, which holds final decision authority. We work in public: decisions of consequence are documented in RFCs or issues, and dissent is welcome - held to the same standard of argument as any proposal.
