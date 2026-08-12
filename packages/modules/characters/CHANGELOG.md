# @cora-framework/characters

## 0.2.0

### Minor Changes

- 2cb402c: The characters module now publishes the core-standard `activeCharacterProviderToken` (`ActiveCharacterProvider`) into the kernel's service registry, backed by its live `SessionManager` state (`isActiveCharacter`, `getActiveCharacterId`). Other modules (e.g. inventory) can resolve this token from `@cora-framework/core` to ask whether a player currently has a given character active, without importing characters directly. See RFC 0002 (`docs/rfcs/0002-kernel-services.md`).

### Patch Changes

- Updated dependencies [05446e6]
  - @cora-framework/core@0.3.0

## 0.1.0

### Minor Changes

- e95c698: Add `@cora-framework/characters`, the first official CORA roleplay module and the reference implementation of RFC 0001: a `cora.characters.*` RPC surface (`list`/`create`/`delete`/`select`) with zod-validated input and a shared typed error union, a `characters` table migration, a per-player session/spawn state machine driven off the five stable kernel hooks (with a connect-epoch guard against rapid reconnects), a `CharacterSelect` React component published under `./ui` with its own `./ui/character-select.css` stylesheet, and a compile-only sketch of the future browser-relay client wiring including the experimental appearance-editor bridge.

### Patch Changes

- Updated dependencies [5d52b29]
  - @cora-framework/core@0.2.1
