import {
  type CoraModule,
  type CoraModuleContext,
  defineModule,
} from "@cora-framework/core"
import type { CoraDb } from "@cora-framework/db"
import type { Selectable } from "kysely"
import { z } from "zod"
import {
  type CharacterSummary,
  type CharactersErrorResult,
  CORA_CHARACTERS_CREATE,
  CORA_CHARACTERS_DELETE,
  CORA_CHARACTERS_LIST,
  CORA_CHARACTERS_SELECT,
  type CreateCharacterResult,
  createCharacterInputSchema,
  DEFAULT_SPAWN_POSITION,
  type DeleteCharacterResult,
  deleteCharacterInputSchema,
  isValidCharacterName,
  type ListCharactersResult,
  listCharactersInputSchema,
  MAX_CHARACTERS_PER_PLAYER,
  type SelectCharacterResult,
  selectCharacterInputSchema,
} from "../contract.js"
import { type CharactersTable, charactersMigrations } from "../migrations.js"

type CharacterRow = Selectable<CharactersTable["characters"]>

function toSummary(row: CharacterRow): CharacterSummary {
  return {
    id: row.id,
    name: row.name,
    appearance: row.appearance,
    createdAt: row.created_at,
    lastPlayedAt: row.last_played_at,
  }
}

/**
 * Turns a zod parse failure into the shared `"invalid_input"` typed error,
 * used at the rpc boundary of every handler below so malformed requests
 * never throw through the rpc layer.
 */
function invalidInput(error: z.ZodError): CharactersErrorResult {
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
 * Player identity placeholder: CyberMP does not yet expose a stable player
 * license/uuid upstream, so ownership is keyed on the numeric platform
 * player id (stringified) until a real identity concept lands. Documented
 * tech debt, tracked alongside `CharactersTable.player_license`.
 */
function licenseOf(playerId: number): string {
  return String(playerId)
}

/**
 * Builds the four `cora.characters.*` rpc handlers bound to `ctx`. Split out
 * from `register()` so it can be unit tested without a full kernel boot if
 * ever needed, though the module's own test suite boots a real kernel.
 */
export function createCharactersHandlers(ctx: CoraModuleContext) {
  const db = ctx.db as unknown as CoraDb<CharactersTable>

  return {
    async list(
      input: unknown,
      playerId: number,
    ): Promise<ListCharactersResult> {
      const parsed = listCharactersInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)

      const rows = await db
        .selectFrom("characters")
        .selectAll()
        .where("player_license", "=", licenseOf(playerId))
        .orderBy("id", "asc")
        .execute()

      return { ok: true, characters: rows.map(toSummary) }
    },

    async create(
      input: unknown,
      playerId: number,
    ): Promise<CreateCharacterResult> {
      const parsed = createCharacterInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)

      const { name, appearance } = parsed.data
      if (!isValidCharacterName(name)) {
        return { ok: false, error: "invalid_name" }
      }

      const license = licenseOf(playerId)
      // Count-then-insert is not atomic: two concurrent creates for the
      // same player could both pass this check before either insert lands,
      // letting a player exceed MAX_CHARACTERS_PER_PLAYER by one. Acceptable
      // today because @cora-framework/db's test/dev target is sqlite, a
      // single-writer database where the kernel's rpc handlers run one at a
      // time. Revisit (e.g. a unique constraint + retry, or a transaction
      // with a row lock) before this module is used against a multi-writer
      // backend such as MySQL under real concurrency.
      const existing = await db
        .selectFrom("characters")
        .select("id")
        .where("player_license", "=", license)
        .execute()
      if (existing.length >= MAX_CHARACTERS_PER_PLAYER) {
        return { ok: false, error: "limit_reached" }
      }

      const now = new Date().toISOString()
      const insertResult = await db
        .insertInto("characters")
        .values({
          player_license: license,
          name,
          appearance: appearance ?? null,
          position_x: null,
          position_y: null,
          position_z: null,
          created_at: now,
          last_played_at: null,
        })
        .executeTakeFirstOrThrow()

      const id = Number(insertResult.insertId)
      const row = await db
        .selectFrom("characters")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow()

      return { ok: true, character: toSummary(row) }
    },

    async delete(
      input: unknown,
      playerId: number,
    ): Promise<DeleteCharacterResult> {
      const parsed = deleteCharacterInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)

      const row = await db
        .selectFrom("characters")
        .selectAll()
        .where("id", "=", parsed.data.characterId)
        .executeTakeFirst()
      if (!row) return { ok: false, error: "not_found" }
      if (row.player_license !== licenseOf(playerId)) {
        return { ok: false, error: "not_owner" }
      }

      await db
        .deleteFrom("characters")
        .where("id", "=", parsed.data.characterId)
        .execute()

      return { ok: true }
    },

    async select(
      input: unknown,
      playerId: number,
    ): Promise<SelectCharacterResult> {
      const parsed = selectCharacterInputSchema.safeParse(input)
      if (!parsed.success) return invalidInput(parsed.error)

      const row = await db
        .selectFrom("characters")
        .selectAll()
        .where("id", "=", parsed.data.characterId)
        .executeTakeFirst()
      if (!row) return { ok: false, error: "not_found" }
      if (row.player_license !== licenseOf(playerId)) {
        return { ok: false, error: "not_owner" }
      }

      const now = new Date().toISOString()
      await db
        .updateTable("characters")
        .set({ last_played_at: now })
        .where("id", "=", parsed.data.characterId)
        .execute()

      const position =
        row.position_x !== null &&
        row.position_y !== null &&
        row.position_z !== null
          ? { x: row.position_x, y: row.position_y, z: row.position_z }
          : DEFAULT_SPAWN_POSITION

      return { ok: true, characterId: parsed.data.characterId, position }
    },
  }
}

/**
 * Options for `createCharactersModule`. Currently empty - reserved for
 * future configuration (e.g. a configurable `maxCharacters`) without a
 * breaking factory signature change.
 */
export type CharactersModuleOptions = Record<string, never>

/**
 * Builds the `characters` `CoraModule`: registers the `characters` table
 * migration and the four `cora.characters.*` rpc handlers, with zod parsing
 * at the rpc boundary and ownership enforced by (placeholder) player
 * license. See RFC 0001 for the module API this implements.
 */
export function createCharactersModule(
  _options: CharactersModuleOptions = {},
): CoraModule {
  return defineModule({
    id: "characters",
    migrations: charactersMigrations,
    register(ctx) {
      const handlers = createCharactersHandlers(ctx)
      ctx.platform.registerRpcHandler(CORA_CHARACTERS_LIST, handlers.list)
      ctx.platform.registerRpcHandler(CORA_CHARACTERS_CREATE, handlers.create)
      ctx.platform.registerRpcHandler(CORA_CHARACTERS_DELETE, handlers.delete)
      ctx.platform.registerRpcHandler(CORA_CHARACTERS_SELECT, handlers.select)
    },
  })
}
