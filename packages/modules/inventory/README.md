# @cora-framework/inventory

Server-authoritative, character-bound slot inventory for the [CORA framework](https://github.com/cora-framework/cora) - the second official CORA roleplay module, following the module patterns [`@cora-framework/characters`](../characters/README.md) established as the reference implementation of the `CoraModule` contract specified in [RFC 0001](../../../docs/rfcs/0001-module-api.md).

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

Gives every character a fixed-size slot inventory backed by a code-defined item catalog: stack-filling adds, all-or-nothing weight-checked gives, deterministic merge-bounded moves, bounded splits, and category-based equip with automatic swap - every mutation server-authoritative and transactional. Ships a CEF-friendly, click-select `InventoryGrid` React component built on `@cora-framework/ui`.

## Install

```sh
pnpm add @cora-framework/inventory
```

## Item catalog

Item definitions are code-defined, per-deployment configuration - not stored in the database. `defineItemCatalog` validates a list of `ItemDefinition`s (kebab-case `id`, positive `weight`, `maxStack` >= 1 and exactly 1 when `stackable` is `false`, a known `category`) and freezes the result; a malformed catalog throws at startup rather than at some later runtime call:

```ts
import { defineItemCatalog } from "@cora-framework/inventory"

export const catalog = defineItemCatalog([
  {
    id: "medium-pistol",
    label: "Medium Pistol",
    weight: 1.5,
    stackable: false,
    maxStack: 1,
    category: "weapon",
  },
  {
    id: "stim-pack",
    label: "Stim Pack",
    weight: 0.3,
    stackable: true,
    maxStack: 5,
    category: "consumable",
  },
])
```

`category` is one of `"weapon" | "consumable" | "gear" | "misc"`; only `"weapon"` and `"gear"` items are equippable (see Operations below). `nativeTweakDbId` is an optional field consumed by the experimental native bridge - see Native bridge below.

## Server usage

`createInventoryModule({ catalog, ... })` builds a `CoraModule`, the same way `createCharactersModule` does: pass it to `createKernel`'s `modules` array. Boot it alongside `@cora-framework/characters` on the same kernel and inventory auto-resolves "which character is this player currently playing" through the kernel's service registry - no manual wiring required:

```ts
import { createKernel, createTestPlatform } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { createCharactersModule } from "@cora-framework/characters"
import { createInventoryModule, defineItemCatalog } from "@cora-framework/inventory"

const catalog = defineItemCatalog([
  {
    id: "medium-pistol",
    label: "Medium Pistol",
    weight: 1.5,
    stackable: false,
    maxStack: 1,
    category: "weapon",
  },
])

const { platform } = createTestPlatform()
const db = createTestDatabase()

const kernel = await createKernel({
  platform,
  db,
  modules: [
    createCharactersModule(),
    // No `isActiveCharacter` option: characters publishes the
    // core-standard `activeCharacterProviderToken` service (RFC 0002) from
    // its live session in its own register(), and inventory resolves it
    // lazily via `ctx.services.get` on every gated call - registration
    // order between the two modules does not matter, only that both are
    // registered before the first inventory rpc call arrives.
    createInventoryModule({ catalog }),
  ],
})

console.log(kernel.disabledModules) // []
await kernel.shutdown()
```

`InventoryModuleOptions` also accepts `slots` (default 40, the number of slot indices `0..slots-1` a character's inventory has) and `maxWeight` (default 120), and still accepts an explicit `isActiveCharacter` callback that overrides the service lookup entirely - useful standalone, in tests, or against a character-owning module other than `@cora-framework/characters`. Full resolution order, applied fresh on every gated call: (1) the explicit `isActiveCharacter` option, if provided; (2) `ctx.services.get(activeCharacterProviderToken)`, if a provider is registered; (3) an allow-all fallback, logged once via `ctx.log("warn", ...)` - not a safe default for a production deployment (see the docstring on `InventoryModuleOptions` in `src/server/inventory-module.ts`).

## RPC surface

Every procedure is namespaced `cora.inventory.*` per RFC 0001 and parses its input with zod at the boundary: malformed input never throws through the RPC layer, it comes back as `{ ok: false, error: "invalid_input", details }`.

| Procedure | Input | Result | Notes |
|---|---|---|---|
| `cora.inventory.get` | `{ characterId: number }` | `{ ok: true, slots: InventorySlot[], maxWeight: number, usedWeight: number }` \| error | `slots` only lists occupied slots; each includes a `label` resolved from the catalog. Gated by `isActiveCharacter`. |
| `cora.inventory.move` | `{ characterId, fromSlot, toSlot }` | `{ ok: true }` \| error | See stack-fill/merge rules below. Gated by `isActiveCharacter`. |
| `cora.inventory.split` | `{ characterId, fromSlot, toSlot, quantity }` | `{ ok: true }` \| error | `toSlot` must be empty; `quantity` must leave both stacks non-empty. Gated by `isActiveCharacter`. |
| `cora.inventory.give` | `{ characterId, itemId, quantity }` | `{ ok: true }` \| error | Admin/server tooling - gated by the `cora.inventory.give` permission, NOT by `isActiveCharacter`. See Give below. |
| `cora.inventory.remove` | `{ characterId, slot, quantity }` | `{ ok: true }` \| error | Deletes the row entirely once quantity reaches zero. Gated by `isActiveCharacter`. |
| `cora.inventory.equip` | `{ characterId, slot }` | `{ ok: true }` \| error | Weapon/gear only; unequips any other equipped item of the same category. Gated by `isActiveCharacter`. |

Every successful mutation (move/split/give/remove/equip) fires a `cora.inventory.ui.refresh` push (`{ characterId }`) to the calling player, fire-and-forget - its rejection is caught and logged, never surfaced as an unhandled rejection or folded into the rpc result. No push is sent on failure.

## Errors

All six procedures share one error union (`InventoryError`, exported from the package root):

| Error | Meaning |
|---|---|
| `invalid_input` | Failed the zod boundary schema (see `details`). |
| `unknown_item` | `itemId` is not present in the configured catalog. |
| `inventory_full` | No free slot available to place the full quantity being added. |
| `slot_empty` | An operation referenced a slot with nothing in it. |
| `slot_occupied` | The target slot already holds a different, unmergeable stack (or, for `split`, is not empty). |
| `not_stackable` | `split` targeted a non-stackable item. |
| `insufficient_quantity` | `remove`/`split` requested a quantity the source stack cannot satisfy. |
| `weight_exceeded` | The operation would push total carried weight over `maxWeight`. |
| `not_active_character` | `characterId` is not the caller's currently active character per `isActiveCharacter`. |
| `not_equippable` | `equip` targeted an item outside the `weapon`/`gear` categories. |
| `already_equipped` | `equip` targeted a slot that is already equipped. |
| `permission_denied` | The caller lacks the permission required for the procedure (currently only `cora.inventory.give`). |

## Operations semantics

The transactional engine in `src/server/operations.ts` (every mutating rpc handler wraps its call in `withTransaction`) implements:

- **Stack-fill ordering (`give`/add)**: existing non-full stacks of the same item are topped up first, in ascending slot order, up to each item's `maxStack`; only the remainder spills into free slots, also in ascending order.
- **All-or-nothing weight (`give`)**: the full placement and the resulting total carried weight are computed and validated *before* any write happens - a quantity that would overflow available slots (`inventory_full`) or `maxWeight` (`weight_exceeded`) changes nothing in the database.
- **Merge rules (`move`)**: moving onto an empty slot is a plain move; moving onto a slot holding the *same* item merges the two stacks only if the combined quantity fits within `maxStack` (`slot_occupied` otherwise, with nothing changed); moving onto a slot holding a *different* item is always `slot_occupied` - there is no implicit swap. A move within one character's inventory never changes total carried weight, so it is not weight-checked.
- **Split bounds (`split`)**: the target slot must be empty, the source item must be `stackable`, and `quantity` must be at least 1 and strictly less than the source stack's quantity, so both the source and the new stack end up non-empty. The new stack is always created unequipped.
- **Equip swap (`equip`)**: only `weapon`/`gear` items are equippable; equipping an already-equipped slot is `already_equipped`, not a silent no-op. Equipping unequips any other equipped item of the *same* category (one equipped weapon and one equipped gear item at a time) - defensively, every matching row is cleared, not just the first found, so a corrupted inventory self-heals on the next equip call.

## UI usage

`InventoryGrid` (from the `./ui` subpath, mirroring how `@cora-framework/characters` splits its React component from the server package) renders a fixed-size grid of `SlotView`s - one entry per configured slot index, materialized by the caller from `cora.inventory.get`'s (sparse) `slots` array. It is label-driven: each filled `SlotView` carries the `label` the server already resolved from the catalog (mirroring `InventorySlot.label`), so the component never needs its own copy of the catalog or a `labelFor` callback. `react` is a peer dependency, exactly like `@cora-framework/ui` and `@cora-framework/characters`:

```tsx
import "@cora-framework/ui/theme.css"
import "@cora-framework/inventory/ui/inventory-grid.css"
import { InventoryGrid } from "@cora-framework/inventory/ui"
import type { SlotView } from "@cora-framework/inventory/ui"

function InventoryPanel({ slots }: { slots: SlotView[] }) {
  return (
    <InventoryGrid
      slots={slots}
      usedWeight={12}
      maxWeight={120}
      onMove={(fromSlot, toSlot) => console.log("move", fromSlot, toSlot)}
      onSplit={(fromSlot, toSlot, quantity) =>
        console.log("split", fromSlot, toSlot, quantity)
      }
      onEquip={(slot) => console.log("equip", slot)}
    />
  )
}
```

The interaction model is click-select rather than drag-and-drop, deliberately - a CEF-friendly, keyboard-operable choice (every slot is a native `<button>`) that drag-and-drop can layer on top of later without changing the props contract:

- Click a filled slot to select it as the move source; clicking it again deselects without calling `onMove`. Clicking a different slot fires `onMove(source, target)`.
- A selected slot holding more than one unit shows a "Split" button; picking a different target slot next opens a quantity `Dialog`, and confirming a valid quantity (`1..sourceQuantity-1`) fires `onSplit(source, target, quantity)`.
- Every filled, unequipped slot shows an "Equip" button that fires `onEquip(slot)` directly, independent of selection.

`apps/harness`'s "Inventory" gallery section renders `InventoryGrid` against a mock catalog and mutable local slot state (including working move/split/equip logic) with an action log, wired the same way; see `apps/harness/src/App.tsx` and `apps/harness/src/mock.ts`.

## Give: admin tooling, not a player action

`cora.inventory.give` is deliberately **not** gated by `isActiveCharacter` - it is authorized purely by the caller holding the `cora.inventory.give` permission (checked via `ctx.permissions`), failing closed with `permission_denied` otherwise. The textbook use case is an admin (or a quest/mission script running with elevated permission) granting an item to a character that is not the caller's own active one, or not even the caller's own character at all, which an `isActiveCharacter` check would wrongly block. Every other player-invoked procedure (`get`/`move`/`split`/`remove`/`equip`) is gated by `isActiveCharacter` so a player can never read or mutate an inventory belonging to a character they are not currently playing.

## Native bridge (experimental, unverified)

`src/client/index.ts`'s `mirrorEquipToNative` reaches for the experimental `grantNativeItem` bridge from `@cora-framework/core/experimental` behind a lazy dynamic import, intended to mirror a confirmed `equip` into a real game item using the equipped item's `ItemDefinition.nativeTweakDbId`. **This is honestly unverified, not a working feature.** There is no live CyberMP client context available to CORA yet, so nothing in the client facade has been proven to run in-game: it is compile-checked only, has no runtime test coverage, and swallows whatever the experimental bridge throws - which today is always, since `grantNativeItem` throws `ExperimentalUnverifiedError` unless `CORA_EXPERIMENTAL=1`, and `NotImplementedError` even then. Treat it as a typed sketch for a future client resource to build against, exactly like `@cora-framework/characters`' `requestAppearanceEditor` sketch. It is deliberately not listed in the package's `exports` map, only reachable as source.

## Decoupling from `@cora-framework/characters`

The inventory module never imports `@cora-framework/characters` (or any other character-owning module) - `inventory_slots` rows are keyed by a plain numeric `characterId` with no foreign key assumption. Its integration point with "who is playing which character" is entirely through core: the `activeCharacterProviderToken` service defined in `@cora-framework/core` and consumed via `ctx.services.get` (see [RFC 0002](../../../docs/rfcs/0002-kernel-services.md)), with the `isActiveCharacter(playerId, characterId) => Promise<boolean>` option available as an explicit override. This means it works standalone (allow-all by default, with a logged warning), in tests (pass `isActiveCharacter` explicitly), or alongside `@cora-framework/characters` with zero manual wiring - the Server usage example above shows the real pattern: boot both modules on the same kernel and inventory resolves the service automatically, because characters provides `activeCharacterProviderToken` from its live session in its own `register()`.

## Exports

```ts
import {
  createInventoryHandlers,
  createInventoryModule,
  CORA_INVENTORY_EQUIP,
  CORA_INVENTORY_GET,
  CORA_INVENTORY_GIVE,
  CORA_INVENTORY_GIVE_PERMISSION,
  CORA_INVENTORY_MOVE,
  CORA_INVENTORY_REMOVE,
  CORA_INVENTORY_SPLIT,
  CORA_INVENTORY_UI_REFRESH,
  DEFAULT_INVENTORY_MAX_WEIGHT,
  DEFAULT_INVENTORY_SLOTS,
  defineItemCatalog,
  type EquipItemInput,
  type EquipItemResult,
  equipItemInputSchema,
  type GetInventoryInput,
  type GetInventoryResult,
  type GiveItemInput,
  type GiveItemResult,
  getInventoryInputSchema,
  giveItemInputSchema,
  inventoryMigrations,
  type InventoryError,
  type InventoryErrorResult,
  type InventoryModuleOptions,
  type InventorySlot,
  type InventorySlotsTable,
  type InventoryUiRefreshPayload,
  ITEM_CATEGORIES,
  ITEM_ID_PATTERN,
  type ItemCatalog,
  type ItemCategory,
  type ItemDefinition,
  type MoveItemInput,
  type MoveItemResult,
  moveItemInputSchema,
  type RemoveItemInput,
  type RemoveItemResult,
  removeItemInputSchema,
  type SplitStackInput,
  type SplitStackResult,
  splitStackInputSchema,
} from "@cora-framework/inventory"
```

`./ui` exports `InventoryGrid` and the `SlotView` type; `./ui/inventory-grid.css` is a plain stylesheet, not a JS module. There is no `.` re-export of the UI or client facade code - `src/client/index.ts` is deliberately not part of the `exports` map, for the same reason as `@cora-framework/characters`' client facade (see Native bridge above).
