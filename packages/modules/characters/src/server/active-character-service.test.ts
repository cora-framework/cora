import {
  activeCharacterProviderToken,
  type CoraModule,
  createKernel,
  createTestPlatform,
  defineModule,
} from "@cora-framework/core"
import { createTestDatabase } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import {
  CORA_CHARACTERS_CREATE,
  CORA_CHARACTERS_SELECT,
  type CreateCharacterResult,
  type SelectCharacterResult,
} from "../contract.js"
import { createCharactersModule } from "./characters-module.js"

const PLAYER_ONE = 1

const PROBE_CHECK_ACTIVE = "test.probe.checkActive"

interface ProbeCheckActiveResult {
  isActive: boolean
  activeCharacterId: number | null
}

/**
 * A minimal module standing in for a real consumer (e.g. inventory): it
 * never imports `characters` directly, only the core-standard
 * `activeCharacterProviderToken`, and resolves it lazily inside its rpc
 * handler - proving the characters module's `register()` really does
 * publish a live, working `ActiveCharacterProvider` against the same
 * kernel's service registry.
 */
function createProbeModule(): CoraModule {
  return defineModule({
    id: "test-probe",
    register(ctx) {
      ctx.platform.registerRpcHandler(
        PROBE_CHECK_ACTIVE,
        async (input, playerId): Promise<ProbeCheckActiveResult> => {
          const { characterId } = input as { characterId: number }
          const provider = ctx.services.get(activeCharacterProviderToken)
          if (!provider) {
            throw new Error("activeCharacterProviderToken was not provided")
          }
          return {
            isActive: await provider.isActiveCharacter(playerId, characterId),
            activeCharacterId: provider.getActiveCharacterId(playerId),
          }
        },
      )
    },
  })
}

describe("characters module publishes the active-character service", () => {
  it("a probe module resolving activeCharacterProviderToken sees the live session state through a connect+create+select flow", async () => {
    const db = createTestDatabase()
    const { platform, emit, invokeRpc } = createTestPlatform()
    const kernel = await createKernel({
      platform,
      db,
      modules: [createCharactersModule(), createProbeModule()],
    })
    expect(kernel.disabledModules).toEqual([])

    emit("playerConnected", { id: PLAYER_ONE, name: "Alice" })

    const created = (await invokeRpc(
      CORA_CHARACTERS_CREATE,
      { name: "Alice Vance" },
      PLAYER_ONE,
    )) as CreateCharacterResult
    if (!created.ok) throw new Error("setup: create failed")
    const other = (await invokeRpc(
      CORA_CHARACTERS_CREATE,
      { name: "Alice Spare" },
      PLAYER_ONE,
    )) as CreateCharacterResult
    if (!other.ok) throw new Error("setup: create failed")

    // Before selecting: no active character yet.
    const beforeSelect = (await invokeRpc(
      PROBE_CHECK_ACTIVE,
      { characterId: created.character.id },
      PLAYER_ONE,
    )) as ProbeCheckActiveResult
    expect(beforeSelect).toEqual({ isActive: false, activeCharacterId: null })

    const selected = (await invokeRpc(
      CORA_CHARACTERS_SELECT,
      { characterId: created.character.id },
      PLAYER_ONE,
    )) as SelectCharacterResult
    expect(selected.ok).toBe(true)

    const activeResult = (await invokeRpc(
      PROBE_CHECK_ACTIVE,
      { characterId: created.character.id },
      PLAYER_ONE,
    )) as ProbeCheckActiveResult
    expect(activeResult).toEqual({
      isActive: true,
      activeCharacterId: created.character.id,
    })

    const nonActiveResult = (await invokeRpc(
      PROBE_CHECK_ACTIVE,
      { characterId: other.character.id },
      PLAYER_ONE,
    )) as ProbeCheckActiveResult
    expect(nonActiveResult).toEqual({
      isActive: false,
      activeCharacterId: created.character.id,
    })
  })
})
