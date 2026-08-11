# @cora-framework/characters

Multicharacter CRUD and session/spawn state machine for the [CORA framework](https://github.com/cora-framework/cora) - the first official CORA roleplay module, and the reference implementation of the `CoraModule` contract specified in [RFC 0001](../../../docs/rfcs/0001-module-api.md).

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

Lets a player own up to a handful of characters, list/create/delete them over RPC, and select one to spawn into - server-side ownership checks, a per-player session state machine on the five stable kernel hooks, and a CEF character-select UI built on `@cora-framework/ui`.

## Install

```sh
pnpm add @cora-framework/characters
```

## Server usage

`createCharactersModule()` builds a `CoraModule`: pass it to `createKernel`'s `modules` array alongside your platform and database, the same way any other CORA module boots (see `@cora-framework/core`'s README for `createTestPlatform`/`createTestDatabase` and the real `createCyberMpPlatform` adapter):

```ts
import { createKernel, createTestPlatform } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { createCharactersModule } from "@cora-framework/characters"

const { platform } = createTestPlatform()
const db = createTestDatabase()

const kernel = await createKernel({
  platform,
  db,
  modules: [createCharactersModule()],
})

console.log(kernel.disabledModules) // []
await kernel.shutdown()
```

The module registers its `characters` table migration, wires the four `cora.characters.*` RPC handlers below, and hooks `onPlayerConnected`/`onPlayerDisconnected`/`onPlayerDeath` to drive the session state machine described further down.

## RPC surface

Every procedure is namespaced `cora.characters.*` per RFC 0001 and parses its input with zod at the boundary: malformed input never throws through the RPC layer, it comes back as `{ ok: false, error: "invalid_input", details }`.

| Procedure | Input | Result | Notes |
|---|---|---|---|
| `cora.characters.list` | `{}` | `{ ok: true, characters: CharacterSummary[] }` \| error | Only the caller's own characters. |
| `cora.characters.create` | `{ name: string; appearance?: string }` | `{ ok: true, character: CharacterSummary }` \| error | `name` must pass `isValidCharacterName` (2-32 chars, `\p{L}`/space/hyphen, no leading/trailing whitespace); at most `MAX_CHARACTERS_PER_PLAYER` (4) characters per player. |
| `cora.characters.delete` | `{ characterId: number }` | `{ ok: true }` \| error | Only the owner; refuses to delete the caller's own currently-active character. |
| `cora.characters.select` | `{ characterId: number }` | `{ ok: true; characterId: number; position: CharacterPosition }` \| error | Only the owner; refuses if the caller is already in a `"playing"` session. Pushes `cora.characters.ui.close` to the client on success. |

All four share one error union (`CharactersError`, exported from the package root):

| Error | Meaning |
|---|---|
| `invalid_input` | Failed the zod boundary schema (see `details`). |
| `invalid_name` | Passed zod but failed `isValidCharacterName`. |
| `limit_reached` | Caller already owns `MAX_CHARACTERS_PER_PLAYER` characters. |
| `not_found` | `characterId` does not exist. |
| `not_owner` | `characterId` exists but is not owned by the caller. |
| `already_playing` | `select` while the caller's session is already `"playing"`. |
| `active_character` | `delete` targeting the caller's own currently-active character. |

`isValidCharacterName` is also exported from the package root so a UI can apply the exact same rule client-side before round-tripping to the server (see `CharacterSelect` below).

## Session / spawn state machine

Each connected player has an in-memory `PlayerSession` (`"connected" | "selecting" | "playing"`), tracked per kernel boot by the module's internal `SessionManager` (not persisted - a process restart implicitly disconnects everyone):

| From | Event | To | Effect |
|---|---|---|---|
| (none) | `playerConnected` | `selecting` | Session created synchronously; the caller's character list is fetched and pushed as `cora.characters.ui.open`. |
| `selecting` | `cora.characters.select` (valid, own character, not already playing) | `playing(characterId)` | `last_played_at` updated; `cora.characters.ui.close` pushed with the stored (or default `{0,0,0}`) spawn position. |
| `playing` | `cora.characters.select` | (unchanged) | Rejected with `already_playing` - no in-session character switch today. |
| `playing` | `cora.characters.delete` on the active character | (unchanged) | Rejected with `active_character`. |
| `playing` | `playerDeath` | `playing` | Left untouched; respawn handling is deferred to a later phase (depends on upstream respawn events not yet verified against a live server). |
| any | `playerDisconnected` | (cleared) | Session dropped; the character's stored position is (re)written to `null, null, null` - a placeholder, since the client does not yet report live position back to the server. |

**Epoch guard:** `playerConnected` firing a second time for the same player (a rapid reconnect) before the first connect's async character-list fetch has resolved bumps an internal "connect epoch". The stale first flow checks its epoch before pushing `cora.characters.ui.open` and skips silently if a fresher connect has already superseded it, so a reconnecting player never sees an outdated character list flash in after the current one.

## UI

`CharacterSelect` (from the `./ui` subpath, mirroring how `@cora-framework/ui` splits its React components from the server package) renders a `Menu` of the player's characters plus a "Create character" entry, a create `Dialog` with client-side name validation, and a per-character delete `Dialog` requiring confirmation. `react` is a peer dependency, exactly like `@cora-framework/ui`.

Its classnames (`cora-character-select-*`) are styled by a module-local stylesheet - `@cora-framework/ui/theme.css` only styles the generic primitives it ships itself and deliberately does not know about downstream module classnames, so import both:

```tsx
import "@cora-framework/ui/theme.css"
import "@cora-framework/characters/ui/character-select.css"
import { CharacterSelect } from "@cora-framework/characters/ui"
import type { CharacterSummary } from "@cora-framework/characters"

function CharacterGallery({
  characters,
}: {
  characters: CharacterSummary[]
}) {
  return (
    <CharacterSelect
      characters={characters}
      maxCharacters={4}
      onSelect={(id) => console.log("select", id)}
      onCreate={(name) => console.log("create", name)}
      onDelete={(id) => console.log("delete", id)}
    />
  )
}
```

`apps/harness`'s "Characters" gallery section renders `CharacterSelect` against mock data with an action log, wired the same way; see `apps/harness/src/App.tsx`.

## Client facade

`src/client/index.ts` shows the intended shape of the future browser-relay client wiring: `registerCharactersClient` builds handlers for the server-pushed `cora.characters.ui.open`/`cora.characters.ui.close` calls, and its `requestAppearanceEditor` reaches for the experimental `openAppearanceEditor` bridge from `@cora-framework/core/experimental`. It is deliberately **not** listed in the package's `exports` map (unlike `.` and `./ui`) - there is no published subpath for it, only the source file, because it is a sketch for a future client resource to build against rather than a shipped integration point:

```ts
import { registerCharactersClient } from "./index.js"
import type {
  CharactersUiClosePayload,
  CharactersUiOpenPayload,
} from "../contract.js"

const client = registerCharactersClient({
  onOpen(data: CharactersUiOpenPayload) {
    console.log("open character select", data.characters)
  },
  onClose(data: CharactersUiClosePayload) {
    console.log("spawn at", data.spawn)
  },
})

client.requestAppearanceEditor(1)
```

(This snippet uses the same relative imports as `src/client/index.ts` itself, since it lives in that source directory - see the tech-debt framing above for why there is no package-boundary import to show instead.)

**This is honestly unverified, not a working feature.** There is no live CyberMP client context available to CORA yet, so nothing in `src/client/index.ts` has been proven to run in-game: it is compile-checked only, has no runtime test coverage, and `requestAppearanceEditor` swallows whatever the experimental bridge throws (which today is always - `openAppearanceEditor` throws `ExperimentalUnverifiedError` unless `CORA_EXPERIMENTAL=1`, and `NotImplementedError` even then). Treat it as a typed sketch for the future client resource to build against, not a shipped capability.

## Player identity (tech debt)

`CharactersTable.player_license` stores the numeric CyberMP platform player id, stringified, as a placeholder for a real stable player identity. CyberMP does not yet expose a license/uuid concept upstream, so ownership checks (`not_owner`, `active_character`, per-player limits) are all keyed on this placeholder today. Swapping it for a real identity once one exists upstream is tracked as its own follow-up task, not bundled into this module.

## Exports

```ts
import {
  charactersMigrations,
  CHARACTER_NAME_MAX_LENGTH,
  CHARACTER_NAME_MIN_LENGTH,
  CHARACTER_NAME_PATTERN,
  type CharacterPosition,
  type CharacterSummary,
  type CharactersError,
  type CharactersErrorResult,
  type CharactersModuleOptions,
  type CharactersTable,
  type CharactersUiClosePayload,
  type CharactersUiOpenPayload,
  CORA_CHARACTERS_CREATE,
  CORA_CHARACTERS_DELETE,
  CORA_CHARACTERS_LIST,
  CORA_CHARACTERS_SELECT,
  CORA_CHARACTERS_UI_CLOSE,
  CORA_CHARACTERS_UI_OPEN,
  createCharactersHandlers,
  createCharactersModule,
  type CreateCharacterInput,
  type CreateCharacterResult,
  createCharacterInputSchema,
  DEFAULT_SPAWN_POSITION,
  type DeleteCharacterInput,
  type DeleteCharacterResult,
  deleteCharacterInputSchema,
  isValidCharacterName,
  type ListCharactersInput,
  type ListCharactersResult,
  listCharactersInputSchema,
  MAX_CHARACTERS_PER_PLAYER,
  type NonPlayingSession,
  type PlayerSession,
  type PlayingSession,
  SessionManager,
  type SelectCharacterInput,
  type SelectCharacterResult,
  selectCharacterInputSchema,
  type SessionStatus,
} from "@cora-framework/characters"
```

`./ui` exports `CharacterSelect`; `./ui/character-select.css` is a plain stylesheet, not a JS module.
