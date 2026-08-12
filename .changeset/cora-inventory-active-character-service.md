---
"@cora-framework/inventory": minor
---

The inventory module now auto-resolves the "is this player currently playing this character?" check from the kernel's service registry when `isActiveCharacter` is not explicitly configured: it looks up the core-standard `activeCharacterProviderToken` (see RFC 0002, `docs/rfcs/0002-kernel-services.md`) lazily at handler call time, so booting inventory alongside `@cora-framework/characters` on the same kernel wires the real active-character gate with no manual `isActiveCharacter` callback required. The explicit `isActiveCharacter` option still takes priority when provided, and the allow-all fallback (now logged once as a `"warn"`) still applies when neither the option nor the service is available.
