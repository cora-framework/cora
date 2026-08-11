import { z } from "zod"

/** RPC procedure names, namespaced `cora.inventory.*` per RFC 0001. */
export const CORA_INVENTORY_GET = "cora.inventory.get"
export const CORA_INVENTORY_MOVE = "cora.inventory.move"
export const CORA_INVENTORY_SPLIT = "cora.inventory.split"
export const CORA_INVENTORY_GIVE = "cora.inventory.give"
export const CORA_INVENTORY_REMOVE = "cora.inventory.remove"
export const CORA_INVENTORY_EQUIP = "cora.inventory.equip"

/**
 * Client-bound broadcast pushed after every successful mutating handler
 * (Task 3), telling the client to re-fetch (or re-render from) the
 * `cora.inventory.get` state for `characterId`.
 */
export const CORA_INVENTORY_UI_REFRESH = "cora.inventory.ui.refresh"

/** Permission required to invoke `cora.inventory.give` (admin/server tooling). */
export const CORA_INVENTORY_GIVE_PERMISSION = "cora.inventory.give"

/** A single occupied inventory slot, as returned by `cora.inventory.get`. */
export interface InventorySlot {
  slot: number
  itemId: string
  quantity: number
  equipped: boolean
}

/**
 * Error union shared by every `cora.inventory.*` procedure result.
 *
 * - `invalid_input`: zod boundary parse failure.
 * - `unknown_item`: itemId not present in the configured catalog.
 * - `inventory_full`: no free slot available for an add/split.
 * - `slot_empty`: an operation referenced a slot with nothing in it.
 * - `slot_occupied`: a target slot already holds a different, unmergeable stack.
 * - `not_stackable`: split (or an implicit stack merge) attempted on a
 *   non-stackable item.
 * - `insufficient_quantity`: remove/split requested more than the slot holds.
 * - `weight_exceeded`: the operation would push total carried weight over
 *   `maxWeight`.
 * - `not_active_character`: `characterId` is not the caller's currently
 *   active character per the configured `isActiveCharacter` check.
 * - `not_equippable`: equip attempted on an item outside the
 *   weapon/gear categories.
 * - `already_equipped`: equip attempted on a slot that is already equipped.
 * - `permission_denied`: caller lacks the permission required for the
 *   procedure (currently only `cora.inventory.give`).
 */
export type InventoryError =
  | "invalid_input"
  | "unknown_item"
  | "inventory_full"
  | "slot_empty"
  | "slot_occupied"
  | "not_stackable"
  | "insufficient_quantity"
  | "weight_exceeded"
  | "not_active_character"
  | "not_equippable"
  | "already_equipped"
  | "permission_denied"

export interface InventoryErrorResult {
  ok: false
  error: InventoryError
  details?: string
}

export type GetInventoryResult =
  | {
      ok: true
      slots: InventorySlot[]
      maxWeight: number
      usedWeight: number
    }
  | InventoryErrorResult

export type MoveItemResult = { ok: true } | InventoryErrorResult

export type SplitStackResult = { ok: true } | InventoryErrorResult

export type GiveItemResult = { ok: true } | InventoryErrorResult

export type RemoveItemResult = { ok: true } | InventoryErrorResult

export type EquipItemResult = { ok: true } | InventoryErrorResult

export const getInventoryInputSchema = z
  .object({
    characterId: z.number().int().positive(),
  })
  .strict()
export type GetInventoryInput = z.infer<typeof getInventoryInputSchema>

export const moveItemInputSchema = z
  .object({
    characterId: z.number().int().positive(),
    fromSlot: z.number().int().nonnegative(),
    toSlot: z.number().int().nonnegative(),
  })
  .strict()
export type MoveItemInput = z.infer<typeof moveItemInputSchema>

export const splitStackInputSchema = z
  .object({
    characterId: z.number().int().positive(),
    fromSlot: z.number().int().nonnegative(),
    toSlot: z.number().int().nonnegative(),
    quantity: z.number().int().positive(),
  })
  .strict()
export type SplitStackInput = z.infer<typeof splitStackInputSchema>

export const giveItemInputSchema = z
  .object({
    characterId: z.number().int().positive(),
    itemId: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .strict()
export type GiveItemInput = z.infer<typeof giveItemInputSchema>

export const removeItemInputSchema = z
  .object({
    characterId: z.number().int().positive(),
    slot: z.number().int().nonnegative(),
    quantity: z.number().int().positive(),
  })
  .strict()
export type RemoveItemInput = z.infer<typeof removeItemInputSchema>

export const equipItemInputSchema = z
  .object({
    characterId: z.number().int().positive(),
    slot: z.number().int().nonnegative(),
  })
  .strict()
export type EquipItemInput = z.infer<typeof equipItemInputSchema>

/** Payload of the `cora.inventory.ui.refresh` client call. */
export interface InventoryUiRefreshPayload {
  characterId: number
}
