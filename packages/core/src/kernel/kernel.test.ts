import { createTestDatabase, defineMigrations } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import { createTestPlatform } from "../adapter/testing.js"
import type { CoraPlayer } from "../adapter/types.js"
import { defineModule } from "../modules/define-module.js"
import { defineServiceToken } from "../services/services.js"
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

  it("passes ctx.config through to modules unchanged", async () => {
    const { platform } = createTestPlatform()
    const db = createTestDatabase()
    let seenConfig: Record<string, unknown> | undefined

    const moduleA = defineModule({
      id: "module-a",
      register(ctx) {
        seenConfig = ctx.config
      },
    })

    const kernel = await createKernel({
      platform,
      db,
      modules: [moduleA],
      config: { welcomeMessage: "hi", maxPlayers: 64 },
    })

    expect(seenConfig).toEqual({ welcomeMessage: "hi", maxPlayers: 64 })

    await kernel.shutdown()
  })

  it("defaults ctx.config to an empty object when none is given", async () => {
    const { platform } = createTestPlatform()
    const db = createTestDatabase()
    let seenConfig: Record<string, unknown> | undefined

    const moduleA = defineModule({
      id: "module-a",
      register(ctx) {
        seenConfig = ctx.config
      },
    })

    const kernel = await createKernel({ platform, db, modules: [moduleA] })

    expect(seenConfig).toEqual({})

    await kernel.shutdown()
  })

  it("runs core migrations (permissions tables) before any module's migrations, and ctx.permissions works inside register()", async () => {
    const { platform } = createTestPlatform()
    const db = createTestDatabase()
    const seenTablesDuringMigration: string[] = []
    let grantedInsideRegister = false

    const moduleA = defineModule({
      id: "module-a",
      migrations: [
        {
          module: "module-a",
          sequence: 1,
          name: "check-core-tables-exist",
          async up(trx) {
            const tables = await (
              trx as unknown as typeof db
            ).introspection.getTables()
            seenTablesDuringMigration.push(...tables.map((table) => table.name))
          },
        },
      ],
      async register(ctx) {
        const defineResult = await ctx.permissions.defineRole("admin", [
          "cora.admin.*",
        ])
        if (!defineResult.ok) throw new Error(defineResult.error)

        const grantResult = await ctx.permissions.grantRole(1, "admin")
        if (!grantResult.ok) throw new Error(grantResult.error)

        grantedInsideRegister = await ctx.permissions.hasPermission(
          1,
          "cora.admin.kick",
        )
      },
    })

    const kernel = await createKernel({ platform, db, modules: [moduleA] })

    expect(kernel.disabledModules).toEqual([])
    expect(seenTablesDuringMigration).toContain("cora_roles")
    expect(seenTablesDuringMigration).toContain("cora_player_roles")
    expect(grantedInsideRegister).toBe(true)

    await kernel.shutdown()
  })

  it("hands every module the same ctx.services instance, resolved lazily at rpc-handler time regardless of module registration order", async () => {
    interface Greeter {
      greet(name: string): string
    }
    const greeterToken = defineServiceToken<Greeter>("test.greeter")

    const { platform, invokeRpc } = createTestPlatform()
    const db = createTestDatabase()

    // consumerModule registers BEFORE providerModule - proving the lookup
    // inside its rpc handler is deferred to call-time, not register()-time.
    const consumerModule = defineModule({
      id: "consumer-module",
      register(ctx) {
        ctx.platform.registerRpcHandler("test.greetSomeone", async (input) => {
          const greeter = ctx.services.get(greeterToken)
          if (!greeter) throw new Error("greeter not available")
          return greeter.greet((input as { name: string }).name)
        })
      },
    })
    const providerModule = defineModule({
      id: "provider-module",
      register(ctx) {
        ctx.services.provide(greeterToken, {
          greet: (name) => `hello ${name}`,
        })
      },
    })

    const kernel = await createKernel({
      platform,
      db,
      modules: [consumerModule, providerModule],
    })

    expect(kernel.disabledModules).toEqual([])

    await expect(
      invokeRpc("test.greetSomeone", { name: "Alice" }, 1),
    ).resolves.toBe("hello Alice")

    await kernel.shutdown()
  })

  it("documents the lazy-use contract: ctx.services.get() called during register(), before the provider has registered, returns undefined", async () => {
    interface Greeter {
      greet(name: string): string
    }
    const greeterToken = defineServiceToken<Greeter>("test.greeter-eager")

    const { platform } = createTestPlatform()
    const db = createTestDatabase()

    let seenDuringRegister: Greeter | undefined = { greet: () => "never" }

    const eagerConsumerModule = defineModule({
      id: "eager-consumer-module",
      register(ctx) {
        // Called synchronously at register()-time, before providerModule
        // (registered after it in the module list) has had a chance to
        // provide - this is the documented pitfall lazy use-time resolution
        // avoids.
        seenDuringRegister = ctx.services.get(greeterToken)
      },
    })
    const providerModule = defineModule({
      id: "provider-module",
      register(ctx) {
        ctx.services.provide(greeterToken, {
          greet: (name) => `hello ${name}`,
        })
      },
    })

    const kernel = await createKernel({
      platform,
      db,
      modules: [eagerConsumerModule, providerModule],
    })

    expect(kernel.disabledModules).toEqual([])
    expect(seenDuringRegister).toBeUndefined()

    await kernel.shutdown()
  })
})
