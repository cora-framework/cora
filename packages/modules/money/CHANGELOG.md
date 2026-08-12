# @cora-framework/money

## 0.1.0

### Minor Changes

- 9aae722: Add `@cora-framework/money`, the third official CORA roleplay module: character-bound `cash`/`bank`/`crypto` accounts (all integer minor units, never floats) with a `cora.money.*` RPC surface (`get`/`transfer`/`deposit`/`withdraw`/`adjust`), a shared typed error union, a transactional balance engine backed by an append-only `money_ledger` audit log (every mutation writes its balance change and audit row in the same database transaction, with starting balances recorded as seed rows so the ledger sum always reconciles against the live balance), a permission-gated `adjust` procedure for admin tooling that cannot drive a balance below zero, a read-only `MoneyHud` React component published under `./ui` with its own `./ui/money-hud.css` stylesheet, and auto-resolution of the active-character service from `@cora-framework/core` with zero manual wiring required alongside `@cora-framework/characters`.
