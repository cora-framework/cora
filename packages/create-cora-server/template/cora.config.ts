import type { CoraDbConfig } from "@cora-framework/db"
import { defineItemCatalog, type ItemCatalog } from "@cora-framework/inventory"

/**
 * The starter's single top-level configuration surface. `src/server/index.ts`
 * and `cora.migrate.mjs` both read from here (the latter re-declares the `db`
 * shape rather than importing this module, since it must stay plain
 * JavaScript for the `cora migrate` CLI - keep the two in sync by hand).
 */
export interface CoraServerConfig {
  db: CoraDbConfig
  catalog: ItemCatalog
  /** Number of inventory slots each character has. */
  slots: number
  /** Maximum total carried weight per character. */
  maxWeight: number
  /** Starting cash balance (integer minor units, e.g. cents) for a new character. */
  startingCash: number
  /** Starting bank balance (integer minor units, e.g. cents) for a new character. */
  startingBank: number
}

/**
 * Database connection settings, read from `CORA_DB_*` environment variables
 * with development-friendly defaults. Override every field via the
 * environment before deploying against a real MySQL server.
 */
const db: CoraDbConfig = {
  host: process.env.CORA_DB_HOST ?? "127.0.0.1",
  port: Number(process.env.CORA_DB_PORT ?? 3306),
  user: process.env.CORA_DB_USER ?? "root",
  password: process.env.CORA_DB_PASSWORD ?? "",
  database: process.env.CORA_DB_DATABASE ?? "cora_app",
}

/**
 * A small example catalog covering all four item categories, validated by
 * `@cora-framework/inventory`'s `defineItemCatalog` (kebab-case ids, positive
 * weight, maxStack rules). Replace with your own items - this exists to show
 * the shape a real catalog takes, including the optional `nativeTweakDbId`
 * used by the equip-mirror bridge to grant a matching in-game item.
 */
const catalog: ItemCatalog = defineItemCatalog([
  {
    id: "medium-pistol",
    label: "Medium Pistol",
    weight: 1.2,
    stackable: false,
    maxStack: 1,
    category: "weapon",
    // Placeholder - point this at a real TweakDB id for the equip-mirror
    // bridge to grant a matching native weapon on equip.
    nativeTweakDbId: "Items.PlaceholderMediumPistol",
  },
  {
    id: "stim-pack",
    label: "Stim Pack",
    weight: 0.3,
    stackable: true,
    maxStack: 10,
    category: "consumable",
  },
  {
    id: "armor-vest",
    label: "Armor Vest",
    weight: 3,
    stackable: false,
    maxStack: 1,
    category: "gear",
  },
  {
    id: "scrap-metal",
    label: "Scrap Metal",
    weight: 0.1,
    stackable: true,
    maxStack: 50,
    category: "misc",
  },
])

export const config: CoraServerConfig = {
  db,
  catalog,
  slots: 40,
  maxWeight: 120,
  startingCash: 50000,
  startingBank: 0,
}

export default config
