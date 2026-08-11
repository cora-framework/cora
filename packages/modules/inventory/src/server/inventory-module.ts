import {
  type CoraModule,
  type CoraModuleContext,
  defineModule,
} from "@cora-framework/core"
import { type CoraDb, withTransaction } from "@cora-framework/db"
import { z } from "zod"
import type { ItemCatalog } from "../catalog.js"
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
  equipItemInputSchema,
  type GetInventoryResult,
  type GiveItemResult,
  getInventoryInputSchema,
  giveItemInputSchema,
  type InventoryErrorResult,
  type InventorySlot,
  type InventoryUiRefreshPayload,
  type MoveItemResult,
  moveItemInputSchema,
  type RemoveItemResult,
  removeItemInputSchema,
  type SplitStackResult,
  splitStackInputSchema,
} from "../contract.js"
import { type InventorySlotsTable, inventoryMigrations } from "../migrations.js"
import {
  addItem,
  equip as equipOperation,
  moveSlot,
  type OperationsConfig,
  removeQuantity,
  splitStack,
} from "./operations.js"

/** Default number of slots a character's inventory has when not overridden. */
export const DEFAULT_INVENTORY_SLOTS = 40

/** Default maximum carried weight when not overridden. */
export const DEFAULT_INVENTORY_MAX_WEIGHT = 120

/**
 * Options for `createInventoryModule`.
 *
 * `isActiveCharacter` decouples this module from `@cora-framework/characters`
 * (or any other character-owning module): the inventory module binds to a
 * plain numeric `characterId` and never imports characters-module code
 * directly, so it works standalone or alongside it. If omitted, it defaults
 * to an allow-all check (every characterId is treated as active for every
 * caller) - deliberately permissive so the module is usable out of the box
 * in a single-module setup or in tests, but NOT a safe default for a
 * production deployment that also runs the characters module: wire this to
 * the characters module's session lookup (e.g.
 * `(playerId, characterId) => sessions.activeCharacterId(playerId) === characterId`)
 * so a player cannot manipulate an inventory belonging to a character they
 * are not currently playing.
 */
export interface InventoryModuleOptions {
  catalog: ItemCatalog
  slots?: number
  maxWeight?: number
  isActiveCharacter?: (
    playerId: number,
    characterId: number,
  ) => Promise<boolean>
}

type ResolvedInventoryOptions = {
  catalog: ItemCatalog
  slots: number
  maxWeight: number
  isActiveCharacter: (playerId: number, characterId: number) => Promise<boolean>
}

/**
 * Turns a zod parse failure into the shared `"invalid_input"` typed error,
 * used at the rpc boundary of every handler, matching the characters
 * module's convention.
 */
function invalidInput(error: z.ZodError): InventoryErrorResult {
  const flattened = z.flattenError(error)
  const lines: string[] = [...flattened.formErrors]
  const fieldErrors = flattened.fieldErrors as Record<
    string,
    string[] | undefined
  >
  for (const [field, messages] of Object.entries(fieldErrors)) {
    for (const message of messages ?? []) {
      lines.push(`${field}: ${message}`)
    }
  }
  return { ok: false, error: "invalid_input", details: lines.join("; ") }
}

/**
 * Builds the `cora.inventory.*` rpc handlers bound to `ctx` and the
 * resolved module options.
 *
 * Every mutating handler (move/split/give/remove/equip) wraps its
 * operations-engine call in `withTransaction` so the multi-statement work
 * inside `src/server/operations.ts` commits or rolls back as one unit. `get`
 * is read-only and does not open a transaction.
 *
 * Every player-invoked handler (including `get`) first checks
 * `isActiveCharacter(playerId, characterId)` and fails closed with
 * `not_active_character` when it returns false, so a player can never read
 * or mutate an inventory belonging to a character they are not currently
 * playing. `give` additionally requires the caller hold the
 * `cora.inventory.give` permission (checked via `ctx.permissions`), failing
 * closed with `permission_denied` otherwise - it is meant for admin/server
 * tooling, not ordinary players.
 *
 * After every successful mutation, a `cora.inventory.ui.refresh` push is
 * sent to the calling player fire-and-forget (its rejection is caught and
 * logged via `ctx.log`, never allowed to become an unhandled rejection or to
 * change the rpc result) so the client can re-fetch/re-render the affected
 * character's inventory. No push is sent when a handler returns an error.
 */
export function createInventoryHandlers(
  ctx: CoraModuleContext,
  resolvedOptions: ResolvedInventoryOptions,
) {
  const db = ctx.db as unknown as CoraDb<InventorySlotsTable>
  const operationsConfig: OperationsConfig = {
    catalog: resolvedOptions.catalog,
    slots: resolvedOptions.slots,
    maxWeight: resolvedOptions.maxWeight,
  }

  function pushRefresh(playerId: number, characterId: number): void {
    const payload: InventoryUiRefreshPayload = { characterId }
    ctx.platform
      .callClient(playerId, CORA_INVENTORY_UI_REFRESH, payload)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        ctx.log(
          "error",
          `player ${playerId}: inventory ui.refresh push failed: ${message}`,
        )
      })
  }

  return {
    async get(input: unknown, playerId: number): Promise<GetInventoryResult> {
      const parsed = getInventoryInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId } = parsed.data

      const active = await resolvedOptions.isActiveCharacter(
        playerId,
        characterId,
      )
      if (!active) return { ok: false, error: "not_active_character" }

      const rows = await db
        .selectFrom("inventory_slots")
        .selectAll()
        .where("character_id", "=", characterId)
        .orderBy("slot", "asc")
        .execute()

      const slots: InventorySlot[] = rows.map((row) => ({
        slot: row.slot,
        itemId: row.item_id,
        quantity: row.quantity,
        equipped: row.equipped !== 0,
      }))
      const usedWeight = rows.reduce((sum, row) => {
        const def = resolvedOptions.catalog.byId.get(row.item_id)
        return sum + (def ? row.quantity * def.weight : 0)
      }, 0)

      return {
        ok: true,
        slots,
        maxWeight: resolvedOptions.maxWeight,
        usedWeight,
      }
    },

    async move(input: unknown, playerId: number): Promise<MoveItemResult> {
      const parsed = moveItemInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId, fromSlot, toSlot } = parsed.data

      const active = await resolvedOptions.isActiveCharacter(
        playerId,
        characterId,
      )
      if (!active) return { ok: false, error: "not_active_character" }

      const result = await withTransaction(db, (trx) =>
        moveSlot(trx, operationsConfig, characterId, fromSlot, toSlot),
      )
      if (result.ok) pushRefresh(playerId, characterId)
      return result
    },

    async split(input: unknown, playerId: number): Promise<SplitStackResult> {
      const parsed = splitStackInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId, fromSlot, toSlot, quantity } = parsed.data

      const active = await resolvedOptions.isActiveCharacter(
        playerId,
        characterId,
      )
      if (!active) return { ok: false, error: "not_active_character" }

      const result = await withTransaction(db, (trx) =>
        splitStack(
          trx,
          operationsConfig,
          characterId,
          fromSlot,
          toSlot,
          quantity,
        ),
      )
      if (result.ok) pushRefresh(playerId, characterId)
      return result
    },

    async give(input: unknown, playerId: number): Promise<GiveItemResult> {
      const parsed = giveItemInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId, itemId, quantity } = parsed.data

      const active = await resolvedOptions.isActiveCharacter(
        playerId,
        characterId,
      )
      if (!active) return { ok: false, error: "not_active_character" }

      const permitted = await ctx.permissions.hasPermission(
        playerId,
        CORA_INVENTORY_GIVE_PERMISSION,
      )
      if (!permitted) return { ok: false, error: "permission_denied" }

      const result = await withTransaction(db, (trx) =>
        addItem(trx, operationsConfig, characterId, itemId, quantity),
      )
      if (result.ok) pushRefresh(playerId, characterId)
      return result
    },

    async remove(input: unknown, playerId: number): Promise<RemoveItemResult> {
      const parsed = removeItemInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId, slot, quantity } = parsed.data

      const active = await resolvedOptions.isActiveCharacter(
        playerId,
        characterId,
      )
      if (!active) return { ok: false, error: "not_active_character" }

      const result = await withTransaction(db, (trx) =>
        removeQuantity(trx, operationsConfig, characterId, slot, quantity),
      )
      if (result.ok) pushRefresh(playerId, characterId)
      return result
    },

    async equip(input: unknown, playerId: number): Promise<EquipItemResult> {
      const parsed = equipItemInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)
      const { characterId, slot } = parsed.data

      const active = await resolvedOptions.isActiveCharacter(
        playerId,
        characterId,
      )
      if (!active) return { ok: false, error: "not_active_character" }

      // `equipOperation` returns a richer `EquipResult` (which slot got
      // equipped and, if any, which sibling slot was unequipped as a side
      // effect) than the contract's `EquipItemResult` exposes over rpc. That
      // richer shape is consumed right here - used only to decide whether to
      // fire the refresh push - and then narrowed down to the contract's
      // `{ ok: true } | InventoryErrorResult` shape before returning, so the
      // rpc surface never leaks the internal detail.
      const result = await withTransaction(db, (trx) =>
        equipOperation(trx, operationsConfig, characterId, slot),
      )
      if (!result.ok) return result

      pushRefresh(playerId, characterId)
      return { ok: true }
    },
  }
}

/**
 * Builds the `inventory` `CoraModule`: registers the `inventory_slots`
 * table migration and every `cora.inventory.*` rpc handler
 * (get/move/split/give/remove/equip), wiring `createInventoryHandlers` to
 * the resolved options.
 */
export function createInventoryModule(
  options: InventoryModuleOptions,
): CoraModule {
  const resolvedOptions: ResolvedInventoryOptions = {
    catalog: options.catalog,
    slots: options.slots ?? DEFAULT_INVENTORY_SLOTS,
    maxWeight: options.maxWeight ?? DEFAULT_INVENTORY_MAX_WEIGHT,
    isActiveCharacter: options.isActiveCharacter ?? (async () => true),
  }

  return defineModule({
    id: "inventory",
    migrations: inventoryMigrations,
    register(ctx) {
      const handlers = createInventoryHandlers(ctx, resolvedOptions)
      ctx.platform.registerRpcHandler(CORA_INVENTORY_GET, handlers.get)
      ctx.platform.registerRpcHandler(CORA_INVENTORY_MOVE, handlers.move)
      ctx.platform.registerRpcHandler(CORA_INVENTORY_SPLIT, handlers.split)
      ctx.platform.registerRpcHandler(CORA_INVENTORY_GIVE, handlers.give)
      ctx.platform.registerRpcHandler(CORA_INVENTORY_REMOVE, handlers.remove)
      ctx.platform.registerRpcHandler(CORA_INVENTORY_EQUIP, handlers.equip)
    },
  })
}
