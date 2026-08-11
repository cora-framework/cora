import { defineMigrations } from "@cora-framework/db"

/**
 * The `inventory_slots` table's row shape: one row per occupied slot, keyed
 * by `(character_id, slot)`. `character_id` is a plain numeric id (no
 * foreign key to a `characters` table row): the inventory module is
 * intentionally decoupled from `@cora-framework/characters` (see module
 * options docs in `src/server/inventory-module.ts`), so it does not assume
 * that table exists.
 */
export interface InventorySlotsTable {
  inventory_slots: {
    character_id: number
    slot: number
    item_id: string
    quantity: number
    equipped: number
  }
}

export const inventoryMigrations = defineMigrations("inventory", [
  {
    sequence: 1,
    name: "create-inventory-slots-table",
    async up(trx) {
      await trx.schema
        .createTable("inventory_slots")
        .addColumn("character_id", "integer", (col) => col.notNull())
        .addColumn("slot", "integer", (col) => col.notNull())
        .addColumn("item_id", "text", (col) => col.notNull())
        .addColumn("quantity", "integer", (col) => col.notNull())
        .addColumn("equipped", "integer", (col) => col.notNull().defaultTo(0))
        .addPrimaryKeyConstraint("inventory_slots_pk", ["character_id", "slot"])
        .execute()
    },
  },
])
