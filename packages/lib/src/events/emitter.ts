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
      unsubscribe()
      handler(...args)
    }
    const unsubscribe = this.on(event, wrapped)
    return unsubscribe
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.listeners.get(event)?.delete(handler as Handler<Events[keyof Events]>)
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
      return
    }
    this.listeners.delete(event)
  }
}
