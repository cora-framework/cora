import {
  CORA_CHARACTERS_CREATE,
  CORA_CHARACTERS_SELECT,
  type CreateCharacterResult,
  createCharactersModule,
  type SelectCharacterResult,
} from "@cora-framework/characters"
import {
  createKernel,
  createPermissions,
  createTestPlatform,
} from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import {
  type AdjustResult,
  CORA_MONEY_ADJUST,
  CORA_MONEY_ADJUST_PERMISSION,
  CORA_MONEY_GET,
  CORA_MONEY_TRANSFER,
  type GetAccountResult,
  type TransferResult,
} from "../contract.js"
import { createMoneyModule } from "./money-module.js"

const PLAYER_ID = 1
const STARTING_CASH = 5000

/**
 * THE payoff test for the money module (Task 3, mirroring
 * `@cora-framework/inventory`'s `active-character-integration.test.ts` for
 * RFC 0002 / Phase 2c.1): boots ONE kernel with BOTH
 * `@cora-framework/characters` and `@cora-framework/money`, with NO explicit
 * `isActiveCharacter` option passed to `createMoneyModule`. Money resolves
 * the active-character check purely through
 * `ctx.services.get(activeCharacterProviderToken)`, which characters
 * publishes from its live session in `register()`. Neither module imports
 * the other in non-test source - this test is the only place in the money
 * package that imports `@cora-framework/characters` (a devDependency only),
 * proving the wiring end to end through the kernel's service registry
 * rather than through any direct reference either module holds.
 */
describe("money auto-resolves the active-character service from characters", () => {
  it("gates get/transfer by the real live session and adjust by the permission, with no isActiveCharacter option on money", async () => {
    const db = createTestDatabase()
    const { platform, emit, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [
        createCharactersModule(),
        createMoneyModule({ startingCash: STARTING_CASH }),
      ],
    })
    expect(kernel.disabledModules).toEqual([])

    const permissions = createPermissions(db)
    const defineResult = await permissions.defineRole("money-admin", [
      CORA_MONEY_ADJUST_PERMISSION,
    ])
    if (!defineResult.ok) throw new Error(defineResult.error)

    emit("playerConnected", { id: PLAYER_ID, name: "Alice" })

    const active = (await invokeRpc(
      CORA_CHARACTERS_CREATE,
      { name: "Alice Vance" },
      PLAYER_ID,
    )) as CreateCharacterResult
    if (!active.ok) throw new Error("setup: create active character failed")

    const other = (await invokeRpc(
      CORA_CHARACTERS_CREATE,
      { name: "Alice Spare" },
      PLAYER_ID,
    )) as CreateCharacterResult
    if (!other.ok) throw new Error("setup: create other character failed")

    const selected = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: active.character.id },
      PLAYER_ID,
    )) as SelectCharacterResult
    expect(selected.ok).toBe(true)

    // get for the player's actual active character succeeds, with the
    // configured starting cash: money resolved characters' live session
    // through the service registry with no explicit isActiveCharacter
    // option, and no money_accounts row has been provisioned yet.
    const getActive = (await invokeRpc(
      CORA_MONEY_GET,
      { characterId: active.character.id },
      PLAYER_ID,
    )) as GetAccountResult
    expect(getActive).toEqual({
      ok: true,
      cash: STARTING_CASH,
      bank: 0,
      crypto: 0,
    })

    // get for a character the player owns but is NOT currently playing is
    // rejected - proving the check is bound to the real live session, not an
    // allow-all fallback.
    const getOther = (await invokeRpc(
      CORA_MONEY_GET,
      { characterId: other.character.id },
      PLAYER_ID,
    )) as GetAccountResult
    expect(getOther).toEqual({ ok: false, error: "not_active_character" })

    // transfer from the non-active character is rejected the same way -
    // fromCharacterId is the leg gated by isActiveCharacter.
    const transferFromOther = (await invokeRpc(
      CORA_MONEY_TRANSFER,
      {
        fromCharacterId: other.character.id,
        toCharacterId: active.character.id,
        kind: "cash",
        amount: 100,
      },
      PLAYER_ID,
    )) as TransferResult
    expect(transferFromOther).toEqual({
      ok: false,
      error: "not_active_character",
    })

    // transfer from the active character to the (non-active-owned) other
    // character succeeds - there is no isActiveCharacter requirement on the
    // destination. This both provisions other's money_accounts row (via the
    // engine's config.startingCash) and moves an additional amount on top.
    const transferAmount = 2000
    const transferResult = (await invokeRpc(
      CORA_MONEY_TRANSFER,
      {
        fromCharacterId: active.character.id,
        toCharacterId: other.character.id,
        kind: "cash",
        amount: transferAmount,
      },
      PLAYER_ID,
    )) as TransferResult
    expect(transferResult).toEqual({ ok: true })

    const activeRow = await db
      .selectFrom("money_accounts")
      .selectAll()
      .where("character_id", "=", active.character.id)
      .executeTakeFirstOrThrow()
    expect(activeRow.cash).toBe(STARTING_CASH - transferAmount)

    const otherRow = await db
      .selectFrom("money_accounts")
      .selectAll()
      .where("character_id", "=", other.character.id)
      .executeTakeFirstOrThrow()
    // other's row is provisioned with STARTING_CASH (config default) plus
    // the transferred amount on top.
    expect(otherRow.cash).toBe(STARTING_CASH + transferAmount)

    const ledgerRows = await db
      .selectFrom("money_ledger")
      .selectAll()
      .where("character_id", "in", [active.character.id, other.character.id])
      .orderBy("id", "asc")
      .execute()
    // active's seed row (STARTING_CASH, provisioned on its first mutation -
    // the transfer:out leg below), active's transfer:out row, other's seed
    // row (also STARTING_CASH, provisioned on its first mutation - the
    // transfer:in leg), other's transfer:in row - four ledger rows total,
    // one per write.
    expect(ledgerRows).toHaveLength(4)
    const activeTransferRow = ledgerRows.find(
      (row) =>
        row.character_id === active.character.id &&
        row.reason.startsWith("transfer:out"),
    )
    expect(activeTransferRow?.delta).toBe(-transferAmount)
    expect(activeTransferRow?.balance_after).toBe(
      STARTING_CASH - transferAmount,
    )
    const otherTransferRow = ledgerRows.find(
      (row) =>
        row.character_id === other.character.id &&
        row.reason.startsWith("transfer:in"),
    )
    expect(otherTransferRow?.delta).toBe(transferAmount)
    expect(otherTransferRow?.balance_after).toBe(STARTING_CASH + transferAmount)

    // adjust is denied without the cora.money.adjust permission.
    const adjustDenied = (await invokeRpc(
      CORA_MONEY_ADJUST,
      {
        characterId: active.character.id,
        kind: "cash",
        delta: 500,
        reason: "test",
      },
      PLAYER_ID,
    )) as AdjustResult
    expect(adjustDenied).toEqual({ ok: false, error: "permission_denied" })

    // adjust succeeds once the permission is granted - and is authorized
    // purely by the permission, not by isActiveCharacter: it works on
    // other's (non-active-owned) character too.
    const grantResult = await permissions.grantRole(PLAYER_ID, "money-admin")
    if (!grantResult.ok) throw new Error(grantResult.error)

    const adjustGranted = (await invokeRpc(
      CORA_MONEY_ADJUST,
      {
        characterId: other.character.id,
        kind: "cash",
        delta: 500,
        reason: "test",
      },
      PLAYER_ID,
    )) as AdjustResult
    expect(adjustGranted).toEqual({
      ok: true,
      balance: STARTING_CASH + transferAmount + 500,
    })
  })
})
