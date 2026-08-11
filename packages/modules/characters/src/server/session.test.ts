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
import { SessionManager } from "./session.js"

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

  it("session creation on connect is synchronous: select right after emit() succeeds with no waitFor", async () => {
    const db = createTestDatabase()
    const { invokeRpc, emit } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE.id, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")

    // No await/vi.waitFor between emit() and the select call below: this
    // locks in that `SessionManager.startSelecting` runs synchronously
    // inside the `playerConnected` hook, before any of its async work (the
    // character-list fetch, the `ui.open` push) has had a chance to run.
    emit("playerConnected", PLAYER_ONE)

    const result = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE.id,
    )) as SelectCharacterResult

    expect(result.ok).toBe(true)
  })

  it("logs an error and produces no unhandled rejection when the connect flow's callClient rejects", async () => {
    const db = createTestDatabase()
    const testPlatform = createTestPlatform()
    // Force callClient to reject for this test, to prove the connect flow's
    // fire-and-forget promise chain is guarded with a .catch: an unguarded
    // rejection here would surface as an unhandled rejection on the
    // microtask queue, after the kernel's synchronous dispatch try/catch
    // has already returned (it only covers the synchronous part of the
    // handler).
    testPlatform.platform.callClient = async () => {
      throw new Error("callClient boom")
    }

    const kernel = await createKernel({
      platform: testPlatform.platform,
      db,
      modules: [createCharactersModule()],
    })
    expect(kernel.disabledModules).toEqual([])

    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandledRejection)
    try {
      testPlatform.emit("playerConnected", PLAYER_ONE)

      await vi.waitFor(() => {
        expect(
          testPlatform.logs.some(
            (entry) =>
              entry.level === "error" &&
              entry.message.includes(String(PLAYER_ONE.id)),
          ),
        ).toBe(true)
      })

      // Give any stray unhandled rejection a chance to surface before we
      // assert none did.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", onUnhandledRejection)
    }
  })

  it("still returns ok and logs an error when the select flow's ui.close callClient rejects", async () => {
    const db = createTestDatabase()
    const testPlatform = createTestPlatform()
    const kernel = await createKernel({
      platform: testPlatform.platform,
      db,
      modules: [createCharactersModule()],
    })
    expect(kernel.disabledModules).toEqual([])

    const created = await create(
      testPlatform.invokeRpc,
      PLAYER_ONE.id,
      "Alice Vance",
    )
    if (!created.ok) throw new Error("setup: create failed")

    // Force callClient to reject only after setup, so the select rpc's
    // ui.close push is what fails - not the earlier create call.
    testPlatform.platform.callClient = async () => {
      throw new Error("callClient boom")
    }

    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandledRejection)
    try {
      const result = (await testPlatform.invokeRpc(
        CORA_CHARACTERS_SELECT,
        { characterId: created.character.id },
        PLAYER_ONE.id,
      )) as SelectCharacterResult

      // The session is already "playing" by this point, so a failed
      // ui.close push must not fail the rpc call itself - only get logged.
      expect(result).toEqual({
        ok: true,
        characterId: created.character.id,
        position: { x: 0, y: 0, z: 0 },
      })
      expect(
        testPlatform.logs.some(
          (entry) =>
            entry.level === "error" &&
            entry.message.includes("select flow") &&
            entry.message.includes(String(PLAYER_ONE.id)),
        ),
      ).toBe(true)

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", onUnhandledRejection)
    }
  })
})

describe("SessionManager connect epoch", () => {
  it("increments a monotonic epoch per startSelecting call and rejects a stale epoch", () => {
    const sessions = new SessionManager()

    const first = sessions.startSelecting(PLAYER_ONE.id)
    expect(first).toBe(1)
    expect(sessions.isCurrentConnectEpoch(PLAYER_ONE.id, first)).toBe(true)

    // A rapid reconnect calls startSelecting again before the first
    // connect's async ui.open flow has checked its epoch.
    const second = sessions.startSelecting(PLAYER_ONE.id)
    expect(second).toBe(2)
    expect(second).not.toBe(first)

    // The stale first epoch must now read as superseded ...
    expect(sessions.isCurrentConnectEpoch(PLAYER_ONE.id, first)).toBe(false)
    // ... while the fresh second epoch is still current.
    expect(sessions.isCurrentConnectEpoch(PLAYER_ONE.id, second)).toBe(true)
  })

  it("tracks connect epochs independently per player", () => {
    const sessions = new SessionManager()

    const playerOneEpoch = sessions.startSelecting(PLAYER_ONE.id)
    const playerTwoEpoch = sessions.startSelecting(PLAYER_TWO.id)

    expect(playerOneEpoch).toBe(1)
    expect(playerTwoEpoch).toBe(1)
    expect(sessions.isCurrentConnectEpoch(PLAYER_ONE.id, playerOneEpoch)).toBe(
      true,
    )
    expect(sessions.isCurrentConnectEpoch(PLAYER_TWO.id, playerTwoEpoch)).toBe(
      true,
    )
  })

  it("shouldPushUiOpen is true for a fresh selecting session with a current epoch", () => {
    const sessions = new SessionManager()

    const epoch = sessions.startSelecting(PLAYER_ONE.id)

    expect(sessions.shouldPushUiOpen(PLAYER_ONE.id, epoch)).toBe(true)
  })

  it("shouldPushUiOpen is false once select completes, even with a still-current epoch", () => {
    // Regression test: the epoch check alone is not enough to guard the
    // deferred `ui.open` push. A `select` rpc call can complete (moving the
    // session to "playing") entirely between `startSelecting` and the
    // connect flow's async character-list fetch resolving, without any
    // second `playerConnected` ever firing - so the epoch never changes.
    // Without an additional status check, a late `ui.open` could re-open
    // the select UI on a client that has already finished selecting.
    const sessions = new SessionManager()

    const epoch = sessions.startSelecting(PLAYER_ONE.id)
    // Simulate: connect -> select completes before the connect flow's list
    // fetch resolves.
    sessions.setPlaying(PLAYER_ONE.id, 42)

    expect(sessions.isCurrentConnectEpoch(PLAYER_ONE.id, epoch)).toBe(true)
    expect(sessions.shouldPushUiOpen(PLAYER_ONE.id, epoch)).toBe(false)
  })
})

// Rapid-reconnect end-to-end simulation through the module's own connect
// flow (rather than the SessionManager unit tests above) was left out
// deliberately: TestPlatform's callClient/db have no controllable-latency
// hook, so forcing the first of two overlapping connect flows to resolve
// AFTER the second would require monkey-patching internal promise
// resolution order in a way that is fragile and does not read as a genuine
// regression test. The epoch guard itself - increment-per-connect and
// stale-epoch rejection - is covered directly above, and the module wiring
// that calls `startSelecting`/`isCurrentConnectEpoch` around the `ui.open`
// push is exercised (non-racily) by the "opens the select UI ... on
// connect" test earlier in this file.
