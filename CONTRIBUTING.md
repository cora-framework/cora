# Contributing to CORA

Thanks for helping build the framework for CyberMP.

## Setup

1. Node ≥ 22, pnpm ≥ 9 (`corepack enable pnpm`)
2. `pnpm install`
3. `pnpm test` - everything should pass before you start

## Workflow

- Branch from `main`. Small, focused PRs merge fastest.
- Every PR must pass `pnpm lint`, `pnpm typecheck`, `pnpm test` (CI enforces this).
- User-facing changes need a changeset: `pnpm changeset`.
- Substantial design changes (new module, public API change) start as an RFC - see `docs/rfcs/README.md`. Opening a PR that redesigns an API without an RFC will be redirected there.

## Code style

Biome enforces formatting and lint (`pnpm lint:fix`). TypeScript is strict; don't introduce `any`.

## Governance

CORA is maintained by its founding core team, which holds final decision authority. We work in public: decisions of consequence are documented in RFCs or issues, and dissent is welcome - held to the same standard of argument as any proposal.
