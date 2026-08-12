# @cora-framework/inventory

## 0.2.0

### Minor Changes

- 6768995: The inventory module now auto-resolves the "is this player currently playing this character?" check from the kernel's service registry when `isActiveCharacter` is not explicitly configured: it looks up the core-standard `activeCharacterProviderToken` (see RFC 0002, `docs/rfcs/0002-kernel-services.md`) lazily at handler call time, so booting inventory alongside `@cora-framework/characters` on the same kernel wires the real active-character gate with no manual `isActiveCharacter` callback required. The explicit `isActiveCharacter` option still takes priority when provided, and the allow-all fallback (now logged once as a `"warn"`) still applies when neither the option nor the service is available.

### Patch Changes

- Updated dependencies [05446e6]
  - @cora-framework/core@0.3.0

## 0.1.0

### Minor Changes

- bcb4635: Add `@cora-framework/inventory`, the second official CORA roleplay module: a server-authoritative, character-bound slot inventory with a code-defined, zod-validated item catalog, a transactional operations engine (stack-fill placement, all-or-nothing weight checks, deterministic merge-bounded moves, bounded splits, category-based equip with automatic same-category swap), a `cora.inventory.*` RPC surface with a shared typed error union (`get`/`move`/`split`/`give`/`remove`/`equip`, `give` gated by the `cora.inventory.give` permission rather than `isActiveCharacter` for admin tooling), a click-select `InventoryGrid` React component published under `./ui` with its own `./ui/inventory-grid.css` stylesheet whose slots are label-driven from the server-resolved `InventorySlot.label`, and a compile-only sketch of the future browser-relay client wiring including the experimental native equip-mirror bridge. Decoupled from `@cora-framework/characters` via an `isActiveCharacter` callback rather than a hard dependency.
