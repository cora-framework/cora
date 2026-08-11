import { createTestDatabase, defineMigrations } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import { createTestPlatform } from "../adapter/testing.js"
import type { CoraPlayer } from "../adapter/types.js"
import { defineModule } from "../modules/define-module.js"
import { createKernel } from "./kernel.js"

describe("createKernel", () => {
  it("boots two modules, applies their migrations, and reports no disabled modules", async () => {
    const { platform } = createTestPlatform()
    const db = createTestDatabase()

    const moduleA = defineModule({
      id: "module-a",
      migrations: defineMigrations("module-a", [
        {
          sequence: 1,
          name: "create-widgets",
          up: async (trx) => {
            await trx.schema
              .createTable("widgets")
              .addColumn("id", "integer")
              .execute()
          },
        },
      ]),
      register(ctx) {
        ctx.log("info", "module-a registered")
      },
    })
    const moduleB = defineModule({
      id: "module-b",
      register(ctx) {
        ctx.log("info", "module-b registered")
      },
    })

    const kernel = await createKernel({
      platform,
      db,
      modules: [moduleA, moduleB],
    })

    expect(kernel.disabledModules).toEqual([])

    const tables = await db.introspection.getTables()
    expect(tables.some((table) => table.name === "widgets")).toBe(true)

    await kernel.shutdown()
  })

  it("disables a module whose register() throws, rolling back its hooks and rpc while other modules stay alive", async () => {
    const { platform, emit, invokeRpc, logs } = createTestPlatform()
    const db = createTestDatabase()

    const goodEvents: CoraPlayer[] = []
    const badEvents: CoraPlayer[] = []

    const goodModule = defineModule({
      id: "good-module",
      register(ctx) {
        ctx.hooks.onPlayerConnected((player) => {
          goodEvents.push(player)
        })
        ctx.platform.registerRpcHandler("cora.good.ping", async () => "pong")
      },
    })
    const badModule = defineModule({
      id: "bad-module",
      // async register() that registers a hook and an rpc handler before
      // rejecting - exercises rollback of an async failure, not just sync.
      async register(ctx) {
        ctx.hooks.onPlayerConnected((player) => {
          badEvents.push(player)
        })
        ctx.platform.registerRpcHandler("cora.bad.ping", async () => "pong")
        await Promise.resolve()
        throw new Error("boom during register")
      },
    })

    const kernel = await createKernel({
      platform,
      db,
      modules: [goodModule, badModule],
    })

    expect(kernel.disabledModules).toEqual(["bad-module"])
    expect(
      logs.some(
        (entry) =>
          entry.level === "error" && entry.message.includes("bad-module"),
      ),
    ).toBe(true)

    emit("playerConnected", { id: 1, name: "Alice" })

    expect(goodEvents).toEqual([{ id: 1, name: "Alice" }])
    expect(badEvents).toEqual([])

    await expect(invokeRpc("cora.bad.ping", {}, 1)).rejects.toThrow(
      /cora\.bad\.ping/,
    )
    await expect(invokeRpc("cora.good.ping", {}, 1)).resolves.toBe("pong")

    await kernel.shutdown()
  })

  it("throws at boot when two modules share the same id", async () => {
    const { platform } = createTestPlatform()
    const db = createTestDatabase()

    const moduleA = defineModule({ id: "duplicate", register() {} })
    const moduleB = defineModule({ id: "duplicate", register() {} })

    await expect(
      createKernel({ platform, db, modules: [moduleA, moduleB] }),
    ).rejects.toThrow(/duplicate/)
  })

  it("fans out one platform event to every module handler, isolating a throwing handler", async () => {
    const { platform, emit, logs } = createTestPlatform()
    const db = createTestDatabase()
    const calls: string[] = []

    const moduleA = defineModule({
      id: "module-a",
      register(ctx) {
        ctx.hooks.onPlayerConnected(() => {
          calls.push("a")
          throw new Error("a boom")
        })
      },
    })
    const moduleB = defineModule({
      id: "module-b",
      register(ctx) {
        ctx.hooks.onPlayerConnected(() => {
          calls.push("b")
        })
      },
    })

    const kernel = await createKernel({
      platform,
      db,
      modules: [moduleA, moduleB],
    })

    emit("playerConnected", { id: 1, name: "Alice" })

    expect(calls).toEqual(["a", "b"])
    expect(
      logs.some(
        (entry) =>
          entry.level === "error" && entry.message.includes("module-a"),
      ),
    ).toBe(true)

    await kernel.shutdown()
  })

  it("shutdown unsubscribes kernel-level event subscriptions", async () => {
    const { platform, emit } = createTestPlatform()
    const db = createTestDatabase()
    const calls: CoraPlayer[] = []

    const moduleA = defineModule({
      id: "module-a",
      register(ctx) {
        ctx.hooks.onPlayerConnected((player) => calls.push(player))
      },
    })

    const kernel = await createKernel({ platform, db, modules: [moduleA] })
    await kernel.shutdown()

    emit("playerConnected", { id: 1, name: "Alice" })

    expect(calls).toEqual([])
    expect(platform.events.listenerCount("playerConnected")).toBe(0)
  })

  it("rolls back a subscription made directly via ctx.platform.events.on when register() throws", async () => {
    const { platform, emit } = createTestPlatform()
    const db = createTestDatabase()
    const calls: CoraPlayer[] = []

    const badModule = defineModule({
      id: "bad-module",
      register(ctx) {
        ctx.platform.events.on("playerConnected", (player) => {
          calls.push(player)
        })
        throw new Error("boom during register")
      },
    })

    const kernel = await createKernel({ platform, db, modules: [badModule] })

    expect(kernel.disabledModules).toEqual(["bad-module"])

    emit("playerConnected", { id: 1, name: "Alice" })

    expect(calls).toEqual([])
  })

  it("removes a subscription made via ctx.platform.events.once on shutdown", async () => {
    const { platform, emit } = createTestPlatform()
    const db = createTestDatabase()
    const calls: CoraPlayer[] = []

    const moduleA = defineModule({
      id: "module-a",
      register(ctx) {
        ctx.platform.events.once("playerConnected", (player) => {
          calls.push(player)
        })
      },
    })

    const kernel = await createKernel({ platform, db, modules: [moduleA] })
    await kernel.shutdown()

    emit("playerConnected", { id: 1, name: "Alice" })

    expect(calls).toEqual([])
  })

  it("prefixes ctx.platform.log identically to ctx.log", async () => {
    const { platform, logs } = createTestPlatform()
    const db = createTestDatabase()

    const moduleA = defineModule({
      id: "module-a",
      register(ctx) {
        ctx.log("info", "via ctx.log")
        ctx.platform.log("info", "via ctx.platform.log")
      },
    })

    const kernel = await createKernel({ platform, db, modules: [moduleA] })

    expect(logs).toContainEqual({
      level: "info",
      message: "[module-a] via ctx.log",
    })
    expect(logs).toContainEqual({
      level: "info",
      message: "[module-a] via ctx.platform.log",
    })

    await kernel.shutdown()
  })
})
