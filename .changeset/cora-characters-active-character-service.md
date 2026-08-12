---
"@cora-framework/characters": minor
---

The characters module now publishes the core-standard `activeCharacterProviderToken` (`ActiveCharacterProvider`) into the kernel's service registry, backed by its live `SessionManager` state (`isActiveCharacter`, `getActiveCharacterId`). Other modules (e.g. inventory) can resolve this token from `@cora-framework/core` to ask whether a player currently has a given character active, without importing characters directly. See RFC 0002 (`docs/rfcs/0002-kernel-services.md`).
