import { describe, expect, it } from "vitest"
import { createTestPlatform } from "./testing.js"

describe("createTestPlatform", () => {
  it("round-trips platform events through the platform's own emitter", () => {
    const { platform, emit } = createTestPlatform()
    const received: unknown[] = []
    platform.events.on("playerConnected", (player) => {
      received.push(player)
    })

    emit("playerConnected", { id: 1, name: "Alice" })

    expect(received).toEqual([{ id: 1, name: "Alice" }])
  })

  it("registers and invokes an rpc handler", async () => {
    const { platform, invokeRpc } = createTestPlatform()
    platform.registerRpcHandler("cora.test.echo", async (input, playerId) => {
      return { input, playerId }
    })

    const result = await invokeRpc("cora.test.echo", { hello: "world" }, 7)

    expect(result).toEqual({ input: { hello: "world" }, playerId: 7 })
  })

  it("rejects invokeRpc for an unregistered handler name with a clear error", async () => {
    const { invokeRpc } = createTestPlatform()

    await expect(invokeRpc("cora.test.missing", {}, 1)).rejects.toThrow(
      /cora\.test\.missing/,
    )
  })

  it("throws when registering a duplicate rpc handler name", () => {
    const { platform } = createTestPlatform()
    platform.registerRpcHandler("cora.test.dup", async () => undefined)

    expect(() =>
      platform.registerRpcHandler("cora.test.dup", async () => undefined),
    ).toThrow(/cora\.test\.dup/)
  })

  it("records client calls made via callClient", async () => {
    const { platform, clientCalls } = createTestPlatform()

    await platform.callClient(3, "cora.test.notify", { message: "hi" })

    expect(clientCalls).toEqual([
      { playerId: 3, name: "cora.test.notify", payload: { message: "hi" } },
    ])
  })

  it("records log calls", () => {
    const { platform, logs } = createTestPlatform()

    platform.log("warn", "something happened")

    expect(logs).toEqual([{ level: "warn", message: "something happened" }])
  })
})
