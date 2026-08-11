# RFC 0001: Module API

- Status: accepted
- Author(s): CORA core team
- Date: 2026-08-11

## Summary

`@cora-framework/core` ships a kernel that boots a list of typed, self-contained modules against a platform-agnostic adapter. Modules are plain packages that export a `CoraModule` built with `defineModule`; the kernel wires each one up with a scoped context (`CoraModuleContext`) giving access to the database, a typed platform facade, lifecycle hooks, config, permissions, locale, and logging. This RFC is the public contract module authors write against: how a module is defined, what it receives, which lifecycle events are stable, how RPC and permission names are namespaced, and how migrations integrate with boot.

## Motivation

CyberMP roleplay servers are built from many independent concerns: characters, inventory, money, jobs, and so on. Shipping these as isolated npm packages that implement one interface (`CoraModule`) rather than as tangled resource scripts gives server owners three things a monolith cannot: modules can be published, versioned, and swapped independently; a broken or half-finished module should not be able to take the whole server down; and the same module should be testable without a running game client.

That third point drives the adapter boundary (`CoraPlatform`): the kernel and every module depend only on this interface, never on `@cybermp/*` directly, so `createTestPlatform()` (see `@cora-framework/core`) can stand in for the real game process in CI.

The second point drives error boundaries: a module's `register()` runs inside a try/catch at boot. If it throws, the kernel disables that module, logs the failure, and rolls back every hook subscription and RPC handler it had registered up to that point, then continues booting the rest. One misbehaving module degrades gracefully instead of crashing the server.

## Design

### `defineModule` and `CoraModuleContext`

A module is a kebab-case id, an optional list of migrations, and a `register` function:

```ts
import { defineModule, type CoraModuleContext } from "@cora-framework/core"

export const greeterModule = defineModule({
  id: "greeter",
  register(ctx: CoraModuleContext) {
    ctx.hooks.onPlayerConnected((player) => {
      ctx.log("info", `welcome ${player.name}`)
    })
  },
})
```

`defineModule` is an identity helper: it validates `id` is kebab-case (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) and rejects the reserved id `"core"`, which the kernel itself owns for the permissions migrations described below. `register` may be sync or async; a rejected promise is treated exactly like a thrown error.

`CoraModuleContext`, as implemented in `packages/core/src/modules/define-module.ts`, is:

```ts
import type { CoraDb } from "@cora-framework/db"
import type { Locale } from "@cora-framework/lib"
import type { KernelHooks, ModulePlatform, Permissions } from "@cora-framework/core"

export interface CoraModuleContext {
  db: CoraDb
  platform: ModulePlatform
  hooks: KernelHooks
  log(level: "info" | "warn" | "error", message: string): void
  locale: Locale
  config: Record<string, unknown>
  permissions: Permissions
}
```

- `db` is the shared `CoraDb` handle passed to `createKernel({ db })`. All modules share one database; a module owns its own tables by migration-namespacing (see below).
- `platform` is `ModulePlatform`, a per-module view of `CoraPlatform` (see `packages/core/src/adapter/types.ts` for the base interface). It is identical to `CoraPlatform` except `events`, which is narrowed to an `on`/`once`/`off` surface - `emit` is intentionally not exposed, so a module cannot spoof platform events for other modules or the kernel. Every `events.on`/`once` subscription and every `registerRpcHandler` call made through `ctx.platform` is tracked by the kernel against the owning module, so it can be rolled back if `register()` throws and torn down on `shutdown()`.
- `hooks` is `KernelHooks`, described below.
- `log` is pre-prefixed with `[<module id>]` and forwards to the platform's `log`.
- `locale` is a shared `Locale` (from `@cora-framework/lib`), defaulting to an English-only fallback locale unless `createKernel({ locale })` overrides it.
- `config` is the raw object passed to `createKernel({ config })` (`{}` if omitted). The kernel does not parse or validate it; each module parses its own slice with `loadConfig` against its own zod schema (see Config below).
- `permissions` is the shared `Permissions` facade described below.

Booting a kernel with one module, wired against the in-memory test platform and an in-memory test database, looks like this:

```ts
import { createKernel, defineModule } from "@cora-framework/core"
import { createTestPlatform } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"

const { platform } = createTestPlatform()
const db = createTestDatabase()

const greeterModule = defineModule({
  id: "greeter",
  register(ctx) {
    ctx.hooks.onPlayerConnected((player) => {
      ctx.log("info", `welcome ${player.name}`)
    })
  },
})

const kernel = await createKernel({
  platform,
  db,
  modules: [greeterModule],
})

console.log(kernel.disabledModules) // []
await kernel.shutdown()
```

### Lifecycle hooks

`ctx.hooks` exposes exactly five stable registration methods, mirroring the five events on `PlatformEvents`. Each returns an unsubscribe function.

| Hook | Payload | Fires when |
|---|---|---|
| `onPlayerConnected(handler)` | `(player: CoraPlayer)` | A player finishes connecting to the server. |
| `onPlayerDisconnected(handler)` | `(player: CoraPlayer, reason: string)` | A player disconnects. |
| `onPlayerDeath(handler)` | `(player: CoraPlayer, killerId: number \| null)` | A player dies; `killerId` is `null` for non-player causes. |
| `onDamage(handler)` | `(targetId: number, attackerId: number \| null, amount: number)` | A damage event is applied to an entity. |
| `onResourceStop(handler)` | `()` | The hosting resource is stopping. |

These five are the entire stable surface. Every other candidate lifecycle signal - spawn events, vehicle events, streaming/culling events, and similar - is deliberately excluded from `PlatformEvents` and from `KernelHooks` for this release. The reason is not that those signals are unimportant; it is that only these five events are validated by real-world usage in the CyberMP ecosystem today. A hook the kernel promises as stable is a hook module authors will build persistent game logic against, and a promise the kernel cannot keep is worse than no promise at all. As spawn, vehicle, and streaming surfaces accumulate verified real-world usage, they will be promoted into `PlatformEvents`/`KernelHooks` through a future RFC; until then they belong under an `experimental` namespace, gated and clearly documented as unverified, rather than in this stable table.

The kernel subscribes to each of these five platform events exactly once and fans them out to every module handler registered for that event. If one handler throws, the kernel logs the error via `platform.log("error", ...)` and continues invoking the remaining handlers for that dispatch - one throwing hook never suppresses another module's hook for the same event.

A module may also subscribe directly on `ctx.platform.events` instead of `ctx.hooks` (both are backed by the same five events); the kernel tracks both identically for rollback and shutdown purposes.

### RPC naming

Modules register RPC handlers through `ctx.platform.registerRpcHandler(name, handler)`. Handler names must be namespaced `cora.<module>.<name>` (for example `cora.characters.list`, `cora.inventory.moveItem`). This convention keeps module RPC surfaces collision-free without the kernel needing to enforce a naming scheme at the type level, and it keeps the reserved `mp.exports` surface untouched - CORA modules never register against or shadow `mp.exports`; all CORA RPC traffic lives entirely under the `cora.` namespace, dispatched through the adapter described above.

Registering the same RPC name twice - whether from the same module or two different modules - throws synchronously; the second registration never silently shadows the first.

### Permissions

`ctx.permissions` is the `Permissions` facade (`packages/core/src/permissions/permissions.ts`):

```ts
import type { Result } from "@cora-framework/lib"

export interface Permissions {
  grantRole(playerId: number, role: string): Promise<Result<void, string>>
  revokeRole(playerId: number, role: string): Promise<Result<void, string>>
  hasPermission(playerId: number, permission: string): Promise<boolean>
  defineRole(role: string, permissions: string[]): Promise<Result<void, string>>
}
```

A role is a name plus a flat list of permission strings. Permission strings follow the same `cora.<module>.<name>` shape as RPC names (for example `cora.admin.kick`), so a module's permission surface and RPC surface read the same way. `grantRole`/`revokeRole` assign or remove a role from a player; `grantRole` fails with a `Result` error if the role was never defined via `defineRole`. `hasPermission` is true if any role granted to the player carries a permission that matches the query.

A stored permission matches a query permission if it is identical, or if it ends in `.*` and the query is a strict descendant of the prefix before the `*`. The wildcard is a subtree match, not a single-segment match: stored `cora.admin.*` matches `cora.admin.kick` and the deeper `cora.admin.kick.force`, and stored `cora.*` matches anything under `cora.` at any depth. It never matches the bare prefix without a trailing segment - stored `cora.admin.*` does not match the query `cora.admin` itself, only permissions strictly under it.

### Migrations

A module declares its schema with `migrations?: CoraMigration[]` on the object passed to `defineModule` (built with `defineMigrations` from `@cora-framework/db`, namespaced under the module's own id). Migrations are forward-only and checksummed: there is no `down()`, and an already-applied migration is skipped on subsequent boots once its checksum is verified to match. The kernel runs every module's migrations together, before any module's `register()` is called - core's own permissions migrations (`corePermissionsMigrations`, module-namespaced `"core"`) always run first, ahead of every application module, since `ctx.permissions` must be usable from any module's `register()`. Migrations are intentionally not rolled back if a later module fails to register: a disabled module's tables simply go unused rather than being torn down, which keeps boot deterministic and avoids re-running destructive migration logic on every restart.

## Drawbacks & alternatives

**DI-container approach considered and rejected.** An earlier design considered a full dependency-injection container (in the shape of InversifyJS, as used by prior CyberMP roleplay codebases) for module registration and cross-module service lookup. It was rejected in favor of the plain typed registry described above: a DI container buys flexibility CORA does not need at this stage (modules do not currently depend on each other's internals, only on the shared kernel context) at the cost of a much larger, harder-to-audit surface, decorator-driven wiring that is awkward to headlessly test, and a steeper on-ramp for module authors who just want to export an object. The simpler registry keeps `register(ctx)` as the entire contract and keeps error boundaries trivial to reason about: one function call, wrapped in one try/catch, with one rollback list.

**Single-resource vs multi-resource.** Because every CORA module ships as its own npm package with its own `register()` entry point, a server owner can compose an arbitrary set of modules into one deployed resource, rather than being forced into either a single monolithic resource (hard to version and share) or one resource per feature (duplicated boot/adapter wiring, no shared kernel context). The kernel's job is exactly that composition: it is the one place `createKernel` needs to be called, regardless of how many modules are combined into a deployment.

## Unresolved questions

- Client-context (browser/CEF-facing) surfaces are not part of this RFC. Everything a module needs on the game-client side of the platform boundary is pending real game availability and will be specified once it can be verified end-to-end rather than declared speculatively.
- A UI facade (how a module renders CEF-backed interface, as opposed to registering server-side RPC and hooks) is deliberately out of scope here. It lands with the first UI-bearing module, where a real UI flow exists to design the facade against instead of guessing at one in the abstract.
