type Handler<Args extends unknown[]> = (...args: Args) => void

/**
 * A minimal, strictly-typed event emitter. Each instance owns its own
 * listeners (no global singleton); create one per module that needs to
 * broadcast events.
 *
 * `emit()` dispatches over a snapshot of the listener list taken at call
 * time, so handlers added or removed during dispatch never affect the
 * current emit - only subsequent ones. If one or more handlers throw, the
 * remaining handlers still run; any collected errors are rethrown together
 * as a single `AggregateError` once dispatch completes.
 */
export class TypedEmitter<Events extends Record<string, unknown[]>> {
  private readonly listeners = new Map<
    keyof Events,
    Set<Handler<Events[keyof Events]>>
  >()

  // Maps the caller's original once() handler to the internal wrapper that
  // is actually stored in `listeners`, per event. This lets off() find and
  // remove a once()-registered handler by the reference the caller knows
  // about, even though the wrapper (not the original) is what runs.
  private readonly onceWrappers = new Map<
    keyof Events,
    Map<Handler<Events[keyof Events]>, Handler<Events[keyof Events]>>
  >()

  on<K extends keyof Events>(
    event: K,
    handler: Handler<Events[K]>,
  ): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler as Handler<Events[keyof Events]>)
    return () => this.off(event, handler)
  }

  once<K extends keyof Events>(
    event: K,
    handler: Handler<Events[K]>,
  ): () => void {
    const wrapped: Handler<Events[K]> = (...args) => {
      this.off(event, handler)
      handler(...args)
    }
    let onceMap = this.onceWrappers.get(event)
    if (!onceMap) {
      onceMap = new Map()
      this.onceWrappers.set(event, onceMap)
    }
    onceMap.set(
      handler as Handler<Events[keyof Events]>,
      wrapped as Handler<Events[keyof Events]>,
    )
    this.on(event, wrapped)
    return () => this.off(event, handler)
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    const set = this.listeners.get(event)
    set?.delete(handler as Handler<Events[keyof Events]>)

    const onceMap = this.onceWrappers.get(event)
    const wrapped = onceMap?.get(handler as Handler<Events[keyof Events]>)
    if (onceMap && wrapped !== undefined) {
      set?.delete(wrapped)
      onceMap.delete(handler as Handler<Events[keyof Events]>)
      if (onceMap.size === 0) {
        this.onceWrappers.delete(event)
      }
    }

    if (set && set.size === 0) {
      this.listeners.delete(event)
    }
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return

    const snapshot = Array.from(set)
    const errors: unknown[] = []

    for (const handler of snapshot) {
      try {
        handler(...(args as Events[keyof Events]))
      } catch (error) {
        errors.push(error)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `${errors.length} listener(s) for "${String(event)}" threw`,
      )
    }
  }

  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0
  }

  removeAllListeners(event?: keyof Events): void {
    if (event === undefined) {
      this.listeners.clear()
      this.onceWrappers.clear()
      return
    }
    this.listeners.delete(event)
    this.onceWrappers.delete(event)
  }
}
