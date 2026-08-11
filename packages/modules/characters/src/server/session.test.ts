import { createKernel, createTestPlatform } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { describe, expect, it, vi } from "vitest"
import {
  type CharactersUiClosePayload,
  type CharactersUiOpenPayload,
  CORA_CHARACTERS_CREATE,
  CORA_CHARACTERS_DELETE,
  CORA_CHARACTERS_LIST,
  CORA_CHARACTERS_SELECT,
  CORA_CHARACTERS_UI_CLOSE,
  CORA_CHARACTERS_UI_OPEN,
  type CreateCharacterResult,
  type DeleteCharacterResult,
  type ListCharactersResult,
  type SelectCharacterResult,
} from "../contract.js"
import { createCharactersModule } from "./characters-module.js"

const PLAYER_ONE = { id: 1, name: "Alice" }
const PLAYER_TWO = { id: 2, name: "Bob" }

async function bootKernel(db: ReturnType<typeof createTestDatabase>) {
  const testPlatform = createTestPlatform()
  const kernel = await createKernel({
    platform: testPlatform.platform,
    db,
    modules: [createCharactersModule()],
  })
  expect(kernel.disabledModules).toEqual([])
  return { kernel, ...testPlatform }
}

async function create(
  invokeRpc: (
    name: string,
    input: unknown,
    playerId: number,
  ) => Promise<unknown>,
  playerId: number,
  name: string,
): Promise<CreateCharacterResult> {
  return (await invokeRpc(
    CORA_CHARACTERS_CREATE,
    { name },
    playerId,
  )) as CreateCharacterResult
}

describe("characters session/spawn state machine", () => {
  it("opens the select UI with the player's own character list on connect", async () => {
    const db = createTestDatabase()
    const { invokeRpc, emit, clientCalls } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")
    await create(invokeRpc, PLAYER_TWO.id, "Bob Reyes")

    emit("playerConnected", PLAYER_ONE)

    await vi.waitFor(() => {
      expect(
        clientCalls.some((call) => call.name === CORA_CHARACTERS_UI_OPEN),
      ).toBe(true)
    })

    const openCall = clientCalls.find(
      (call) => call.name === CORA_CHARACTERS_UI_OPEN,
    )
    expect(openCall?.playerId).toBe(PLAYER_ONE.id)
    const payload = openCall?.payload as CharactersUiOpenPayload
    expect(payload.characters.map((c) => c.name)).toEqual(["Alice Vance"])
  })

  it("selecting a character updates last_played_at and closes the UI with a spawn payload", async () => {
    const db = createTestDatabase()
    const { invokeRpc, clientCalls } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")

    const result = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult

    expect(result).toEqual({
      ok: true,
      characterId: created.character.id,
      position: { x: 0, y: 0, z: 0 },
    })

    const closeCall = clientCalls.find(
      (call) => call.name === CORA_CHARACTERS_UI_CLOSE,
    )
    expect(closeCall?.playerId).toBe(PLAYER_ONE.id)
    expect(closeCall?.payload as CharactersUiClosePayload).toEqual({
      spawn: { x: 0, y: 0, z: 0 },
    })

    const list = (await invokeRpc(
      CORA_CHARACTERS_LIST,
      {},
      PLAYER_ONE.id,
    )) as ListCharactersResult
    if (list.ok) {
      expect(list.characters[0]?.lastPlayedAt).not.toBeNull()
    }
  })

  it("refuses to select again while already playing", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")

    const first = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(first.ok).toBe(true)

    const second = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(second).toEqual({ ok: false, error: "already_playing" })
  })

  it("still rejects selecting another player's character while unaffected by session state", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")

    const foreign = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_TWO.id,
    )) as SelectCharacterResult
    expect(foreign).toEqual({ ok: false, error: "not_owner" })

    const missing = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: 999 },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(missing).toEqual({ ok: false, error: "not_found" })
  })

  it("refuses to delete the active character while playing it", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")
    const selected = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(selected.ok).toBe(true)

    const result = (await invokeRpc(
      CORA_CHARACTERS_DELETE,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as DeleteCharacterResult

    expect(result).toEqual({ ok: false, error: "active_character" })
  })

  it("allows deleting a non-active character while another one is being played", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const active = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    const spare = await create(invokeRpc, PLAYER_ONE.id, "Alice Spare")
    if (!active.ok || !spare.ok) throw new Error("setup: create failed")

    const selected = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: active.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(selected.ok).toBe(true)

    const result = (await invokeRpc(
      CORA_CHARACTERS_DELETE,
      { characterId: spare.character.id },
      PLAYER_ONE.id,
    )) as DeleteCharacterResult

    expect(result).toEqual({ ok: true })
  })

  it("clears the session on disconnect, so a second connect gets a fresh ui.open", async () => {
    const db = createTestDatabase()
    const { invokeRpc, emit, clientCalls } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")
    const selected = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(selected.ok).toBe(true)

    emit("playerDisconnected", PLAYER_ONE, "left")

    // A second select attempt after disconnect must not be blocked by a
    // leftover "playing" session - the disconnect handler must have cleared
    // it synchronously (no db work required for the clear itself).
    const reselect = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(reselect.ok).toBe(true)

    emit("playerConnected", PLAYER_ONE)

    await vi.waitFor(() => {
      const opens = clientCalls.filter(
        (call) => call.name === CORA_CHARACTERS_UI_OPEN,
      )
      expect(opens.length).toBeGreaterThan(0)
    })
  })

  it("persists the position-nulling placeholder for the active character on disconnect", async () => {
    const db = createTestDatabase()
    const { invokeRpc, emit } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")
    const selected = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(selected.ok).toBe(true)

    emit("playerDisconnected", PLAYER_ONE, "left")

    await vi.waitFor(async () => {
      const row = await db
        .selectFrom("characters")
        .selectAll()
        .where("id", "=", created.character.id)
        .executeTakeFirstOrThrow()
      expect(row.position_x).toBeNull()
      expect(row.position_y).toBeNull()
      expect(row.position_z).toBeNull()
    })
  })

  it("leaves the session playing after a death event, so an active-character delete is still denied", async () => {
    const db = createTestDatabase()
    const { invokeRpc, emit } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")
    const selected = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult
    expect(selected.ok).toBe(true)

    emit("playerDeath", PLAYER_ONE, null)

    const result = (await invokeRpc(
      CORA_CHARACTERS_DELETE,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as DeleteCharacterResult

    expect(result).toEqual({ ok: false, error: "active_character" })
  })
})
