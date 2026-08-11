import {
  createTestDatabase,
  runMigrations,
  withTransaction,
} from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import { defineItemCatalog } from "../catalog.js"
import type { InventorySlotsTable } from "../migrations.js"
import { inventoryMigrations } from "../migrations.js"
import {
  addItem,
  equip,
  moveSlot,
  type OperationsConfig,
  removeQuantity,
  splitStack,
} from "./operations.js"

const catalog = defineItemCatalog([
  {
    id: "stim-pack",
    label: "Stim Pack",
    weight: 1,
    stackable: true,
    maxStack: 5,
    category: "consumable",
  },
  {
    id: "ammo-9mm",
    label: "9mm Ammo",
    weight: 0.1,
    stackable: true,
    maxStack: 100,
    category: "misc",
  },
  {
    id: "medium-pistol",
    label: "Medium Pistol",
    weight: 2,
    stackable: false,
    maxStack: 1,
    category: "weapon",
  },
  {
    id: "heavy-pistol",
    label: "Heavy Pistol",
    weight: 3,
    stackable: false,
    maxStack: 1,
    category: "weapon",
  },
  {
    id: "combat-jacket",
    label: "Combat Jacket",
    weight: 4,
    stackable: false,
    maxStack: 1,
    category: "gear",
  },
  {
    id: "heavy-jacket",
    label: "Heavy Jacket",
    weight: 6,
    stackable: false,
    maxStack: 1,
    category: "gear",
  },
])

const CHARACTER_ID = 1

function config(overrides: Partial<OperationsConfig> = {}): OperationsConfig {
  return { catalog, slots: 6, maxWeight: 100, ...overrides }
}

async function setupDb() {
  const db = createTestDatabase<InventorySlotsTable>()
  const result = await runMigrations(
    db as unknown as Parameters<typeof runMigrations>[0],
    inventoryMigrations,
  )
  if (!result.ok) throw new Error("migrations failed")
  return db
}

async function seedSlot(
  db: ReturnType<typeof createTestDatabase<InventorySlotsTable>>,
  slot: number,
  itemId: string,
  quantity: number,
  equipped = false,
) {
  await db
    .insertInto("inventory_slots")
    .values({
      character_id: CHARACTER_ID,
      slot,
      item_id: itemId,
      quantity,
      equipped: equipped ? 1 : 0,
    })
    .execute()
}

async function allRows(
  db: ReturnType<typeof createTestDatabase<InventorySlotsTable>>,
) {
  return db
    .selectFrom("inventory_slots")
    .selectAll()
    .where("character_id", "=", CHARACTER_ID)
    .orderBy("slot", "asc")
    .execute()
}

describe("addItem", () => {
  it("fills existing partial stacks before free slots, ascending slot order", async () => {
    const db = await setupDb()
    await seedSlot(db, 1, "stim-pack", 3)
    await seedSlot(db, 3, "stim-pack", 4)

    await withTransaction(db, async (trx) => {
      const result = await addItem(trx, config(), CHARACTER_ID, "stim-pack", 4)
      expect(result).toEqual({ ok: true })
    })

    const rows = await allRows(db)
    // slot 1 had room for 2 (3 -> 5), slot 3 had room for 1 (4 -> 5), the
    // remaining 1 unit goes to the first free slot (0).
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "stim-pack",
        quantity: 1,
        equipped: 0,
      },
      {
        character_id: CHARACTER_ID,
        slot: 1,
        item_id: "stim-pack",
        quantity: 5,
        equipped: 0,
      },
      {
        character_id: CHARACTER_ID,
        slot: 3,
        item_id: "stim-pack",
        quantity: 5,
        equipped: 0,
      },
    ])
  })

  it("skips a same-item stack that is already full", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 5)

    await withTransaction(db, async (trx) => {
      const result = await addItem(trx, config(), CHARACTER_ID, "stim-pack", 2)
      expect(result).toEqual({ ok: true })
    })

    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "stim-pack",
        quantity: 5,
        equipped: 0,
      },
      {
        character_id: CHARACTER_ID,
        slot: 1,
        item_id: "stim-pack",
        quantity: 2,
        equipped: 0,
      },
    ])
  })

  it("spreads a large quantity across multiple new free slots", async () => {
    const db = await setupDb()

    await withTransaction(db, async (trx) => {
      const result = await addItem(trx, config(), CHARACTER_ID, "stim-pack", 12)
      expect(result).toEqual({ ok: true })
    })

    const rows = await allRows(db)
    expect(rows.map((r) => r.quantity)).toEqual([5, 5, 2])
    expect(rows.map((r) => r.slot)).toEqual([0, 1, 2])
  })

  it("adds a non-stackable item as one unit per slot", async () => {
    const db = await setupDb()

    await withTransaction(db, async (trx) => {
      const result = await addItem(
        trx,
        config(),
        CHARACTER_ID,
        "medium-pistol",
        2,
      )
      expect(result).toEqual({ ok: true })
    })

    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "medium-pistol",
        quantity: 1,
        equipped: 0,
      },
      {
        character_id: CHARACTER_ID,
        slot: 1,
        item_id: "medium-pistol",
        quantity: 1,
        equipped: 0,
      },
    ])
  })

  it("returns unknown_item for an itemId not in the catalog", async () => {
    const db = await setupDb()

    const result = await withTransaction(db, (trx) =>
      addItem(trx, config(), CHARACTER_ID, "does-not-exist", 1),
    )

    expect(result).toEqual({ ok: false, error: "unknown_item" })
    expect(await allRows(db)).toEqual([])
  })

  it("rejects a non-positive quantity with invalid_input", async () => {
    const db = await setupDb()

    const result = await withTransaction(db, (trx) =>
      addItem(trx, config(), CHARACTER_ID, "stim-pack", 0),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("invalid_input")
  })

  it("returns inventory_full and changes nothing when there is no room", async () => {
    const db = await setupDb()
    const small = config({ slots: 2 })
    await seedSlot(db, 0, "ammo-9mm", 100)
    await seedSlot(db, 1, "ammo-9mm", 100)

    const result = await withTransaction(db, (trx) =>
      addItem(trx, small, CHARACTER_ID, "stim-pack", 1),
    )

    expect(result).toEqual({ ok: false, error: "inventory_full" })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "ammo-9mm",
        quantity: 100,
        equipped: 0,
      },
      {
        character_id: CHARACTER_ID,
        slot: 1,
        item_id: "ammo-9mm",
        quantity: 100,
        equipped: 0,
      },
    ])
  })

  it("accepts an add that exactly fills maxWeight", async () => {
    const db = await setupDb()
    // stim-pack weight 1, maxWeight 100 -> exactly 100 units fits.
    const small = config({ slots: 40, maxWeight: 100 })

    const result = await withTransaction(db, (trx) =>
      addItem(trx, small, CHARACTER_ID, "stim-pack", 100),
    )

    expect(result).toEqual({ ok: true })
    const rows = await allRows(db)
    const total = rows.reduce((sum, r) => sum + r.quantity, 0)
    expect(total).toBe(100)
  })

  it("rejects an add that is one unit over maxWeight and changes nothing", async () => {
    const db = await setupDb()
    const small = config({ slots: 40, maxWeight: 100 })

    const result = await withTransaction(db, (trx) =>
      addItem(trx, small, CHARACTER_ID, "stim-pack", 101),
    )

    expect(result).toEqual({ ok: false, error: "weight_exceeded" })
    expect(await allRows(db)).toEqual([])
  })

  it("checks weight against slots already occupied by other items", async () => {
    const db = await setupDb()
    const small = config({ slots: 40, maxWeight: 10 })
    // heavy-jacket weight 6 already carried; adding 5 stim-packs (weight 1
    // each) would total 11 > 10.
    await seedSlot(db, 0, "heavy-jacket", 1)

    const result = await withTransaction(db, (trx) =>
      addItem(trx, small, CHARACTER_ID, "stim-pack", 5),
    )

    expect(result).toEqual({ ok: false, error: "weight_exceeded" })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "heavy-jacket",
        quantity: 1,
        equipped: 0,
      },
    ])
  })
})

describe("removeQuantity", () => {
  it("removes a partial quantity, leaving the remainder", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 5)

    const result = await withTransaction(db, (trx) =>
      removeQuantity(trx, config(), CHARACTER_ID, 0, 2),
    )

    expect(result).toEqual({ ok: true })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "stim-pack",
        quantity: 3,
        equipped: 0,
      },
    ])
  })

  it("deletes the row when removing the exact quantity", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 5)

    const result = await withTransaction(db, (trx) =>
      removeQuantity(trx, config(), CHARACTER_ID, 0, 5),
    )

    expect(result).toEqual({ ok: true })
    expect(await allRows(db)).toEqual([])
  })

  it("returns insufficient_quantity when removing more than the stack holds", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 3)

    const result = await withTransaction(db, (trx) =>
      removeQuantity(trx, config(), CHARACTER_ID, 0, 4),
    )

    expect(result).toEqual({ ok: false, error: "insufficient_quantity" })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "stim-pack",
        quantity: 3,
        equipped: 0,
      },
    ])
  })

  it("returns slot_empty for an empty slot", async () => {
    const db = await setupDb()

    const result = await withTransaction(db, (trx) =>
      removeQuantity(trx, config(), CHARACTER_ID, 0, 1),
    )

    expect(result).toEqual({ ok: false, error: "slot_empty" })
  })

  it("returns invalid_input for an out-of-range slot", async () => {
    const db = await setupDb()

    const result = await withTransaction(db, (trx) =>
      removeQuantity(trx, config(), CHARACTER_ID, 99, 1),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("invalid_input")
  })
})

describe("moveSlot", () => {
  it("returns slot_empty when the source slot is empty", async () => {
    const db = await setupDb()

    const result = await withTransaction(db, (trx) =>
      moveSlot(trx, config(), CHARACTER_ID, 0, 1),
    )

    expect(result).toEqual({ ok: false, error: "slot_empty" })
  })

  it("moves a stack into an empty target slot", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 3)

    const result = await withTransaction(db, (trx) =>
      moveSlot(trx, config(), CHARACTER_ID, 0, 2),
    )

    expect(result).toEqual({ ok: true })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 2,
        item_id: "stim-pack",
        quantity: 3,
        equipped: 0,
      },
    ])
  })

  it("merges same-item stacks when the combined quantity fits maxStack", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 2)
    await seedSlot(db, 1, "stim-pack", 3)

    const result = await withTransaction(db, (trx) =>
      moveSlot(trx, config(), CHARACTER_ID, 0, 1),
    )

    expect(result).toEqual({ ok: true })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 1,
        item_id: "stim-pack",
        quantity: 5,
        equipped: 0,
      },
    ])
  })

  it("returns slot_occupied when a same-item merge would overflow maxStack", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 3)
    await seedSlot(db, 1, "stim-pack", 4)

    const result = await withTransaction(db, (trx) =>
      moveSlot(trx, config(), CHARACTER_ID, 0, 1),
    )

    expect(result).toEqual({ ok: false, error: "slot_occupied" })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "stim-pack",
        quantity: 3,
        equipped: 0,
      },
      {
        character_id: CHARACTER_ID,
        slot: 1,
        item_id: "stim-pack",
        quantity: 4,
        equipped: 0,
      },
    ])
  })

  it("returns slot_occupied for a different item and does not swap", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 2)
    await seedSlot(db, 1, "ammo-9mm", 10)

    const result = await withTransaction(db, (trx) =>
      moveSlot(trx, config(), CHARACTER_ID, 0, 1),
    )

    expect(result).toEqual({ ok: false, error: "slot_occupied" })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "stim-pack",
        quantity: 2,
        equipped: 0,
      },
      {
        character_id: CHARACTER_ID,
        slot: 1,
        item_id: "ammo-9mm",
        quantity: 10,
        equipped: 0,
      },
    ])
  })

  it("returns invalid_input for an out-of-range slot", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 2)

    const result = await withTransaction(db, (trx) =>
      moveSlot(trx, config(), CHARACTER_ID, 0, 99),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("invalid_input")
  })
})

describe("splitStack", () => {
  it("splits a valid quantity into an empty target slot", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 5)

    const result = await withTransaction(db, (trx) =>
      splitStack(trx, config(), CHARACTER_ID, 0, 1, 2),
    )

    expect(result).toEqual({ ok: true })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "stim-pack",
        quantity: 3,
        equipped: 0,
      },
      {
        character_id: CHARACTER_ID,
        slot: 1,
        item_id: "stim-pack",
        quantity: 2,
        equipped: 0,
      },
    ])
  })

  it("returns slot_occupied when the target slot is not empty", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 5)
    await seedSlot(db, 1, "ammo-9mm", 1)

    const result = await withTransaction(db, (trx) =>
      splitStack(trx, config(), CHARACTER_ID, 0, 1, 2),
    )

    expect(result).toEqual({ ok: false, error: "slot_occupied" })
  })

  it("returns slot_empty when the source slot is empty", async () => {
    const db = await setupDb()

    const result = await withTransaction(db, (trx) =>
      splitStack(trx, config(), CHARACTER_ID, 0, 1, 2),
    )

    expect(result).toEqual({ ok: false, error: "slot_empty" })
  })

  it("returns not_stackable for a non-stackable source item", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "medium-pistol", 1)

    const result = await withTransaction(db, (trx) =>
      splitStack(trx, config(), CHARACTER_ID, 0, 1, 1),
    )

    expect(result).toEqual({ ok: false, error: "not_stackable" })
  })

  it("returns insufficient_quantity when quantity equals the full stack", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 3)

    const result = await withTransaction(db, (trx) =>
      splitStack(trx, config(), CHARACTER_ID, 0, 1, 3),
    )

    expect(result).toEqual({ ok: false, error: "insufficient_quantity" })
    const rows = await allRows(db)
    expect(rows).toEqual([
      {
        character_id: CHARACTER_ID,
        slot: 0,
        item_id: "stim-pack",
        quantity: 3,
        equipped: 0,
      },
    ])
  })

  it("returns insufficient_quantity for a zero split quantity", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 3)

    const result = await withTransaction(db, (trx) =>
      splitStack(trx, config(), CHARACTER_ID, 0, 1, 0),
    )

    expect(result).toEqual({ ok: false, error: "insufficient_quantity" })
  })
})

describe("equip", () => {
  it("equips a weapon in an empty weapon slot", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "medium-pistol", 1)

    const result = await withTransaction(db, (trx) =>
      equip(trx, config(), CHARACTER_ID, 0),
    )

    expect(result).toEqual({ ok: true, equipped: 0, unequipped: null })
    const rows = await allRows(db)
    expect(rows[0]?.equipped).toBe(1)
  })

  it("equips a gear item", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "combat-jacket", 1)

    const result = await withTransaction(db, (trx) =>
      equip(trx, config(), CHARACTER_ID, 0),
    )

    expect(result).toEqual({ ok: true, equipped: 0, unequipped: null })
  })

  it("returns not_equippable for a consumable or misc item", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "stim-pack", 1)
    await seedSlot(db, 1, "ammo-9mm", 1)

    const stimResult = await withTransaction(db, (trx) =>
      equip(trx, config(), CHARACTER_ID, 0),
    )
    const ammoResult = await withTransaction(db, (trx) =>
      equip(trx, config(), CHARACTER_ID, 1),
    )

    expect(stimResult).toEqual({ ok: false, error: "not_equippable" })
    expect(ammoResult).toEqual({ ok: false, error: "not_equippable" })
  })

  it("returns already_equipped for a slot that is already equipped", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "medium-pistol", 1, true)

    const result = await withTransaction(db, (trx) =>
      equip(trx, config(), CHARACTER_ID, 0),
    )

    expect(result).toEqual({ ok: false, error: "already_equipped" })
  })

  it("unequips the previous item of the same category only", async () => {
    const db = await setupDb()
    await seedSlot(db, 0, "medium-pistol", 1, true)
    await seedSlot(db, 1, "combat-jacket", 1, true)
    await seedSlot(db, 2, "heavy-pistol", 1)

    const result = await withTransaction(db, (trx) =>
      equip(trx, config(), CHARACTER_ID, 2),
    )

    expect(result).toEqual({ ok: true, equipped: 2, unequipped: 0 })
    const rows = await allRows(db)
    const bySlot = new Map(rows.map((r) => [r.slot, r]))
    expect(bySlot.get(0)?.equipped).toBe(0)
    expect(bySlot.get(1)?.equipped).toBe(1)
    expect(bySlot.get(2)?.equipped).toBe(1)
  })

  it("returns slot_empty for an empty slot", async () => {
    const db = await setupDb()

    const result = await withTransaction(db, (trx) =>
      equip(trx, config(), CHARACTER_ID, 0),
    )

    expect(result).toEqual({ ok: false, error: "slot_empty" })
  })

  it("returns invalid_input for an out-of-range slot", async () => {
    const db = await setupDb()

    const result = await withTransaction(db, (trx) =>
      equip(trx, config(), CHARACTER_ID, 99),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("invalid_input")
  })
})
