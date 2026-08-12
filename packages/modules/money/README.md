# @cora-framework/money

Server-authoritative, character-bound cash/bank/crypto accounts for the [CORA framework](https://github.com/cora-framework/cora) - the third official CORA roleplay module, following the module patterns [`@cora-framework/characters`](../characters/README.md) established as the reference implementation of the `CoraModule` contract specified in [RFC 0001](../../../docs/rfcs/0001-module-api.md) and [`@cora-framework/inventory`](../inventory/README.md) reinforced.

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

Gives every character three integer-minor-units balances (cash, bank, crypto) with transfers, deposit/withdraw between a character's own cash and bank, and an admin-gated adjustment path - every mutation server-authoritative, wrapped in a single database transaction together with the append-only audit row it writes. Ships a compact, read-only `MoneyHud` React component built on `@cora-framework/ui` tokens.

## Install

```sh
pnpm add @cora-framework/money
```

## Server usage

`createMoneyModule({ ... })` builds a `CoraModule`, the same way `createCharactersModule` and `createInventoryModule` do: pass it to `createKernel`'s `modules` array. Boot it alongside `@cora-framework/characters` on the same kernel and money auto-resolves "which character is this player currently playing" through the kernel's service registry - no manual `isActiveCharacter` wiring required:

```ts
import { createKernel, createTestPlatform } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { createCharactersModule } from "@cora-framework/characters"
import { createMoneyModule } from "@cora-framework/money"

const { platform } = createTestPlatform()
const db = createTestDatabase()

const kernel = await createKernel({
  platform,
  db,
  modules: [
    createCharactersModule(),
    // No `isActiveCharacter` option: characters publishes the
    // core-standard `activeCharacterProviderToken` service (RFC 0002) from
    // its live session in its own register(), and money resolves it lazily
    // via `ctx.services.get` on every gated call - registration order
    // between the two modules does not matter, only that both are
    // registered before the first money rpc call arrives.
    createMoneyModule(),
  ],
})

console.log(kernel.disabledModules) // []
await kernel.shutdown()
```

`MoneyModuleOptions` also accepts `startingCash` and `startingBank` (both default `0`; `crypto` always starts at `0`, there is no `startingCrypto` option), and still accepts an explicit `isActiveCharacter` callback that overrides the service lookup entirely - useful standalone, in tests, or against a character-owning module other than `@cora-framework/characters`. Full resolution order, applied fresh on every gated call: (1) the explicit `isActiveCharacter` option, if provided; (2) `ctx.services.get(activeCharacterProviderToken)`, if a provider is registered; (3) an allow-all fallback, logged once via `ctx.log("warn", ...)` - not a safe default for a production deployment (see the docstring on `MoneyModuleOptions` in `src/server/money-module.ts`).

## RPC surface

Every procedure is namespaced `cora.money.*` per RFC 0001 and parses its input with zod at the boundary: malformed input never throws through the RPC layer, it comes back as `{ ok: false, error: "invalid_input", details }`.

| Procedure | Input | Result | Notes |
|---|---|---|---|
| `cora.money.get` | `{ characterId }` | `{ ok: true, cash, bank, crypto }` \| error | Read-only, no transaction. Gated by `isActiveCharacter`. |
| `cora.money.transfer` | `{ fromCharacterId, toCharacterId, kind, amount }` | `{ ok: true }` \| error | `amount` must be a positive integer. Gated by `isActiveCharacter` on `fromCharacterId` only - the recipient need not be active. |
| `cora.money.deposit` | `{ characterId, amount }` | `{ ok: true }` \| error | Moves `amount` from cash to bank. Gated by `isActiveCharacter`. |
| `cora.money.withdraw` | `{ characterId, amount }` | `{ ok: true }` \| error | Moves `amount` from bank to cash. Gated by `isActiveCharacter`. |
| `cora.money.adjust` | `{ characterId, kind, delta, reason }` | `{ ok: true, balance }` \| error | Admin/server tooling - gated by the `cora.money.adjust` permission, NOT by `isActiveCharacter`. See Admin adjust below. |

Every successful mutation (transfer/deposit/withdraw/adjust) fires a `cora.money.ui.update` push (`{ characterId, balances }`) to the affected player - `transfer` pushes it to both the `fromCharacterId` and `toCharacterId` owning players - fire-and-forget, its rejection caught and logged, never surfaced as an unhandled rejection or folded into the rpc result. No push is sent on failure.

## Errors

All five procedures share one error union (`MoneyError`, exported from the package root):

| Error | Meaning |
|---|---|
| `invalid_input` | Failed the zod boundary schema (see `details`). |
| `not_active_character` | `characterId` (or, for `transfer`, `fromCharacterId`) is not the caller's currently active character per `isActiveCharacter`. |
| `insufficient_funds` | The operation would take a cash/bank/crypto balance below zero. |
| `permission_denied` | The caller lacks the permission required for the procedure (currently only `cora.money.adjust`). |
| `same_account` | `transfer` targeted the same character and kind as the source, or `deposit`/`withdraw` resolved to the same kind on both legs - a no-op that would otherwise write a pointless ledger pair. |
| `amount_not_positive` | A transfer/deposit/withdraw amount was not a positive integer. The zod schemas already require `amount` to be a positive integer, so this normally surfaces as `invalid_input` at the rpc boundary first - it is what the transactional engine itself returns when called directly with a trx handle, bypassing the boundary. |

There is no `unknown_account` error: a character's account row is provisioned lazily (see Audit ledger below), so every `characterId` has an implicit zero-balance account.

## Minor units: integers, never floats

Every balance in this module - `cash`, `bank`, `crypto`, and every `money_ledger.delta`/`balance_after` - is stored and passed around as an **integer in minor units** (e.g. cents: `1050` means `10.50`). This is enforced in the schema (the `money_accounts` and `money_ledger` columns are all `integer`), in the zod boundary (`amount`/`delta` are `z.number().int()`), and in the transactional engine (`Number.isInteger` guards on every mutating call). Floats would silently drift on repeated arithmetic, which is unacceptable for money.

The only place division ever happens in this module is `MoneyHud`'s default `format` function (`src/ui/MoneyHud.tsx`), which turns a minor-units integer into a `"1,234.56"`-style display string purely for presentation. Every other layer - contract, migrations, transactional engine, rpc handlers - keeps amounts as integers throughout.

## Audit ledger

`money_ledger` is an append-only audit log: every balance mutation (including the seed rows described below) writes exactly one row per affected `(character_id, kind)`, carrying the signed `delta` applied and the resulting `balance_after`, in the *same* database transaction as the balance update itself. This makes the ledger self-verifying: for any character and kind, the sum of that character+kind's `money_ledger.delta` rows always equals the current `money_accounts` balance for that character+kind.

That invariant holds from the very first row: a character's `money_accounts` row is provisioned lazily on its first mutation (not on `get`, which returns the configured starting values without writing anything), and if the configured `startingCash`/`startingBank` is nonzero, provisioning writes a `"seed"`-reason ledger row for that balance at the same time, before any real transfer/deposit/withdraw/adjust can append on top. `crypto` always starts at `0`, so it never gets a seed row. Because provisioning and its seed rows run inside the same call as the caller's own `withTransaction`, a fresh character's very first `money_ledger` entry already reconciles against its starting balance - there is never a balance with no corresponding history.

## Admin adjust: permission-gated, not active-character-gated

`cora.money.adjust` is deliberately **not** gated by `isActiveCharacter` - it is authorized purely by the caller holding the `cora.money.adjust` permission (checked via `ctx.permissions`), failing closed with `permission_denied` otherwise, matching `@cora-framework/inventory`'s `give` handler. The textbook use case is admin tooling (or a quest/mission script running with elevated permission) crediting or debiting a balance for a character that is not the caller's own active one, or not even the caller's own character at all, which an `isActiveCharacter` check would wrongly block.

`adjust` accepts a signed `delta` (so it can both credit and debit) but never passes `allowNegative` to the transactional engine, so it **cannot drive a balance below zero** through this rpc surface even with admin permission - the engine returns `insufficient_funds` and writes nothing if the resulting balance would go negative. This is a fixed module policy, not a configurable option today. Every other player-invoked procedure (`get`/`transfer`/`deposit`/`withdraw`) is gated by `isActiveCharacter` so a player can never read or move money belonging to a character they are not currently playing.

## UI usage

`MoneyHud` (from the `./ui` subpath, mirroring how `@cora-framework/inventory` splits its React component from the server package) is a compact, read-only display of a character's three balances. It is a **pure presentational component** - no interactions, no internal state, no RPC calls - so callers own the balances (from `cora.money.get` or the `cora.money.ui.update` push) and re-render it on change:

```tsx
import "@cora-framework/ui/theme.css"
import "@cora-framework/money/ui/money-hud.css"
import { MoneyHud } from "@cora-framework/money/ui"

function MoneyPanel({
  cash,
  bank,
  crypto,
}: {
  cash: number
  bank: number
  crypto: number
}) {
  return <MoneyHud cash={cash} bank={bank} crypto={crypto} />
}
```

An optional `format?: (minor: number) => string` prop overrides the default `"1,234.56"`-style formatter, e.g. to attach a currency symbol or a locale-specific separator. `apps/harness`'s "Money" gallery section renders `MoneyHud` against mock balances with buttons that mutate local mock state (deposit/withdraw/adjust) so it updates live, plus an action log; see `apps/harness/src/App.tsx` and `apps/harness/src/mock.ts`.

## Client facade

`src/client/index.ts`'s `registerMoneyClient` is a thin, compile-only sketch of the browser-relay wiring for the `cora.money.ui.update` push, mirroring `@cora-framework/inventory`'s client facade pattern. It has no runtime test coverage beyond typechecking - there is no live CyberMP client context available to CORA yet. Unlike inventory's client facade, it does not reach into `@cora-framework/core/experimental` at all: money has no native game-side counterpart to mirror (an inventory equip reflects into a real game item; a cash/bank/crypto balance is purely a CORA-side concept with no CyberMP-native equivalent to keep in sync), so there is no experimental native surface here to document or sketch against. It is deliberately not listed in the package's `exports` map, only reachable as source.

## Decoupling from `@cora-framework/characters`

The money module never imports `@cora-framework/characters` (or any other character-owning module) - `money_accounts` and `money_ledger` rows are keyed by a plain numeric `characterId` with no foreign key assumption. Its integration point with "who is playing which character" is entirely through core: the `activeCharacterProviderToken` service defined in `@cora-framework/core` and consumed via `ctx.services.get` (see [RFC 0002](../../../docs/rfcs/0002-kernel-services.md)), with the `isActiveCharacter(playerId, characterId) => Promise<boolean>` option available as an explicit override. This means it works standalone (allow-all by default, with a logged warning), in tests (pass `isActiveCharacter` explicitly), or alongside `@cora-framework/characters` with zero manual wiring - the Server usage example above shows the real pattern: boot both modules on the same kernel and money resolves the service automatically, because characters provides `activeCharacterProviderToken` from its live session in its own `register()`. `@cora-framework/characters` is a `devDependency` of this package used only by its both-modules integration test, never by any non-test source file.

## Exports

```ts
import {
  type AccountBalances,
  type AccountKind,
  type AdjustInput,
  type AdjustResult,
  adjustInputSchema,
  CORA_MONEY_ADJUST,
  CORA_MONEY_ADJUST_PERMISSION,
  CORA_MONEY_DEPOSIT,
  CORA_MONEY_GET,
  CORA_MONEY_TRANSFER,
  CORA_MONEY_UI_UPDATE,
  CORA_MONEY_WITHDRAW,
  createMoneyHandlers,
  createMoneyModule,
  DEFAULT_STARTING_BANK,
  DEFAULT_STARTING_CASH,
  type DepositInput,
  type DepositResult,
  depositInputSchema,
  type GetAccountInput,
  type GetAccountResult,
  getAccountInputSchema,
  type MoneyAccountsTable,
  type MoneyError,
  type MoneyErrorResult,
  type MoneyLedgerTable,
  moneyMigrations,
  type MoneyModuleOptions,
  type MoneyUiUpdatePayload,
  type TransferInput,
  type TransferResult,
  transferInputSchema,
  type WithdrawInput,
  type WithdrawResult,
  withdrawInputSchema,
} from "@cora-framework/money"
```

`./ui` exports `MoneyHud`; `./ui/money-hud.css` is a plain stylesheet, not a JS module. There is no `.` re-export of the UI or client facade code - `src/client/index.ts` is deliberately not part of the `exports` map, for the same reason as `@cora-framework/inventory`'s client facade (see Client facade above).
