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
  type CharactersUiClosePayload,
  type CharactersUiOpenPayload,
  CORA_CHARACTERS_CREATE,
  CORA_CHARACTERS_DELETE,
  CORA_CHARACTERS_LIST,
  CORA_CHARACTERS_SELECT,
  CORA_CHARACTERS_UI_CLOSE,
  CORA_CHARACTERS_UI_OPEN,
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
import { SessionManager } from "./session.js"

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
 * Builds the four `cora.characters.*` rpc handlers bound to `ctx` and
 * `sessions`. Split out from `register()` so it can be unit tested without a
 * full kernel boot if ever needed, though the module's own test suite boots
 * a real kernel. `sessions` must be the same `SessionManager` instance
 * `register()` wires up to the connect/disconnect/death hooks, so the
 * `select`/`delete` guards below see session state created by those hooks.
 */
export function createCharactersHandlers(
  ctx: CoraModuleContext,
  sessions: SessionManager,
) {
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
      // Deleting a character while playing another one (or none) is fine;
      // deleting the ACTIVE character out from under the current session is
      // not, since the client has already been told to spawn into it.
      if (sessions.activeCharacterId(playerId) === parsed.data.characterId) {
        return { ok: false, error: "active_character" }
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
      // A player already in a "playing" session (this character or any
      // other) must disconnect/return to select before choosing again -
      // there is no in-session character switch today.
      if (sessions.isPlaying(playerId)) {
        return { ok: false, error: "already_playing" }
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

      sessions.setPlaying(playerId, parsed.data.characterId)
      const closePayload: CharactersUiClosePayload = { spawn: position }
      try {
        await ctx.platform.callClient(
          playerId,
          CORA_CHARACTERS_UI_CLOSE,
          closePayload,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.log(
          "error",
          `player ${playerId}: select flow (ui.close) failed: ${message}`,
        )
      }

      // The select result stays ok regardless: the session is already
      // "playing" at this point, so a failed ui.close push only leaves the
      // client's select UI stale. Resyncing the client in that case is a
      // future concern, not something this rpc handler should fail on.
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
      const db = ctx.db as unknown as CoraDb<CharactersTable>
      const sessions = new SessionManager()
      const handlers = createCharactersHandlers(ctx, sessions)
      ctx.platform.registerRpcHandler(CORA_CHARACTERS_LIST, handlers.list)
      ctx.platform.registerRpcHandler(CORA_CHARACTERS_CREATE, handlers.create)
      ctx.platform.registerRpcHandler(CORA_CHARACTERS_DELETE, handlers.delete)
      ctx.platform.registerRpcHandler(CORA_CHARACTERS_SELECT, handlers.select)

      // playerConnected -> track the session (state "selecting") and push
      // the player's own character list to open the select UI client-side.
      //
      // `sessions.startSelecting` runs synchronously (see its docstring),
      // so the session already exists for any rpc call that happens to run
      // immediately after this hook fires. Everything from `handlers.list`
      // onward is async and fire-and-forget: the kernel's event dispatch
      // only wraps the synchronous part of a hook handler in a try/catch
      // (see `Kernel.dispatch`), so a rejection surfacing later on the
      // microtask queue would otherwise become an unhandled rejection - the
      // trailing `.catch` below is what prevents that.
      //
      // `epoch` guards against a rapid reconnect: if a second
      // `playerConnected` for the same player fires (and calls
      // `startSelecting` again, bumping the epoch) before this flow's
      // `handlers.list` resolves, this flow is now stale and must not push
      // an outdated character list after the fresher connect's `ui.open`.
      // We skip silently (not an error - just a superseded flow) rather
      // than logging.
      //
      // `shouldPushUiOpen` also requires the session still be "selecting":
      // the epoch alone is not enough, because a `select` rpc call can
      // complete (moving the session to "playing") before this flow's
      // character-list fetch resolves, without ever bumping the epoch (no
      // second `playerConnected` fired). Without that extra check, a late
      // `ui.open` could re-open the select UI on a client that already
      // finished selecting.
      ctx.hooks.onPlayerConnected((player) => {
        const epoch = sessions.startSelecting(player.id)
        void handlers
          .list({}, player.id)
          .then((result) => {
            if (!sessions.shouldPushUiOpen(player.id, epoch)) {
              return undefined
            }
            const characters = result.ok ? result.characters : []
            const openPayload: CharactersUiOpenPayload = { characters }
            return ctx.platform.callClient(
              player.id,
              CORA_CHARACTERS_UI_OPEN,
              openPayload,
            )
          })
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error)
            ctx.log(
              "error",
              `player ${player.id}: connect flow (character list / ui.open) failed: ${message}`,
            )
          })
      })

      // playerDisconnected -> position persistence placeholder: the client
      // does not yet report the character's live position back to the
      // server, so there is nothing real to persist. We explicitly
      // (re)write nulls rather than leaving the previous stored position in
      // place, documenting "no position stored" as the deliberate
      // placeholder state until a real position-reporting flow exists. The
      // session is cleared synchronously regardless of what state it was
      // in, before the (fire-and-forget) db write below is even started.
      ctx.hooks.onPlayerDisconnected((player) => {
        const characterId = sessions.activeCharacterId(player.id)
        sessions.clear(player.id)
        if (characterId !== null) {
          // Same rationale as the connect flow above: this write happens
          // after the kernel's synchronous dispatch try/catch has already
          // returned, so a rejection here must be caught explicitly or it
          // becomes an unhandled rejection.
          void db
            .updateTable("characters")
            .set({ position_x: null, position_y: null, position_z: null })
            .where("id", "=", characterId)
            .execute()
            .catch((error) => {
              const message =
                error instanceof Error ? error.message : String(error)
              ctx.log(
                "error",
                `player ${player.id}: disconnect flow (position-null persistence) failed: ${message}`,
              )
            })
        }
      })

      // playerDeath while playing -> session state is left untouched (stays
      // "playing" with the same characterId). Respawn handling is deferred
      // until upstream respawn events are verified in-game.
      ctx.hooks.onPlayerDeath(() => {})
    },
  })
}
