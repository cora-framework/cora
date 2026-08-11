/**
 * A typed handle for a single kernel service. `name` is the registry key -
 * unique per service, namespaced by convention as `cora.<module>.<service>`
 * (see RFC 0002). `_type` is a phantom field: it never holds a real value,
 * it exists purely so `T` is inferred and checked at `provide`/`get` call
 * sites instead of erased to `unknown`.
 */
export interface ServiceToken<T> {
  readonly name: string
  readonly _type?: T
}

/**
 * Creates a `ServiceToken<T>` identified by `name`. Two tokens created with
 * the same `name` are considered the same service by `ServiceRegistry`
 * (registration is keyed on `name`, not on token identity) - `provide`ing
 * two of them against the same registry throws.
 */
export function defineServiceToken<T>(name: string): ServiceToken<T> {
  return { name }
}

/**
 * The kernel's cross-module service registry. Modules `provide` an
 * implementation for a token in `register()` and other modules `get` it -
 * typically lazily, at use-time (e.g. inside an rpc handler), so provider
 * and consumer module registration order does not matter. See
 * `docs/rfcs/0002-kernel-services.md`.
 */
export interface ServiceRegistry {
  /**
   * Registers `impl` as the implementation for `token`. Throws if a service
   * is already registered under the same token name - double-provide is a
   * boot-time programming error, not something to silently overwrite.
   */
  provide<T>(token: ServiceToken<T>, impl: T): void
  /**
   * Looks up the implementation registered for `token`, or `undefined` if
   * none has been `provide`d yet (e.g. called before the providing module's
   * `register()` has run, or the providing module was never included/was
   * disabled).
   */
  get<T>(token: ServiceToken<T>): T | undefined
}

/**
 * Builds a `ServiceRegistry` backed by a single `Map<string, unknown>`. The
 * kernel creates exactly one instance at boot and hands the same instance
 * to every module's `ctx.services` - its lifetime is the kernel's lifetime
 * (it is not cleared on `shutdown()`; a shut-down kernel is not reused).
 */
export function createServiceRegistry(): ServiceRegistry {
  const services = new Map<string, unknown>()

  return {
    provide<T>(token: ServiceToken<T>, impl: T): void {
      if (services.has(token.name)) {
        throw new Error(
          `Service "${token.name}" is already registered - each service token may only be provided once per kernel`,
        )
      }
      services.set(token.name, impl)
    },
    get<T>(token: ServiceToken<T>): T | undefined {
      // The registry's internal storage is untyped (`Map<string, unknown>`)
      // by design - `ServiceToken<T>` is the only place the type contract
      // lives. This cast is the single documented boundary where that
      // contract is trusted back into `T`.
      return services.get(token.name) as T | undefined
    },
  }
}
