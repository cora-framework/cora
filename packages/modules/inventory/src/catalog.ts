import { z } from "zod"

/**
 * Kebab-case identifier pattern shared by item ids: lowercase letters and
 * digits, hyphen-separated segments, no leading/trailing/double hyphens
 * (e.g. "medium-pistol", "stim-pack-mk2"). Mirrors the module-id kebab rule
 * in `@cora-framework/core`'s `defineModule`.
 */
export const ITEM_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * The set of item categories the inventory system understands. `equip`
 * (Task 2) only accepts "weapon" and "gear"; "consumable" and "misc" items
 * are never equippable.
 */
export const ITEM_CATEGORIES = ["weapon", "consumable", "gear", "misc"] as const

export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

/**
 * A single code-defined item definition. Item definitions are static
 * per-deployment data (not stored in the db): the db only ever stores an
 * item id, quantity and slot per `src/migrations.ts`, looked up against the
 * catalog built at module-configuration time.
 */
export interface ItemDefinition {
  /** Kebab-case identifier, unique within a catalog. */
  id: string
  label: string
  /** Per-unit weight; must be strictly positive. */
  weight: number
  stackable: boolean
  /**
   * Maximum quantity per slot. Must be >= 1, and must be exactly 1 when
   * `stackable` is false (a non-stackable item cannot hold more than one
   * unit in a slot).
   */
  maxStack: number
  category: ItemCategory
  /**
   * Optional native tweakdb id used by the experimental equip-mirror bridge
   * (Task 4) to grant a matching real game item. Absent for items with no
   * native counterpart.
   */
  nativeTweakDbId?: string
}

const itemDefinitionSchema = z
  .object({
    id: z
      .string()
      .regex(
        ITEM_ID_PATTERN,
        "id must be kebab-case (lowercase letters, digits and single hyphens)",
      ),
    label: z.string().min(1),
    weight: z.number().positive(),
    stackable: z.boolean(),
    maxStack: z.number().int().min(1),
    category: z.enum(ITEM_CATEGORIES),
    nativeTweakDbId: z.string().min(1).optional(),
  })
  .strict()
  .refine((item) => item.stackable || item.maxStack === 1, {
    message: "maxStack must be 1 when stackable is false",
    path: ["maxStack"],
  })

/**
 * A validated, immutable catalog of item definitions: the frozen `items`
 * list in original order, plus a frozen `byId` lookup map for O(1) access.
 * Built once via `defineItemCatalog` and handed to the inventory module via
 * its options.
 */
export interface ItemCatalog {
  items: readonly ItemDefinition[]
  byId: ReadonlyMap<string, ItemDefinition>
}

/**
 * Validates and freezes a list of item definitions into an `ItemCatalog`.
 * Throws (rather than returning a `Result`) because a catalog is
 * deployment-time configuration - a malformed catalog is a startup bug, not
 * a runtime condition callers should have to handle.
 *
 * Validation:
 * - each item must pass `itemDefinitionSchema` (kebab id, positive weight,
 *   maxStack >= 1 and === 1 when not stackable, known category);
 * - item ids must be unique across the whole catalog.
 */
export function defineItemCatalog(items: ItemDefinition[]): ItemCatalog {
  const validated: ItemDefinition[] = []
  const byId = new Map<string, ItemDefinition>()

  for (const [index, rawItem] of items.entries()) {
    const parsed = itemDefinitionSchema.safeParse(rawItem)
    if (!parsed.success) {
      const flattened = z.flattenError(parsed.error)
      const messages = [
        ...flattened.formErrors,
        ...Object.entries(flattened.fieldErrors).flatMap(
          ([field, fieldMessages]) =>
            (fieldMessages ?? []).map((message) => `${field}: ${message}`),
        ),
      ]
      throw new Error(
        `Invalid item definition at index ${index}: ${messages.join("; ")}`,
      )
    }

    const item = parsed.data
    if (byId.has(item.id)) {
      throw new Error(`Duplicate item id "${item.id}" in catalog`)
    }

    // Built via spread + conditional assignment rather than a single object
    // literal so `nativeTweakDbId` is omitted entirely (not set to
    // `undefined`) when absent - required for `ItemDefinition` under
    // `exactOptionalPropertyTypes`.
    const normalized: ItemDefinition = {
      id: item.id,
      label: item.label,
      weight: item.weight,
      stackable: item.stackable,
      maxStack: item.maxStack,
      category: item.category,
      ...(item.nativeTweakDbId !== undefined
        ? { nativeTweakDbId: item.nativeTweakDbId }
        : {}),
    }
    const frozen = Object.freeze(normalized)
    validated.push(frozen)
    byId.set(item.id, frozen)
  }

  // `Object.freeze` on a `Map` instance only blocks reassigning/deleting its
  // own properties - it does NOT make `.set`/`.delete` throw, since those
  // mutate internal slots rather than properties (a well-known JS gotcha).
  // The `ReadonlyMap` type below is therefore a compile-time-only guarantee:
  // it stops typed callers from calling `.set`/`.delete`, but does not
  // truly freeze the map at runtime. Combined with each `ItemDefinition`
  // being individually frozen and the `items` array being frozen, this is
  // judged sufficient for a startup-time, code-defined catalog that no
  // application code has a legitimate reason to mutate.
  return Object.freeze({
    items: Object.freeze(validated),
    byId: Object.freeze(byId) as ReadonlyMap<string, ItemDefinition>,
  })
}
