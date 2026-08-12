import { describe, expect, it } from "vitest"
import { createServiceRegistry, defineServiceToken } from "./services.js"

describe("createServiceRegistry", () => {
  it("provides and gets a service by token", () => {
    interface Greeter {
      greet(name: string): string
    }
    const token = defineServiceToken<Greeter>("test.greeter")
    const registry = createServiceRegistry()

    registry.provide(token, { greet: (name) => `hello ${name}` })

    expect(registry.get(token)?.greet("Alice")).toBe("hello Alice")
  })

  it("returns undefined when getting an unknown token", () => {
    interface Greeter {
      greet(name: string): string
    }
    const token = defineServiceToken<Greeter>("test.unregistered")
    const registry = createServiceRegistry()

    expect(registry.get(token)).toBeUndefined()
  })

  it("throws with the token name in the message when provided twice", () => {
    const token = defineServiceToken<number>("test.duplicate")
    const registry = createServiceRegistry()

    registry.provide(token, 1)

    expect(() => registry.provide(token, 2)).toThrow(/test\.duplicate/)
  })

  it("treats two distinct tokens with the same name as the same service for duplicate detection", () => {
    const tokenA = defineServiceToken<number>("test.shared-name")
    const tokenB = defineServiceToken<number>("test.shared-name")
    const registry = createServiceRegistry()

    registry.provide(tokenA, 1)

    expect(() => registry.provide(tokenB, 2)).toThrow(/test\.shared-name/)
  })

  it("carries the given name on the token", () => {
    const token = defineServiceToken<string>("test.named")
    expect(token.name).toBe("test.named")
  })
})
