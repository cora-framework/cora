---
"@cora-framework/characters": minor
---

Add `@cora-framework/characters`, the first official CORA roleplay module and the reference implementation of RFC 0001: a `cora.characters.*` RPC surface (`list`/`create`/`delete`/`select`) with zod-validated input and a shared typed error union, a `characters` table migration, a per-player session/spawn state machine driven off the five stable kernel hooks (with a connect-epoch guard against rapid reconnects), a `CharacterSelect` React component published under `./ui` with its own `./ui/character-select.css` stylesheet, and a compile-only sketch of the future browser-relay client wiring including the experimental appearance-editor bridge.
