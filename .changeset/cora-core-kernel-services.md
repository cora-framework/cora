---
"@cora-framework/core": minor
---

Add a typed kernel service registry (`ctx.services`, `defineServiceToken`, `ServiceToken`, `ServiceRegistry`, `createServiceRegistry`) that lets one module publish an implementation for a well-known contract and another module consume it lazily at call time, without either importing the other. Ships the first core-standard token, `activeCharacterProviderToken` (`ActiveCharacterProvider`), which lets character-bound modules ask whether a player currently has a given character active against the live characters module. Published as RFC 0002 (`docs/rfcs/0002-kernel-services.md`).
