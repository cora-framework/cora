import { createKernel, createTestPlatform } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import {
  CORA_CHARACTERS_CREATE,
  CORA_CHARACTERS_DELETE,
  CORA_CHARACTERS_LIST,
  CORA_CHARACTERS_SELECT,
  type CreateCharacterResult,
  type DeleteCharacterResult,
  type ListCharactersResult,
  MAX_CHARACTERS_PER_PLAYER,
  type SelectCharacterResult,
} from "../contract.js"
import { createCharactersModule } from "./characters-module.js"

const PLAYER_ONE = 1
const PLAYER_TWO = 2

async function bootKernel(db: ReturnType<typeof createTestDatabase>) {
  const { platform, invokeRpc } = createTestPlatform()
  const kernel = await createKernel({
    platform,
    db,
    modules: [createCharactersModule()],
  })
  expect(kernel.disabledModules).toEqual([])
  return { kernel, invokeRpc }
}

async function create(
  invokeRpc: (
    name: string,
    input: unknown,
    playerId: number,
  ) => Promise<unknown>,
  playerId: number,
  name: string,
  appearance?: string,
): Promise<CreateCharacterResult> {
  return (await invokeRpc(
    CORA_CHARACTERS_CREATE,
    appearance === undefined ? { name } : { name, appearance },
    playerId,
  )) as CreateCharacterResult
}

describe("characters module", () => {
  it("creates a character for a player", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const result = await create(invokeRpc, PLAYER_ONE, "Alice Vance")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.character.name).toBe("Alice Vance")
      expect(result.character.appearance).toBeNull()
      expect(result.character.lastPlayedAt).toBeNull()
      expect(typeof result.character.id).toBe("number")
    }
  })

  it("rejects a name that is too short", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const result = await create(invokeRpc, PLAYER_ONE, "A")

    expect(result).toEqual({ ok: false, error: "invalid_name" })
  })

  it("rejects a name that is too long", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const result = await create(invokeRpc, PLAYER_ONE, "A".repeat(33))

    expect(result).toEqual({ ok: false, error: "invalid_name" })
  })

  it("rejects a name with disallowed characters", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const result = await create(invokeRpc, PLAYER_ONE, "Alice123")

    expect(result).toEqual({ ok: false, error: "invalid_name" })
  })

  it("accepts unicode letters, spaces and hyphens", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const result = await create(invokeRpc, PLAYER_ONE, "Bjorn-Ostergaard Aake")

    expect(result.ok).toBe(true)
  })

  it("rejects malformed input at the rpc boundary with invalid_input", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const result = (await invokeRpc(
      CORA_CHARACTERS_CREATE,
      { name: 42 },
      PLAYER_ONE,
    )) as CreateCharacterResult

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("invalid_input")
      expect(result.details).toBeTruthy()
    }
  })

  it("caps a player at MAX_CHARACTERS_PER_PLAYER, returning limit_reached on the next create", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const names = ["Runner One", "Runner Two", "Runner Three", "Runner Four"]
    expect(names.length).toBe(MAX_CHARACTERS_PER_PLAYER)
    for (const name of names) {
      const result = await create(invokeRpc, PLAYER_ONE, name)
      expect(result.ok).toBe(true)
    }

    const fifth = await create(invokeRpc, PLAYER_ONE, "One Too Many")

    expect(fifth).toEqual({ ok: false, error: "limit_reached" })
  })

  it("lists only the requesting player's own characters", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    await create(invokeRpc, PLAYER_ONE, "Alice Vance")
    await create(invokeRpc, PLAYER_ONE, "Alice Two")
    await create(invokeRpc, PLAYER_TWO, "Bob Reyes")

    const listOne = (await invokeRpc(
      CORA_CHARACTERS_LIST,
      {},
      PLAYER_ONE,
    )) as ListCharactersResult
    const listTwo = (await invokeRpc(
      CORA_CHARACTERS_LIST,
      {},
      PLAYER_TWO,
    )) as ListCharactersResult

    expect(listOne.ok).toBe(true)
    expect(listTwo.ok).toBe(true)
    if (listOne.ok && listTwo.ok) {
      expect(listOne.characters.map((c) => c.name).sort()).toEqual([
        "Alice Two",
        "Alice Vance",
      ])
      expect(listTwo.characters.map((c) => c.name)).toEqual(["Bob Reyes"])
    }
  })

  it("deletes a character the caller owns", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")

    const result = (await invokeRpc(
      CORA_CHARACTERS_DELETE,
      { characterId: created.character.id },
      PLAYER_ONE,
    )) as DeleteCharacterResult

    expect(result).toEqual({ ok: true })

    const list = (await invokeRpc(
      CORA_CHARACTERS_LIST,
      {},
      PLAYER_ONE,
    )) as ListCharactersResult
    expect(list.ok && list.characters).toEqual([])
  })

  it("refuses to delete another player's character", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")

    const result = (await invokeRpc(
      CORA_CHARACTERS_DELETE,
      { characterId: created.character.id },
      PLAYER_TWO,
    )) as DeleteCharacterResult

    expect(result).toEqual({ ok: false, error: "not_owner" })
  })

  it("returns not_found deleting a missing character", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const result = (await invokeRpc(
      CORA_CHARACTERS_DELETE,
      { characterId: 999 },
      PLAYER_ONE,
    )) as DeleteCharacterResult

    expect(result).toEqual({ ok: false, error: "not_found" })
  })

  it("selects a character the caller owns, returning a spawn position", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")

    const result = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE,
    )) as SelectCharacterResult

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.characterId).toBe(created.character.id)
      expect(result.position).toEqual({ x: 0, y: 0, z: 0 })
    }

    const list = (await invokeRpc(
      CORA_CHARACTERS_LIST,
      {},
      PLAYER_ONE,
    )) as ListCharactersResult
    if (list.ok) {
      expect(list.characters[0]?.lastPlayedAt).not.toBeNull()
    }
  })

  it("refuses to select another player's character", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const created = await create(invokeRpc, PLAYER_ONE, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")

    const result = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_TWO,
    )) as SelectCharacterResult

    expect(result).toEqual({ ok: false, error: "not_owner" })
  })

  it("returns not_found selecting a missing character", async () => {
    const db = createTestDatabase()
    const { invokeRpc } = await bootKernel(db)

    const result = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: 999 },
      PLAYER_ONE,
    )) as SelectCharacterResult

    expect(result).toEqual({ ok: false, error: "not_found" })
  })

  it("persists characters across a second kernel boot on the same db", async () => {
    const db = createTestDatabase()
    const first = await bootKernel(db)

    const created = await create(first.invokeRpc, PLAYER_ONE, "Alice Vance")
    if (!created.ok) throw new Error("setup: create failed")
    await first.kernel.shutdown()

    const second = await bootKernel(db)
    const list = (await second.invokeRpc(
      CORA_CHARACTERS_LIST,
      {},
      PLAYER_ONE,
    )) as ListCharactersResult

    expect(list.ok).toBe(true)
    if (list.ok) {
      expect(list.characters.map((c) => c.name)).toEqual(["Alice Vance"])
      expect(list.characters[0]?.id).toBe(created.character.id)
    }
  })
})
