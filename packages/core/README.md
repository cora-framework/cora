# @cora-framework/core

The kernel for the [CORA framework](https://github.com/cora-framework/cora) - boots a list of typed, self-contained modules against a platform-agnostic adapter, with error boundaries, lifecycle hooks, config, and permissions built in.

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

The module contract this package implements is specified in [RFC 0001](../../docs/rfcs/0001-module-api.md); read that for the full design rationale.

## Install

```sh
pnpm add @cora-framework/core @cora-framework/db @cora-framework/lib
```

## Quickstart

`createKernel` boots against a `CoraPlatform`. For tests and local development, `createTestPlatform` and `createTestDatabase` stand in for a real game process and a real database, so a kernel with modules is fully runnable with no game client attached:

```ts
import { createKernel, createTestPlatform, defineModule } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"

const { platform, emit } = createTestPlatform()
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

emit("playerConnected", { id: 1, name: "Alice" })
// -> logs "[greeter] welcome Alice"

console.log(kernel.disabledModules) // []
await kernel.shutdown()
```

A module whose `register()` throws is disabled and logged instead of crashing the boot: `kernel.disabledModules` lists its id, and everything it registered before throwing (hooks, RPC handlers, platform event subscriptions) is rolled back automatically.

## Lifecycle hooks

`ctx.hooks` (and the equivalent `ctx.platform.events`) expose exactly five stable events - the only ones validated by real-world usage in the CyberMP ecosystem today. Everything else (spawn, vehicle, streaming) is intentionally left out of this stable set until it earns the same confidence; see RFC 0001 for the full reasoning.

| Hook | Payload | Fires when |
|---|---|---|
| `onPlayerConnected(handler)` | `(player: CoraPlayer)` | A player finishes connecting to the server. |
| `onPlayerDisconnected(handler)` | `(player: CoraPlayer, reason: string)` | A player disconnects. |
| `onPlayerDeath(handler)` | `(player: CoraPlayer, killerId: number \| null)` | A player dies; `killerId` is `null` for non-player causes. |
| `onDamage(handler)` | `(targetId: number, attackerId: number \| null, amount: number)` | A damage event is applied to an entity. |
| `onResourceStop(handler)` | `()` | The hosting resource is stopping. |

Every registration method returns an unsubscribe function:

```ts
import type { CoraModuleContext } from "@cora-framework/core"

function register(ctx: CoraModuleContext) {
  const unsubscribe = ctx.hooks.onPlayerDeath((player, killerId) => {
    ctx.log("info", `${player.name} died (killer: ${killerId ?? "none"})`)
  })

  unsubscribe()
}
```

RPC handlers registered via `ctx.platform.registerRpcHandler` must be namespaced `cora.<module>.<name>` (for example `cora.characters.list`); the reserved `mp.exports` surface is never touched by CORA modules.

## Config

Declare a module's config schema with `defineConfig` and parse the kernel-provided `ctx.config` with `loadConfig`:

```ts
import { defineConfig, loadConfig, type CoraModuleContext } from "@cora-framework/core"
import { z } from "zod"

const greeterConfigSchema = defineConfig(
  z.object({
    welcomeMessage: z.string().default("welcome"),
  }),
)

function register(ctx: CoraModuleContext) {
  const result = loadConfig(greeterConfigSchema, ctx.config)
  if (!result.ok) {
    throw new Error(`invalid greeter config: ${result.error}`)
  }

  const config = result.value // { welcomeMessage: string }
}
```

The kernel never parses `config` itself - it hands the raw object passed to `createKernel({ config })` (`{}` if omitted) to every module, and each module owns its own schema.

## Permissions

`ctx.permissions` is a role-based permission facade backed by the shared database. Roles are defined with a flat list of permission strings, following the same `cora.<module>.<name>` shape as RPC names; `cora.admin.*` grants everything under `cora.admin.` (a strict subtree match, not the bare prefix itself):

```ts
import type { CoraModuleContext } from "@cora-framework/core"

async function register(ctx: CoraModuleContext) {
  await ctx.permissions.defineRole("admin", ["cora.admin.*"])
  await ctx.permissions.grantRole(1, "admin")

  const canKick = await ctx.permissions.hasPermission(1, "cora.admin.kick")
  // true - "cora.admin.*" matches "cora.admin.kick"
}
```

The kernel runs the permissions tables' own migrations (module-namespaced `"core"`, the one module id reserved by the kernel itself) before any application module registers, so `ctx.permissions` is always usable from `register()`.

## Migrations

A module declares its schema with `migrations` on the object passed to `defineModule`, built with `defineMigrations` from `@cora-framework/db`. Migrations are forward-only and checksummed - see that package's README for the full migration API. The kernel runs every module's migrations before any module's `register()` is called, so a module's tables always exist by the time it wires up hooks and RPC handlers.

## Platform adapter

The kernel and every module depend only on the `CoraPlatform` interface (`src/adapter/types.ts`) - never on the underlying game runtime directly. `createTestPlatform` (used above) is the in-memory implementation for headless tests and local development; the production adapter targets the CyberMP runtime and ships in this same package.

## CyberMP adapter

`createCyberMpPlatform()` is the real `CoraPlatform` implementation, built on `@cybermp/rpc-server@0.2.0` and `@cybermp/server-types@3.2.5` (exact pins - see `packages/core/package.json`). It is **not** exported from `@cora-framework/core`'s main entry point, so importing the kernel/types alone never pulls `@cybermp/*` into your dependency graph. Import it from the `/cybermp` subpath instead, inside a real CyberMP server resource process:

```ts
import { createCyberMpPlatform } from "@cora-framework/core/cybermp"
import { createKernel } from "@cora-framework/core"
import { createDatabase, type CoraDbConfig } from "@cora-framework/db"

function boot(dbConfig: CoraDbConfig) {
  const platform = createCyberMpPlatform()
  const db = createDatabase(dbConfig)

  return createKernel({ platform, db, modules: [] })
}
```

`createCyberMpPlatform` maps the five stable `PlatformEvents` onto the native `mp.events` bus (`playerConnected`, `playerDisconnected`, `playerDeath`, `damage`, `resourceStop`), bridges `registerRpcHandler`/`callClient` onto `@cybermp/rpc-server`'s `RpcServer.register`/`callClient`, and logs via `console` with a `[level]` prefix. It is compile-only: it typechecks against the real upstream packages, but constructing it requires a live CyberMP process (the native `mp` global injected into `globalThis`), so there is no lane-1 test for it beyond the import-boundary check - only `src/adapter/types.ts` and `createTestPlatform` are exercised headlessly. Only this file and its `src/adapter/cybermp/` submodules may import `@cybermp/*`; `src/adapter/import-boundary.test.ts` enforces that at the source-tree level.

## Experimental platform surfaces

`src/experimental/index.ts` (import from `@cora-framework/core/experimental`) holds native CyberMP surfaces that have real intended signatures but no in-game verification yet: `setNameplateText`, `createMapPin`, `removeMapPin`, `setHudElementVisible`, `grantNativeItem`, `openAppearanceEditor`. Every call throws `ExperimentalUnverifiedError` unless the `CORA_EXPERIMENTAL=1` environment variable is set, in which case it throws `NotImplementedError` instead - a fence, not an implementation. These land for real in a later CORA phase (2b/2c) once verified against a running game client.

## Exports

```ts
import {
  createKernel,
  defineModule,
  createTestPlatform,
  defineConfig,
  loadConfig,
  createPermissions,
  corePermissionsMigrations,
  type CoraModule,
  type CoraModuleContext,
  type CoraPlatform,
  type CoraPlayer,
  type PlatformEvents,
  type KernelHooks,
  type ModulePlatform,
  type ModulePlatformEvents,
  type HookUnsubscribe,
  type Kernel,
  type CreateKernelOptions,
  type Permissions,
  type TestPlatform,
} from "@cora-framework/core"
```
