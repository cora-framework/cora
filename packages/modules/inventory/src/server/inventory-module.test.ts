import { createKernel, createTestPlatform } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import { defineItemCatalog } from "../catalog.js"
import { CORA_INVENTORY_GET, type GetInventoryResult } from "../contract.js"
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
])

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

  it("registers cora.inventory.get and returns an empty stub inventory", async () => {
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
