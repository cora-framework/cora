# @cora-framework/inventory

## 0.1.0

### Minor Changes

- bcb4635: Add `@cora-framework/inventory`, the second official CORA roleplay module: a server-authoritative, character-bound slot inventory with a code-defined, zod-validated item catalog, a transactional operations engine (stack-fill placement, all-or-nothing weight checks, deterministic merge-bounded moves, bounded splits, category-based equip with automatic same-category swap), a `cora.inventory.*` RPC surface with a shared typed error union (`get`/`move`/`split`/`give`/`remove`/`equip`, `give` gated by the `cora.inventory.give` permission rather than `isActiveCharacter` for admin tooling), a click-select `InventoryGrid` React component published under `./ui` with its own `./ui/inventory-grid.css` stylesheet whose slots are label-driven from the server-resolved `InventorySlot.label`, and a compile-only sketch of the future browser-relay client wiring including the experimental native equip-mirror bridge. Decoupled from `@cora-framework/characters` via an `isActiveCharacter` callback rather than a hard dependency.
