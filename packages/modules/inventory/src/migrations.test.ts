import { createTestDatabase, runMigrations } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import { type InventorySlotsTable, inventoryMigrations } from "./migrations.js"

describe("inventoryMigrations", () => {
  it("applies cleanly against a fresh database", async () => {
    const db = createTestDatabase()

    const result = await runMigrations(db, inventoryMigrations)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.applied).toEqual([
        "inventory/1-create-inventory-slots-table",
      ])
    }
  })

  it("creates an inventory_slots table with a composite primary key", async () => {
    const db = createTestDatabase<InventorySlotsTable>()
    await runMigrations(
      db as unknown as Parameters<typeof runMigrations>[0],
      inventoryMigrations,
    )

    await db
      .insertInto("inventory_slots")
      .values({
        character_id: 1,
        slot: 0,
        item_id: "medium-pistol",
        quantity: 1,
        equipped: 0,
      })
      .execute()

    const row = await db
      .selectFrom("inventory_slots")
      .selectAll()
      .where("character_id", "=", 1)
      .where("slot", "=", 0)
      .executeTakeFirstOrThrow()

    expect(row.item_id).toBe("medium-pistol")
    expect(row.quantity).toBe(1)
    expect(row.equipped).toBe(0)

    // Same (character_id, slot) pair must violate the composite primary key.
    await expect(
      db
        .insertInto("inventory_slots")
        .values({
          character_id: 1,
          slot: 0,
          item_id: "stim-pack",
          quantity: 1,
          equipped: 0,
        })
        .execute(),
    ).rejects.toThrow()

    // Same character, different slot is fine.
    await db
      .insertInto("inventory_slots")
      .values({
        character_id: 1,
        slot: 1,
        item_id: "stim-pack",
        quantity: 3,
        equipped: 0,
      })
      .execute()

    const rows = await db
      .selectFrom("inventory_slots")
      .selectAll()
      .where("character_id", "=", 1)
      .orderBy("slot", "asc")
      .execute()
    expect(rows).toHaveLength(2)
  })

  it("is idempotent to re-apply against the same database", async () => {
    const db = createTestDatabase()
    await runMigrations(db, inventoryMigrations)

    const second = await runMigrations(db, inventoryMigrations)

    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(second.value.applied).toEqual([])
    }
  })
})
