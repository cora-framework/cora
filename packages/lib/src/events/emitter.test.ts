import { describe, expect, it } from "vitest"
import { TypedEmitter } from "./emitter"

interface TestEvents extends Record<string, unknown[]> {
  greet: [name: string]
  count: [n: number]
  empty: []
}

describe("TypedEmitter", () => {
  it("calls a registered handler with the emitted payload", () => {
    const emitter = new TypedEmitter<TestEvents>()
    const received: string[] = []

    emitter.on("greet", (name) => {
      received.push(name)
    })
    emitter.emit("greet", "world")

    expect(received).toEqual(["world"])
  })

  it("rejects a handler with a payload type that does not match the event", () => {
    const emitter = new TypedEmitter<TestEvents>()

    // @ts-expect-error - "greet" carries a string, not a number
    emitter.emit("greet", 42)
  })

  it("returns an unsubscribe function from on() that removes the handler", () => {
    const emitter = new TypedEmitter<TestEvents>()
    const received: string[] = []

    const unsubscribe = emitter.on("greet", (name) => {
      received.push(name)
    })
    unsubscribe()
    emitter.emit("greet", "world")

    expect(received).toEqual([])
  })

  it("fires a once() handler exactly once even when emit is called twice", () => {
    const emitter = new TypedEmitter<TestEvents>()
    let calls = 0

    emitter.once("count", () => {
      calls++
    })
    emitter.emit("count", 1)
    emitter.emit("count", 2)

    expect(calls).toBe(1)
  })

  it("returns an unsubscribe function from once() that prevents it firing", () => {
    const emitter = new TypedEmitter<TestEvents>()
    let calls = 0

    const unsubscribe = emitter.once("count", () => {
      calls++
    })
    unsubscribe()
    emitter.emit("count", 1)

    expect(calls).toBe(0)
  })

  it("removes a handler via off() so it no longer runs", () => {
    const emitter = new TypedEmitter<TestEvents>()
    let calls = 0
    const handler = () => {
      calls++
    }

    emitter.on("empty", handler)
    emitter.off("empty", handler)
    emitter.emit("empty")

    expect(calls).toBe(0)
  })

  it("dispatches over a snapshot: a handler removed during emit still runs for the current emit", () => {
    const emitter = new TypedEmitter<TestEvents>()
    const order: string[] = []

    const second = () => {
      order.push("second")
    }
    const first = () => {
      order.push("first")
      emitter.off("empty", second)
    }
    emitter.on("empty", first)
    emitter.on("empty", second)
    emitter.emit("empty")

    expect(order).toEqual(["first", "second"])
  })

  it("does not run a handler added during emit until the next emit", () => {
    const emitter = new TypedEmitter<TestEvents>()
    const order: string[] = []

    emitter.on("empty", () => {
      order.push("first")
      emitter.on("empty", () => {
        order.push("added-during-emit")
      })
    })
    emitter.emit("empty")

    expect(order).toEqual(["first"])

    emitter.emit("empty")

    expect(order).toEqual(["first", "first", "added-during-emit"])
  })

  it("runs remaining handlers after one throws, then rethrows an AggregateError carrying all errors", () => {
    const emitter = new TypedEmitter<TestEvents>()
    const ranHandlers: string[] = []
    const errorA = new Error("handler-a failed")
    const errorB = new Error("handler-b failed")

    emitter.on("empty", () => {
      ranHandlers.push("a")
      throw errorA
    })
    emitter.on("empty", () => {
      ranHandlers.push("b")
    })
    emitter.on("empty", () => {
      ranHandlers.push("c")
      throw errorB
    })

    let thrown: unknown
    try {
      emitter.emit("empty")
    } catch (e) {
      thrown = e
    }

    expect(ranHandlers).toEqual(["a", "b", "c"])
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([errorA, errorB])
  })

  it("reports the number of listeners for an event via listenerCount", () => {
    const emitter = new TypedEmitter<TestEvents>()

    expect(emitter.listenerCount("greet")).toBe(0)

    emitter.on("greet", () => {})
    emitter.on("greet", () => {})

    expect(emitter.listenerCount("greet")).toBe(2)
  })

  it("removeAllListeners(event) clears only that event's handlers", () => {
    const emitter = new TypedEmitter<TestEvents>()
    emitter.on("greet", () => {})
    emitter.on("count", () => {})

    emitter.removeAllListeners("greet")

    expect(emitter.listenerCount("greet")).toBe(0)
    expect(emitter.listenerCount("count")).toBe(1)
  })

  it("removeAllListeners() with no argument clears every event's handlers", () => {
    const emitter = new TypedEmitter<TestEvents>()
    emitter.on("greet", () => {})
    emitter.on("count", () => {})

    emitter.removeAllListeners()

    expect(emitter.listenerCount("greet")).toBe(0)
    expect(emitter.listenerCount("count")).toBe(0)
  })
})
