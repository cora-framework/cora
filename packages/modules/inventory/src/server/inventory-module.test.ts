import {
  createKernel,
  createPermissions,
  createTestPlatform,
} from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import { defineItemCatalog } from "../catalog.js"
import {
  CORA_INVENTORY_EQUIP,
  CORA_INVENTORY_GET,
  CORA_INVENTORY_GIVE,
  CORA_INVENTORY_GIVE_PERMISSION,
  CORA_INVENTORY_MOVE,
  CORA_INVENTORY_REMOVE,
  CORA_INVENTORY_SPLIT,
  CORA_INVENTORY_UI_REFRESH,
  type EquipItemResult,
  type GetInventoryResult,
  type GiveItemResult,
  type MoveItemResult,
  type RemoveItemResult,
  type SplitStackResult,
} from "../contract.js"
import {
  createInventoryModule,
  DEFAULT_INVENTORY_MAX_WEIGHT,
} from "./inventory-module.js"

const catalog = defineItemCatalog([
  {
    id: "medium-pistol",
    label: "Medium Pistol",
    weight: 1.5,
    stackable: false,
    maxStack: 1,
    category: "weapon",
  },
  {
    id: "stim-pack",
    label: "Stim Pack",
    weight: 1,
    stackable: true,
    maxStack: 5,
    category: "consumable",
  },
])

const PLAYER_ID = 1
const CHARACTER_ID = 1
const OTHER_CHARACTER_ID = 2

describe("inventory module boot", () => {
  it("boots on a kernel with no disabled modules", async () => {
    const db = createTestDatabase()
    const { platform } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createInventoryModule({ catalog })],
    })

    expect(kernel.disabledModules).toEqual([])
  })

  it("registers cora.inventory.get and returns an empty inventory", async () => {
    const db = createTestDatabase()
    const { platform, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createInventoryModule({ catalog })],
    })
    expect(kernel.disabledModules).toEqual([])

    const result = (await invokeRpc(
      CORA_INVENTORY_GET,
      { characterId: 1 },
      1,
    )) as GetInventoryResult

    expect(result).toEqual({
      ok: true,
      slots: [],
      maxWeight: DEFAULT_INVENTORY_MAX_WEIGHT,
      usedWeight: 0,
    })
  })

  it("honours a configured maxWeight override", async () => {
    const db = createTestDatabase()
    const { platform, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createInventoryModule({ catalog, maxWeight: 250 })],
    })
    expect(kernel.disabledModules).toEqual([])

    const result = (await invokeRpc(
      CORA_INVENTORY_GET,
      { characterId: 1 },
      1,
    )) as GetInventoryResult

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.maxWeight).toBe(250)
    }
  })

  it("rejects malformed input at the rpc boundary with invalid_input", async () => {
    const db = createTestDatabase()
    const { platform, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createInventoryModule({ catalog })],
    })
    expect(kernel.disabledModules).toEqual([])

    const result = (await invokeRpc(
      CORA_INVENTORY_GET,
      { characterId: "not-a-number" },
      1,
    )) as GetInventoryResult

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("invalid_input")
    }
  })

  it("applies the inventory_slots migration on boot", async () => {
    const db = createTestDatabase()
    const { platform } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createInventoryModule({ catalog })],
    })
    expect(kernel.disabledModules).toEqual([])

    const rows = await db
      .selectFrom("cora_migrations")
      .selectAll()
      .where("module", "=", "inventory")
      .execute()
    expect(rows).toHaveLength(1)
  })
})

/**
 * Full rpc-flow integration tests: a real kernel boot with the inventory
 * module, a fake `isActiveCharacter` (active only for `CHARACTER_ID`), and
 * every handler invoked through `platform.invokeRpc` exactly as a real
 * client call would arrive.
 */
describe("inventory module rpc flows", () => {
  async function boot(options: { grantGivePermission?: boolean } = {}) {
    const db = createTestDatabase()
    const { platform, invokeRpc, clientCalls } = createTestPlatform()

    const isActiveCharacter = async (playerId: number, characterId: number) =>
      playerId === PLAYER_ID && characterId === CHARACTER_ID

    const kernel = await createKernel({
      platform,
      db,
      modules: [createInventoryModule({ catalog, isActiveCharacter })],
    })
    expect(kernel.disabledModules).toEqual([])

    if (options.grantGivePermission) {
      const permissions = createPermissions(db)
      const defineResult = await permissions.defineRole("inventory-admin", [
        CORA_INVENTORY_GIVE_PERMISSION,
      ])
      if (!defineResult.ok) throw new Error(defineResult.error)
      const grantResult = await permissions.grantRole(
        PLAYER_ID,
        "inventory-admin",
      )
      if (!grantResult.ok) throw new Error(grantResult.error)
    }

    return { db, invokeRpc, clientCalls }
  }

  function refreshCallsFor(
    clientCalls: { playerId: number; name: string; payload: unknown }[],
  ) {
    return clientCalls.filter((call) => call.name === CORA_INVENTORY_UI_REFRESH)
  }

  describe("get", () => {
    it("is gated by isActiveCharacter", async () => {
      const { invokeRpc, clientCalls } = await boot()

      const result = (await invokeRpc(
        CORA_INVENTORY_GET,
        { characterId: OTHER_CHARACTER_ID },
        PLAYER_ID,
      )) as GetInventoryResult

      expect(result).toEqual({ ok: false, error: "not_active_character" })
      expect(refreshCallsFor(clientCalls)).toEqual([])
    })

    it("succeeds for the active character", async () => {
      const { invokeRpc } = await boot()

      const result = (await invokeRpc(
        CORA_INVENTORY_GET,
        { characterId: CHARACTER_ID },
        PLAYER_ID,
      )) as GetInventoryResult

      expect(result.ok).toBe(true)
    })
  })

  describe("give", () => {
    it("returns permission_denied without the cora.inventory.give permission", async () => {
      const { invokeRpc, clientCalls } = await boot()

      const result = (await invokeRpc(
        CORA_INVENTORY_GIVE,
        { characterId: CHARACTER_ID, itemId: "stim-pack", quantity: 2 },
        PLAYER_ID,
      )) as GiveItemResult

      expect(result).toEqual({ ok: false, error: "permission_denied" })
      expect(refreshCallsFor(clientCalls)).toEqual([])
    })

    it("succeeds against a character that is not the caller's active one (admin tooling)", async () => {
      const { invokeRpc, clientCalls, db } = await boot({
        grantGivePermission: true,
      })

      const result = (await invokeRpc(
        CORA_INVENTORY_GIVE,
        { characterId: OTHER_CHARACTER_ID, itemId: "stim-pack", quantity: 2 },
        PLAYER_ID,
      )) as GiveItemResult

      expect(result).toEqual({ ok: true })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls)).toEqual([
        {
          playerId: PLAYER_ID,
          name: CORA_INVENTORY_UI_REFRESH,
          payload: { characterId: OTHER_CHARACTER_ID },
        },
      ])

      const rows = await db
        .selectFrom("inventory_slots")
        .selectAll()
        .where("character_id", "=", OTHER_CHARACTER_ID)
        .execute()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.quantity).toBe(2)
    })

    it("succeeds and pushes ui.refresh when granted the permission", async () => {
      const { invokeRpc, clientCalls, db } = await boot({
        grantGivePermission: true,
      })

      const result = (await invokeRpc(
        CORA_INVENTORY_GIVE,
        { characterId: CHARACTER_ID, itemId: "stim-pack", quantity: 3 },
        PLAYER_ID,
      )) as GiveItemResult

      expect(result).toEqual({ ok: true })
      // The client call is fired fire-and-forget; flush the microtask queue
      // once so the (already-resolved, in-memory) push has landed before we
      // assert on it.
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls)).toEqual([
        {
          playerId: PLAYER_ID,
          name: CORA_INVENTORY_UI_REFRESH,
          payload: { characterId: CHARACTER_ID },
        },
      ])

      const rows = await db
        .selectFrom("inventory_slots")
        .selectAll()
        .where("character_id", "=", CHARACTER_ID)
        .execute()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.quantity).toBe(3)
    })

    it("returns a typed error (unknown_item) with no ui.refresh push on failure", async () => {
      const { invokeRpc, clientCalls } = await boot({
        grantGivePermission: true,
      })

      const result = (await invokeRpc(
        CORA_INVENTORY_GIVE,
        { characterId: CHARACTER_ID, itemId: "does-not-exist", quantity: 1 },
        PLAYER_ID,
      )) as GiveItemResult

      expect(result).toEqual({ ok: false, error: "unknown_item" })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls)).toEqual([])
    })
  })

  async function give(
    invokeRpc: (
      name: string,
      input: unknown,
      playerId: number,
    ) => Promise<unknown>,
    itemId: string,
    quantity: number,
    permissions: ReturnType<typeof createPermissions>,
  ) {
    await permissions.defineRole("giver", [CORA_INVENTORY_GIVE_PERMISSION])
    await permissions.grantRole(PLAYER_ID, "giver")
    const result = (await invokeRpc(
      CORA_INVENTORY_GIVE,
      { characterId: CHARACTER_ID, itemId, quantity },
      PLAYER_ID,
    )) as GiveItemResult
    if (!result.ok) throw new Error(`seed give failed: ${result.error}`)
  }

  describe("move", () => {
    it("moves a stack and pushes ui.refresh on success", async () => {
      const { invokeRpc, clientCalls, db } = await boot()
      await give(invokeRpc, "stim-pack", 2, createPermissions(db))
      const baseline = clientCalls.length

      const result = (await invokeRpc(
        CORA_INVENTORY_MOVE,
        { characterId: CHARACTER_ID, fromSlot: 0, toSlot: 5 },
        PLAYER_ID,
      )) as MoveItemResult

      expect(result).toEqual({ ok: true })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls.slice(baseline))).toHaveLength(1)
    })

    it("returns slot_empty with no ui.refresh push on failure", async () => {
      const { invokeRpc, clientCalls } = await boot()

      const result = (await invokeRpc(
        CORA_INVENTORY_MOVE,
        { characterId: CHARACTER_ID, fromSlot: 0, toSlot: 1 },
        PLAYER_ID,
      )) as MoveItemResult

      expect(result).toEqual({ ok: false, error: "slot_empty" })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls)).toEqual([])
    })

    it("is gated by isActiveCharacter", async () => {
      const { invokeRpc, clientCalls } = await boot()

      const result = (await invokeRpc(
        CORA_INVENTORY_MOVE,
        { characterId: OTHER_CHARACTER_ID, fromSlot: 0, toSlot: 1 },
        PLAYER_ID,
      )) as MoveItemResult

      expect(result).toEqual({ ok: false, error: "not_active_character" })
      expect(refreshCallsFor(clientCalls)).toEqual([])
    })
  })

  describe("split", () => {
    it("splits a stack and pushes ui.refresh on success", async () => {
      const { invokeRpc, clientCalls, db } = await boot()
      await give(invokeRpc, "stim-pack", 4, createPermissions(db))
      const baseline = clientCalls.length

      const result = (await invokeRpc(
        CORA_INVENTORY_SPLIT,
        { characterId: CHARACTER_ID, fromSlot: 0, toSlot: 1, quantity: 2 },
        PLAYER_ID,
      )) as SplitStackResult

      expect(result).toEqual({ ok: true })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls.slice(baseline))).toHaveLength(1)
    })

    it("returns not_stackable with no ui.refresh push on failure", async () => {
      const { invokeRpc, clientCalls, db } = await boot()
      await give(invokeRpc, "medium-pistol", 1, createPermissions(db))
      const baseline = clientCalls.length

      const result = (await invokeRpc(
        CORA_INVENTORY_SPLIT,
        { characterId: CHARACTER_ID, fromSlot: 0, toSlot: 1, quantity: 1 },
        PLAYER_ID,
      )) as SplitStackResult

      expect(result).toEqual({ ok: false, error: "not_stackable" })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls.slice(baseline))).toEqual([])
    })
  })

  describe("remove", () => {
    it("removes a quantity and pushes ui.refresh on success", async () => {
      const { invokeRpc, clientCalls, db } = await boot()
      await give(invokeRpc, "stim-pack", 3, createPermissions(db))
      const baseline = clientCalls.length

      const result = (await invokeRpc(
        CORA_INVENTORY_REMOVE,
        { characterId: CHARACTER_ID, slot: 0, quantity: 1 },
        PLAYER_ID,
      )) as RemoveItemResult

      expect(result).toEqual({ ok: true })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls.slice(baseline))).toHaveLength(1)
    })

    it("returns insufficient_quantity with no ui.refresh push on failure", async () => {
      const { invokeRpc, clientCalls, db } = await boot()
      await give(invokeRpc, "stim-pack", 1, createPermissions(db))
      const baseline = clientCalls.length

      const result = (await invokeRpc(
        CORA_INVENTORY_REMOVE,
        { characterId: CHARACTER_ID, slot: 0, quantity: 5 },
        PLAYER_ID,
      )) as RemoveItemResult

      expect(result).toEqual({ ok: false, error: "insufficient_quantity" })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls.slice(baseline))).toEqual([])
    })
  })

  describe("equip", () => {
    it("equips and returns the contract's thin shape, pushing ui.refresh", async () => {
      const { invokeRpc, clientCalls, db } = await boot()
      await give(invokeRpc, "medium-pistol", 1, createPermissions(db))
      const baseline = clientCalls.length

      const result = (await invokeRpc(
        CORA_INVENTORY_EQUIP,
        { characterId: CHARACTER_ID, slot: 0 },
        PLAYER_ID,
      )) as EquipItemResult

      expect(result).toEqual({ ok: true })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls.slice(baseline))).toHaveLength(1)

      const row = await db
        .selectFrom("inventory_slots")
        .selectAll()
        .where("character_id", "=", CHARACTER_ID)
        .where("slot", "=", 0)
        .executeTakeFirst()
      expect(row?.equipped).toBe(1)
    })

    it("returns not_equippable with no ui.refresh push on failure", async () => {
      const { invokeRpc, clientCalls, db } = await boot()
      await give(invokeRpc, "stim-pack", 1, createPermissions(db))
      const baseline = clientCalls.length

      const result = (await invokeRpc(
        CORA_INVENTORY_EQUIP,
        { characterId: CHARACTER_ID, slot: 0 },
        PLAYER_ID,
      )) as EquipItemResult

      expect(result).toEqual({ ok: false, error: "not_equippable" })
      await Promise.resolve()
      expect(refreshCallsFor(clientCalls.slice(baseline))).toEqual([])
    })

    it("is gated by isActiveCharacter", async () => {
      const { invokeRpc, clientCalls } = await boot()

      const result = (await invokeRpc(
        CORA_INVENTORY_EQUIP,
        { characterId: OTHER_CHARACTER_ID, slot: 0 },
        PLAYER_ID,
      )) as EquipItemResult

      expect(result).toEqual({ ok: false, error: "not_active_character" })
      expect(refreshCallsFor(clientCalls)).toEqual([])
    })
  })
})
