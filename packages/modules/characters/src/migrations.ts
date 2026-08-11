import { defineMigrations } from "@cora-framework/db"
import type { Generated } from "kysely"

/**
 * The `characters` table's row shape. `player_license` is documented tech
 * debt: CyberMP does not yet expose a stable player identity upstream, so
 * this column stores the numeric platform player id as text as a
 * placeholder. It is meant to be swapped for a real license/uuid once one
 * exists upstream (see the plan's self-review notes).
 */
export interface CharactersTable {
  characters: {
    id: Generated<number>
    player_license: string
    name: string
    appearance: string | null
    position_x: number | null
    position_y: number | null
    position_z: number | null
    created_at: string
    last_played_at: string | null
  }
}

export const charactersMigrations = defineMigrations("characters", [
  {
    sequence: 1,
    name: "create-characters-table",
    async up(trx) {
      await trx.schema
        .createTable("characters")
        .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
        .addColumn("player_license", "text", (col) => col.notNull())
        .addColumn("name", "text", (col) => col.notNull())
        .addColumn("appearance", "text")
        .addColumn("position_x", "real")
        .addColumn("position_y", "real")
        .addColumn("position_z", "real")
        .addColumn("created_at", "text", (col) => col.notNull())
        .addColumn("last_played_at", "text")
        .execute()
    },
  },
])
