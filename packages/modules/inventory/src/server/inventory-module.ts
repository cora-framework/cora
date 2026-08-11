import {
  type CoraModule,
  type CoraModuleContext,
  defineModule,
} from "@cora-framework/core"
import { z } from "zod"
import type { ItemCatalog } from "../catalog.js"
import {
  CORA_INVENTORY_GET,
  type GetInventoryResult,
  getInventoryInputSchema,
  type InventoryErrorResult,
} from "../contract.js"
import { inventoryMigrations } from "../migrations.js"

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
 * Task 1 scope: only `get` is implemented, and only as a stub that
 * validates its input and always reports an empty inventory - it does not
 * yet read `inventory_slots`. This exists purely so the module's boot
 * integration (migrations + rpc registration wiring) is testable end to
 * end before the real operations engine (Task 2) and the remaining
 * handlers (move/split/give/remove/equip, Task 3) land. Every field on the
 * stub result (`maxWeight`, `usedWeight: 0`, `slots: []`) is intentionally
 * real-shaped so callers written against the final contract do not need to
 * change once the stub is replaced.
 */
export function createInventoryHandlers(
  _ctx: CoraModuleContext,
  resolvedOptions: Required<
    Pick<InventoryModuleOptions, "catalog" | "slots" | "maxWeight">
  >,
) {
  return {
    async get(input: unknown, _playerId: number): Promise<GetInventoryResult> {
      const parsed = getInventoryInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)

      return {
        ok: true,
        slots: [],
        maxWeight: resolvedOptions.maxWeight,
        usedWeight: 0,
      }
    },
  }
}

/**
 * Builds the `inventory` `CoraModule`: registers the `inventory_slots`
 * table migration and the `cora.inventory.get` rpc handler (stub for now,
 * see `createInventoryHandlers`'s docstring). The remaining
 * `cora.inventory.*` procedures (move/split/give/remove/equip) are added in
 * Task 3 once the operations engine (Task 2) exists.
 */
export function createInventoryModule(
  options: InventoryModuleOptions,
): CoraModule {
  const resolvedOptions = {
    catalog: options.catalog,
    slots: options.slots ?? DEFAULT_INVENTORY_SLOTS,
    maxWeight: options.maxWeight ?? DEFAULT_INVENTORY_MAX_WEIGHT,
  }

  return defineModule({
    id: "inventory",
    migrations: inventoryMigrations,
    register(ctx) {
      const handlers = createInventoryHandlers(ctx, resolvedOptions)
      ctx.platform.registerRpcHandler(CORA_INVENTORY_GET, handlers.get)
    },
  })
}
