import type { CoraDb } from "@cora-framework/db"
import type { ItemCatalog } from "../catalog.js"
import type {
  GiveItemResult,
  InventoryErrorResult,
  MoveItemResult,
  RemoveItemResult,
  SplitStackResult,
} from "../contract.js"
import type { InventorySlotsTable } from "../migrations.js"

/** A db handle (plain or a `withTransaction` handle) scoped to the inventory schema. */
export type InventoryDb = CoraDb<InventorySlotsTable>

/**
 * The catalog and per-deployment limits every operation needs. Mirrors the
 * resolved subset of `InventoryModuleOptions` used by the rpc handlers
 * (Task 3), kept as its own type here so `operations.ts` has no dependency
 * on the module-wiring file.
 */
export interface OperationsConfig {
  catalog: ItemCatalog
  slots: number
  maxWeight: number
}

/**
 * Result of `equip`. Distinct from the contract's `EquipItemResult` (which
 * is `{ ok: true } | InventoryErrorResult`, matching the thin rpc surface):
 * the operations engine additionally reports which slot ended up equipped
 * and which slot (if any) was unequipped as a side effect, so the rpc
 * handler (Task 3) can build a richer client push without a second query.
 */
export type EquipResult =
  | { ok: true; equipped: number; unequipped: number | null }
  | InventoryErrorResult

function err(
  error: InventoryErrorResult["error"],
  details?: string,
): InventoryErrorResult {
  return details !== undefined
    ? { ok: false, error, details }
    : { ok: false, error }
}

/** Whether `slot` is a valid index for an inventory of `config.slots` slots. */
function inBounds(slot: number, config: OperationsConfig): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < config.slots
}

async function fetchSlot(db: InventoryDb, characterId: number, slot: number) {
  return db
    .selectFrom("inventory_slots")
    .selectAll()
    .where("character_id", "=", characterId)
    .where("slot", "=", slot)
    .executeTakeFirst()
}

async function fetchAllSlots(db: InventoryDb, characterId: number) {
  return db
    .selectFrom("inventory_slots")
    .selectAll()
    .where("character_id", "=", characterId)
    .orderBy("slot", "asc")
    .execute()
}

/**
 * Adds `quantity` units of `itemId` to `characterId`'s inventory.
 *
 * Placement order: existing non-full stacks of the same item first
 * (ascending slot order, filling each up to `maxStack`), then free slots in
 * ascending order (each new stack taking up to `maxStack`).
 *
 * All-or-nothing: the full placement (every slot that would be touched) and
 * the resulting total carried weight are both computed and validated before
 * any write happens. If the quantity does not fit in the available slots
 * (`inventory_full`) or would push carried weight over `config.maxWeight`
 * (`weight_exceeded`), nothing in the db changes.
 */
export async function addItem(
  db: InventoryDb,
  config: OperationsConfig,
  characterId: number,
  itemId: string,
  quantity: number,
): Promise<GiveItemResult> {
  const def = config.catalog.byId.get(itemId)
  if (!def) return err("unknown_item")
  if (!Number.isInteger(quantity) || quantity < 1) {
    return err("invalid_input", "quantity must be a positive integer")
  }

  const rows = await fetchAllSlots(db, characterId)
  const occupied = new Set(rows.map((row) => row.slot))

  let remaining = quantity
  const stackUpdates: Array<{ slot: number; newQuantity: number }> = []
  for (const row of rows) {
    if (remaining <= 0) break
    if (row.item_id !== itemId) continue
    const room = def.maxStack - row.quantity
    if (room <= 0) continue
    const delta = Math.min(room, remaining)
    stackUpdates.push({ slot: row.slot, newQuantity: row.quantity + delta })
    remaining -= delta
  }

  const newSlots: Array<{ slot: number; quantity: number }> = []
  if (remaining > 0) {
    for (let slot = 0; slot < config.slots && remaining > 0; slot++) {
      if (occupied.has(slot)) continue
      const alloc = Math.min(def.maxStack, remaining)
      newSlots.push({ slot, quantity: alloc })
      remaining -= alloc
    }
  }

  if (remaining > 0) return err("inventory_full")

  const currentWeight = rows.reduce((sum, row) => {
    const rowDef = config.catalog.byId.get(row.item_id)
    return sum + (rowDef ? row.quantity * rowDef.weight : 0)
  }, 0)
  const projectedWeight = currentWeight + quantity * def.weight
  if (projectedWeight > config.maxWeight) return err("weight_exceeded")

  for (const update of stackUpdates) {
    await db
      .updateTable("inventory_slots")
      .set({ quantity: update.newQuantity })
      .where("character_id", "=", characterId)
      .where("slot", "=", update.slot)
      .execute()
  }
  for (const created of newSlots) {
    await db
      .insertInto("inventory_slots")
      .values({
        character_id: characterId,
        slot: created.slot,
        item_id: itemId,
        quantity: created.quantity,
        equipped: 0,
      })
      .execute()
  }

  return { ok: true }
}

/**
 * Removes `quantity` units from `slot`. Deletes the row entirely when the
 * remaining quantity would reach zero (i.e. `quantity` equals the stack's
 * current quantity).
 */
export async function removeQuantity(
  db: InventoryDb,
  config: OperationsConfig,
  characterId: number,
  slot: number,
  quantity: number,
): Promise<RemoveItemResult> {
  if (!inBounds(slot, config)) return err("invalid_input", "slot out of range")
  if (!Number.isInteger(quantity) || quantity < 1) {
    return err("invalid_input", "quantity must be a positive integer")
  }

  const row = await fetchSlot(db, characterId, slot)
  if (!row) return err("slot_empty")
  if (quantity > row.quantity) return err("insufficient_quantity")

  if (quantity === row.quantity) {
    await db
      .deleteFrom("inventory_slots")
      .where("character_id", "=", characterId)
      .where("slot", "=", slot)
      .execute()
  } else {
    await db
      .updateTable("inventory_slots")
      .set({ quantity: row.quantity - quantity })
      .where("character_id", "=", characterId)
      .where("slot", "=", slot)
      .execute()
  }

  return { ok: true }
}

/**
 * Moves the stack in `from` to `to`.
 *
 * - `from` empty -> `slot_empty`.
 * - `to` empty -> plain move (the row's slot is updated in place).
 * - `to` holds the same item -> merge, but only if the combined quantity
 *   fits within the item's `maxStack`; otherwise `slot_occupied` and nothing
 *   changes (a partial merge that silently drops the remainder is not
 *   deterministic enough to be worth the extra complexity - callers that
 *   want a partial merge can split first).
 * - `to` holds a different item -> `slot_occupied`. There is no implicit
 *   swap: a caller that wants to swap two slots must move the destination
 *   stack out of the way first. This keeps `moveSlot`'s effect on the rest
 *   of the inventory limited to the two slots named, which is easier to
 *   reason about (and to test) than an implicit swap.
 *
 * A move within a single character's inventory never changes total carried
 * weight, so no weight check is performed here.
 */
export async function moveSlot(
  db: InventoryDb,
  config: OperationsConfig,
  characterId: number,
  from: number,
  to: number,
): Promise<MoveItemResult> {
  if (!inBounds(from, config) || !inBounds(to, config)) {
    return err("invalid_input", "slot out of range")
  }

  const fromRow = await fetchSlot(db, characterId, from)
  if (!fromRow) return err("slot_empty")

  if (from === to) return { ok: true }

  const toRow = await fetchSlot(db, characterId, to)

  if (!toRow) {
    await db
      .updateTable("inventory_slots")
      .set({ slot: to })
      .where("character_id", "=", characterId)
      .where("slot", "=", from)
      .execute()
    return { ok: true }
  }

  if (toRow.item_id !== fromRow.item_id) return err("slot_occupied")

  const def = config.catalog.byId.get(fromRow.item_id)
  const combined = fromRow.quantity + toRow.quantity
  if (!def || combined > def.maxStack) return err("slot_occupied")

  await db
    .updateTable("inventory_slots")
    .set({ quantity: combined })
    .where("character_id", "=", characterId)
    .where("slot", "=", to)
    .execute()
  await db
    .deleteFrom("inventory_slots")
    .where("character_id", "=", characterId)
    .where("slot", "=", from)
    .execute()

  return { ok: true }
}

/**
 * Splits `quantity` units off the stack in `from` into the (currently
 * empty) slot `to`.
 *
 * - `to` must be empty (`slot_occupied` otherwise).
 * - `from` must hold a stackable item (`not_stackable` otherwise).
 * - `quantity` must be at least 1 and strictly less than the source stack's
 *   quantity, so both the source and the new stack end up non-empty
 *   (`insufficient_quantity` otherwise).
 *
 * Weight-neutral like `moveSlot`: no weight check.
 */
export async function splitStack(
  db: InventoryDb,
  config: OperationsConfig,
  characterId: number,
  from: number,
  to: number,
  quantity: number,
): Promise<SplitStackResult> {
  if (!inBounds(from, config) || !inBounds(to, config)) {
    return err("invalid_input", "slot out of range")
  }
  if (!Number.isInteger(quantity)) {
    return err("invalid_input", "quantity must be an integer")
  }

  const fromRow = await fetchSlot(db, characterId, from)
  if (!fromRow) return err("slot_empty")

  const toRow = await fetchSlot(db, characterId, to)
  if (toRow) return err("slot_occupied")

  const def = config.catalog.byId.get(fromRow.item_id)
  if (!def?.stackable) return err("not_stackable")

  if (quantity < 1 || quantity >= fromRow.quantity) {
    return err("insufficient_quantity")
  }

  await db
    .updateTable("inventory_slots")
    .set({ quantity: fromRow.quantity - quantity })
    .where("character_id", "=", characterId)
    .where("slot", "=", from)
    .execute()
  await db
    .insertInto("inventory_slots")
    .values({
      character_id: characterId,
      slot: to,
      item_id: fromRow.item_id,
      quantity,
      equipped: 0,
    })
    .execute()

  return { ok: true }
}

/**
 * Equips the item in `slot`.
 *
 * Only `weapon` and `gear` category items are equippable
 * (`not_equippable` for `consumable`/`misc`). Equipping an already-equipped
 * slot is a no-op error (`already_equipped`) rather than silently
 * succeeding, so callers can tell the difference between "nothing to do"
 * and "this changed something".
 *
 * Equipping unequips any other equipped item of the *same* category only
 * (a character can have one equipped weapon and one equipped gear item at
 * once). The previously equipped slot, if any, is reported back so the rpc
 * handler (Task 3) can include it in its client push without a second
 * query.
 */
export async function equip(
  db: InventoryDb,
  config: OperationsConfig,
  characterId: number,
  slot: number,
): Promise<EquipResult> {
  if (!inBounds(slot, config)) return err("invalid_input", "slot out of range")

  const row = await fetchSlot(db, characterId, slot)
  if (!row) return err("slot_empty")

  const def = config.catalog.byId.get(row.item_id)
  if (!def || (def.category !== "weapon" && def.category !== "gear")) {
    return err("not_equippable")
  }
  if (row.equipped) return err("already_equipped")

  const rows = await fetchAllSlots(db, characterId)
  let unequippedSlot: number | null = null
  for (const other of rows) {
    if (!other.equipped || other.slot === slot) continue
    const otherDef = config.catalog.byId.get(other.item_id)
    if (otherDef && otherDef.category === def.category) {
      unequippedSlot = other.slot
      break
    }
  }

  if (unequippedSlot !== null) {
    await db
      .updateTable("inventory_slots")
      .set({ equipped: 0 })
      .where("character_id", "=", characterId)
      .where("slot", "=", unequippedSlot)
      .execute()
  }

  await db
    .updateTable("inventory_slots")
    .set({ equipped: 1 })
    .where("character_id", "=", characterId)
    .where("slot", "=", slot)
    .execute()

  return { ok: true, equipped: slot, unequipped: unequippedSlot }
}
