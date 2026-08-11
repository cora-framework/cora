import type { CoraDb } from "@cora-framework/db"
import { runMigrations } from "@cora-framework/db"
import { createLocale, type Locale } from "@cora-framework/lib"
import type { CoraPlatform, PlatformEvents } from "../adapter/types.js"
import type {
  CoraModule,
  CoraModuleContext,
  HookUnsubscribe,
  KernelHooks,
  ModulePlatform,
} from "../modules/define-module.js"

export type {
  CoraModule,
  CoraModuleContext,
  HookUnsubscribe,
  KernelHooks,
  ModulePlatform,
  ModulePlatformEvents,
} from "../modules/define-module.js"

type EventName = keyof PlatformEvents

const EVENT_NAMES: EventName[] = [
  "playerConnected",
  "playerDisconnected",
  "playerDeath",
  "damage",
  "resourceStop",
]

interface HookEntry {
  moduleId: string
  handler: (...args: unknown[]) => void
}

interface RpcEntry {
  moduleId: string
  handler: (input: unknown, playerId: number) => Promise<unknown>
}

type HookRegistry = Record<EventName, HookEntry[]>

function emptyHookRegistry(): HookRegistry {
  return {
    playerConnected: [],
    playerDisconnected: [],
    playerDeath: [],
    damage: [],
    resourceStop: [],
  }
}

/**
 * Builds the `KernelHooks` object handed to a single module. Every
 * registration is recorded both in the shared `registry` (so the kernel's
 * fan-out dispatcher can find it) and in `moduleUnsubscribes` (so a failed
 * module's registrations can all be rolled back in one pass).
 */
function createHooksForModule(
  moduleId: string,
  registry: HookRegistry,
  moduleUnsubscribes: HookUnsubscribe[],
): KernelHooks {
  function register<K extends EventName>(
    event: K,
    handler: (...args: PlatformEvents[K]) => void,
  ): HookUnsubscribe {
    const entry: HookEntry = {
      moduleId,
      handler: handler as (...args: unknown[]) => void,
    }
    let list = registry[event]
    if (!list) {
      list = []
      registry[event] = list
    }
    list.push(entry)

    const unsubscribe: HookUnsubscribe = () => {
      const index = list.indexOf(entry)
      if (index !== -1) list.splice(index, 1)
    }
    moduleUnsubscribes.push(unsubscribe)
    return unsubscribe
  }

  return {
    onPlayerConnected: (handler) => register("playerConnected", handler),
    onPlayerDisconnected: (handler) => register("playerDisconnected", handler),
    onPlayerDeath: (handler) => register("playerDeath", handler),
    onDamage: (handler) => register("damage", handler),
    onResourceStop: (handler) => register("resourceStop", handler),
  }
}

/**
 * Builds the per-module `ModulePlatform` facade. It delegates everything to
 * the real platform except:
 *
 * - `registerRpcHandler`: registrations are recorded in the shared
 *   `rpcTable` (keyed by rpc name, so duplicate registration across modules
 *   still throws exactly like the real platform), and the kernel installs
 *   at most one real dispatcher per rpc name on the underlying platform.
 *   That dispatcher looks the entry up in `rpcTable` on every call, so
 *   removing the entry (module rollback, or shutdown) makes the name stop
 *   dispatching without ever needing an `unregister` capability on
 *   `CoraPlatform` itself. Names this module successfully registers are
 *   also pushed onto `moduleRpcNames` for rollback.
 * - `events`: `on`/`once` subscribe on the real platform's emitter but push
 *   the returned unsubscribe into `moduleUnsubscribes`, the same rollback
 *   list `ctx.hooks` registrations use. That is what lets a module's direct
 *   `ctx.platform.events.on(...)` subscriptions be rolled back on a failed
 *   register() and torn down on kernel shutdown, not just its `ctx.hooks`
 *   registrations. `off` delegates straight through (idempotent either
 *   way); `emit` is intentionally not exposed - see `ModulePlatformEvents`.
 * - `log`: prefixed with `[moduleId]`, identically to `ctx.log`.
 */
function wrapPlatformForModule(
  moduleId: string,
  platform: CoraPlatform,
  rpcTable: Map<string, RpcEntry>,
  dispatchedRpcNames: Set<string>,
  moduleRpcNames: string[],
  moduleUnsubscribes: HookUnsubscribe[],
): ModulePlatform {
  return {
    events: {
      on(event, handler) {
        const unsubscribe = platform.events.on(event, handler)
        moduleUnsubscribes.push(unsubscribe)
        return unsubscribe
      },
      once(event, handler) {
        const unsubscribe = platform.events.once(event, handler)
        moduleUnsubscribes.push(unsubscribe)
        return unsubscribe
      },
      off(event, handler) {
        platform.events.off(event, handler)
      },
    },
    callClient: (playerId, name, payload) =>
      platform.callClient(playerId, name, payload),
    log: (level, message) => platform.log(level, `[${moduleId}] ${message}`),
    registerRpcHandler(name, handler) {
      if (rpcTable.has(name)) {
        throw new Error(`rpc handler "${name}" is already registered`)
      }
      rpcTable.set(name, { moduleId, handler })
      moduleRpcNames.push(name)

      if (!dispatchedRpcNames.has(name)) {
        dispatchedRpcNames.add(name)
        platform.registerRpcHandler(name, async (input, playerId) => {
          const entry = rpcTable.get(name)
          if (!entry) {
            throw new Error(`no rpc handler registered for "${name}"`)
          }
          return entry.handler(input, playerId)
        })
      }
    },
  }
}

export interface CreateKernelOptions {
  platform: CoraPlatform
  db: CoraDb
  locale?: Locale
  modules: CoraModule[]
}

export interface Kernel {
  shutdown(): Promise<void>
  disabledModules: string[]
}

/**
 * Boots the kernel: validates module ids are unique, runs every module's
 * migrations, then registers modules one at a time against a per-module
 * context (wrapped hooks + rpc facade, prefixed logger, shared db/locale).
 *
 * Fatal boot errors (duplicate ids, migration failure) throw synchronously
 * out of this function - there is no partial kernel to hand back. A module
 * whose `register()` throws (sync or async) is instead non-fatal: it is
 * logged via `platform.log("error", ...)`, listed in `disabledModules`, and
 * every hook subscription, direct `ctx.platform.events` subscription, and
 * rpc registration it made before throwing is rolled back. Boot then
 * continues with the remaining modules.
 */
export async function createKernel(
  options: CreateKernelOptions,
): Promise<Kernel> {
  const { platform, db, modules } = options
  const locale =
    options.locale ?? createLocale({ locales: { en: {} }, fallback: "en" })

  const seenIds = new Set<string>()
  for (const module of modules) {
    if (seenIds.has(module.id)) {
      throw new Error(
        `Kernel boot failed: duplicate module id "${module.id}" registered`,
      )
    }
    seenIds.add(module.id)
  }

  // All modules' migrations run together, before any module's register() is
  // called, regardless of which module (if any) later fails to register.
  // Migrations are forward-only (see `@cora-framework/db`'s `runMigrations`)
  // and intentionally NOT rolled back if a later module is disabled: a
  // disabled module's tables/columns simply go unused rather than being
  // torn down, which keeps boot deterministic and avoids re-running
  // destructive migration logic on every restart.
  const allMigrations = modules.flatMap((module) => module.migrations ?? [])
  const migrationResult = await runMigrations(db, allMigrations)
  if (!migrationResult.ok) {
    throw new Error(
      `Kernel boot failed while running module migrations: ${migrationResult.error}`,
    )
  }

  const hookRegistry = emptyHookRegistry()
  const rpcTable = new Map<string, RpcEntry>()
  const dispatchedRpcNames = new Set<string>()

  function dispatch(eventName: EventName, args: unknown[]): void {
    for (const entry of [...(hookRegistry[eventName] ?? [])]) {
      try {
        entry.handler(...args)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        platform.log(
          "error",
          `module "${entry.moduleId}" handler for event "${eventName}" threw: ${message}`,
        )
      }
    }
  }

  const kernelUnsubscribes: Array<() => void> = [
    platform.events.on("playerConnected", (...args) =>
      dispatch("playerConnected", args),
    ),
    platform.events.on("playerDisconnected", (...args) =>
      dispatch("playerDisconnected", args),
    ),
    platform.events.on("playerDeath", (...args) =>
      dispatch("playerDeath", args),
    ),
    platform.events.on("damage", (...args) => dispatch("damage", args)),
    platform.events.on("resourceStop", (...args) =>
      dispatch("resourceStop", args),
    ),
  ]

  const disabledModules: string[] = []
  // Accumulates every hook/platform-events unsubscribe from modules that
  // registered successfully, so shutdown() can tear all of them down. A
  // failed module's own unsubscribes are handled inline in the catch block
  // below instead and never added here.
  const allModuleUnsubscribes: HookUnsubscribe[] = []

  for (const module of modules) {
    const moduleHookUnsubscribes: HookUnsubscribe[] = []
    const moduleRpcNames: string[] = []

    const hooks = createHooksForModule(
      module.id,
      hookRegistry,
      moduleHookUnsubscribes,
    )
    const wrappedPlatform = wrapPlatformForModule(
      module.id,
      platform,
      rpcTable,
      dispatchedRpcNames,
      moduleRpcNames,
      moduleHookUnsubscribes,
    )

    const ctx: CoraModuleContext = {
      db,
      platform: wrappedPlatform,
      hooks,
      log(level, message) {
        platform.log(level, `[${module.id}] ${message}`)
      },
      locale,
    }

    try {
      await module.register(ctx)
      allModuleUnsubscribes.push(...moduleHookUnsubscribes)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      platform.log(
        "error",
        `module "${module.id}" failed to register and has been disabled: ${message}`,
      )
      disabledModules.push(module.id)

      for (const unsubscribe of moduleHookUnsubscribes) unsubscribe()
      for (const name of moduleRpcNames) rpcTable.delete(name)
    }
  }

  return {
    disabledModules,
    async shutdown() {
      for (const unsubscribe of kernelUnsubscribes) unsubscribe()
      for (const unsubscribe of allModuleUnsubscribes) unsubscribe()
      for (const eventName of EVENT_NAMES) hookRegistry[eventName] = []
      rpcTable.clear()
    },
  }
}
