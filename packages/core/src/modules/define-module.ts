import type { CoraDb, CoraMigration } from "@cora-framework/db"
import type { Locale } from "@cora-framework/lib"
import type { CoraPlatform, PlatformEvents } from "../adapter/types.js"
import type { Permissions } from "../permissions/permissions.js"

/**
 * Unsubscribe function returned by every `KernelHooks` registration method.
 * Calling it removes the handler from the kernel's fan-out for that event.
 */
export type HookUnsubscribe = () => void

/**
 * The kernel's typed lifecycle hook surface, exposed to modules via
 * `CoraModuleContext.hooks`. Exactly mirrors the five stable platform
 * events (see `PlatformEvents`); anything experimental lives elsewhere.
 * Each registration method returns an unsubscribe function.
 */
export interface KernelHooks {
  onPlayerConnected(
    handler: (...args: PlatformEvents["playerConnected"]) => void,
  ): HookUnsubscribe
  onPlayerDisconnected(
    handler: (...args: PlatformEvents["playerDisconnected"]) => void,
  ): HookUnsubscribe
  onPlayerDeath(
    handler: (...args: PlatformEvents["playerDeath"]) => void,
  ): HookUnsubscribe
  onDamage(
    handler: (...args: PlatformEvents["damage"]) => void,
  ): HookUnsubscribe
  onResourceStop(
    handler: (...args: PlatformEvents["resourceStop"]) => void,
  ): HookUnsubscribe
}

/**
 * The event subscription surface exposed on `ModulePlatform.events`. Shaped
 * like the subscribe/unsubscribe half of `TypedEmitter<PlatformEvents>`,
 * but every `on`/`once` call is tracked by the kernel against the
 * registering module, so it rolls back if the module's `register()` throws
 * and is torn down on `shutdown()` exactly like `ctx.hooks` registrations.
 *
 * `emit` is deliberately not exposed here: modules must not be able to
 * spoof platform events for other modules or the kernel itself.
 */
export interface ModulePlatformEvents {
  on<K extends keyof PlatformEvents>(
    event: K,
    handler: (...args: PlatformEvents[K]) => void,
  ): HookUnsubscribe
  once<K extends keyof PlatformEvents>(
    event: K,
    handler: (...args: PlatformEvents[K]) => void,
  ): HookUnsubscribe
  off<K extends keyof PlatformEvents>(
    event: K,
    handler: (...args: PlatformEvents[K]) => void,
  ): void
}

/**
 * The per-module view of `CoraPlatform` handed to modules as
 * `CoraModuleContext.platform`. Identical to `CoraPlatform` except
 * `events`, which is narrowed to the tracked `ModulePlatformEvents`
 * surface instead of the raw `TypedEmitter`. This is a module-facing view
 * only - it does not change the `CoraPlatform` adapter contract itself.
 */
export interface ModulePlatform extends Omit<CoraPlatform, "events"> {
  events: ModulePlatformEvents
}

/**
 * Everything a module's `register()` function receives from the kernel at
 * boot. `platform` is a per-module wrapped `ModulePlatform`: it behaves like
 * the real platform, but `registerRpcHandler` calls are routed through the
 * kernel so a failing module's registrations can be rolled back, and
 * `events` is the tracked `ModulePlatformEvents` surface for the same
 * reason. `log` is pre-prefixed with the module's id, identically to
 * `platform.log`; `hooks` is pre-scoped so unsubscribing only ever affects
 * this module's own registrations.
 */
export interface CoraModuleContext {
  db: CoraDb
  platform: ModulePlatform
  hooks: KernelHooks
  log(level: "info" | "warn" | "error", message: string): void
  locale: Locale
  /**
   * The raw config record passed to `createKernel({ config })`, or `{}` if
   * none was given. The kernel does not know or care about any module's
   * config shape; a module parses its own slice with `loadConfig` from
   * `@cora-framework/core/config` against its own zod schema.
   */
  config: Record<string, unknown>
  permissions: Permissions
}

/**
 * A single CORA module: a stable kebab-case id, an optional set of
 * migrations run at boot, and a `register` function that wires the module
 * up against the kernel-provided context. `register` may be sync or async;
 * if it throws (or its returned promise rejects), the kernel disables the
 * module and rolls back everything it registered so far.
 */
export interface CoraModule {
  id: string
  migrations?: CoraMigration[]
  register(ctx: CoraModuleContext): void | Promise<void>
}

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * Identity helper that validates a module definition's id is kebab-case
 * (e.g. `"my-module"`) and returns the definition unchanged. Uniqueness
 * across modules is enforced separately, at kernel boot, since it requires
 * seeing the full module list.
 */
export function defineModule(def: CoraModule): CoraModule {
  if (!KEBAB_CASE.test(def.id)) {
    throw new TypeError(
      `Module id "${def.id}" is not valid kebab-case (expected e.g. "my-module")`,
    )
  }
  return def
}
