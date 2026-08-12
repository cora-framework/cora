import { createKernel, createTestPlatform } from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import { CORA_MONEY_GET, type GetAccountResult } from "../contract.js"
import {
  createMoneyModule,
  DEFAULT_STARTING_BANK,
  DEFAULT_STARTING_CASH,
} from "./money-module.js"

const PLAYER_ID = 1
const CHARACTER_ID = 1
const OTHER_CHARACTER_ID = 2

describe("money module boot", () => {
  it("boots on a kernel with no disabled modules", async () => {
    const db = createTestDatabase()
    const { platform } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createMoneyModule()],
    })

    expect(kernel.disabledModules).toEqual([])
  })

  it("applies the money migrations on boot", async () => {
    const db = createTestDatabase()
    const { platform } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createMoneyModule()],
    })
    expect(kernel.disabledModules).toEqual([])

    const rows = await db
      .selectFrom("cora_migrations")
      .selectAll()
      .where("module", "=", "money")
      .execute()
    expect(rows).toHaveLength(2)
  })

  it("registers cora.money.get and returns starting balances for a new character", async () => {
    const db = createTestDatabase()
    const { platform, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createMoneyModule()],
    })
    expect(kernel.disabledModules).toEqual([])

    const result = (await invokeRpc(
      CORA_MONEY_GET,
      { characterId: CHARACTER_ID },
      PLAYER_ID,
    )) as GetAccountResult

    expect(result).toEqual({
      ok: true,
      cash: DEFAULT_STARTING_CASH,
      bank: DEFAULT_STARTING_BANK,
      crypto: 0,
    })
  })

  it("honours configured startingCash/startingBank for a new character", async () => {
    const db = createTestDatabase()
    const { platform, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createMoneyModule({ startingCash: 500, startingBank: 1000 })],
    })
    expect(kernel.disabledModules).toEqual([])

    const result = (await invokeRpc(
      CORA_MONEY_GET,
      { characterId: CHARACTER_ID },
      PLAYER_ID,
    )) as GetAccountResult

    expect(result).toEqual({ ok: true, cash: 500, bank: 1000, crypto: 0 })
  })

  it("does not write a money_accounts row for a character that was only read", async () => {
    const db = createTestDatabase()
    const { platform, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createMoneyModule()],
    })
    expect(kernel.disabledModules).toEqual([])

    await invokeRpc(CORA_MONEY_GET, { characterId: CHARACTER_ID }, PLAYER_ID)

    const rows = await db.selectFrom("money_accounts").selectAll().execute()
    expect(rows).toEqual([])
  })

  it("rejects malformed input at the rpc boundary with invalid_input", async () => {
    const db = createTestDatabase()
    const { platform, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createMoneyModule()],
    })
    expect(kernel.disabledModules).toEqual([])

    const result = (await invokeRpc(
      CORA_MONEY_GET,
      { characterId: "not-a-number" },
      PLAYER_ID,
    )) as GetAccountResult

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("invalid_input")
    }
  })

  it("is gated by isActiveCharacter", async () => {
    const db = createTestDatabase()
    const { platform, invokeRpc } = createTestPlatform()

    const isActiveCharacter = async (playerId: number, characterId: number) =>
      playerId === PLAYER_ID && characterId === CHARACTER_ID

    const kernel = await createKernel({
      platform,
      db,
      modules: [createMoneyModule({ isActiveCharacter })],
    })
    expect(kernel.disabledModules).toEqual([])

    const result = (await invokeRpc(
      CORA_MONEY_GET,
      { characterId: OTHER_CHARACTER_ID },
      PLAYER_ID,
    )) as GetAccountResult

    expect(result).toEqual({ ok: false, error: "not_active_character" })
  })
})
