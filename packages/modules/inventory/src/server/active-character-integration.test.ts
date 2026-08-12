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
import { defineItemCatalog } from "../catalog.js"
import {
  CORA_INVENTORY_GET,
  CORA_INVENTORY_GIVE,
  CORA_INVENTORY_GIVE_PERMISSION,
  type GetInventoryResult,
  type GiveItemResult,
} from "../contract.js"
import { createInventoryModule } from "./inventory-module.js"

const PLAYER_ID = 1

const catalog = defineItemCatalog([
  {
    id: "stim-pack",
    label: "Stim Pack",
    weight: 1,
    stackable: true,
    maxStack: 5,
    category: "consumable",
  },
])

/**
 * THE payoff test for RFC 0002 / Phase 2c.1: boots ONE kernel with BOTH
 * `@cora-framework/characters` and `@cora-framework/inventory` - the two
 * flagship modules - with NO explicit `isActiveCharacter` option passed to
 * `createInventoryModule`. Inventory resolves the active-character check
 * purely through `ctx.services.get(activeCharacterProviderToken)`, which
 * characters publishes from its live session in `register()` (see
 * `packages/modules/characters/src/server/characters-module.ts`). Neither
 * module imports the other - this test is the only place in the repo that
 * imports both, proving the wiring end to end through the kernel's service
 * registry rather than through any direct reference either module holds.
 */
describe("inventory auto-resolves the active-character service from characters", () => {
  it("gates get/give-then-get by the real live session, with no isActiveCharacter option on inventory", async () => {
    const db = createTestDatabase()
    const { platform, emit, invokeRpc } = createTestPlatform()

    const kernel = await createKernel({
      platform,
      db,
      modules: [createCharactersModule(), createInventoryModule({ catalog })],
    })
    expect(kernel.disabledModules).toEqual([])

    const permissions = createPermissions(db)
    const defineResult = await permissions.defineRole("inventory-admin", [
      CORA_INVENTORY_GIVE_PERMISSION,
    ])
    if (!defineResult.ok) throw new Error(defineResult.error)
    const grantResult = await permissions.grantRole(
      PLAYER_ID,
      "inventory-admin",
    )
    if (!grantResult.ok) throw new Error(grantResult.error)

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

    // give is admin tooling (not gated by isActiveCharacter), so it can seed
    // the active character's inventory regardless of session state.
    const given = (await invokeRpc(
      CORA_INVENTORY_GIVE,
      { characterId: active.character.id, itemId: "stim-pack", quantity: 2 },
      PLAYER_ID,
    )) as GiveItemResult
    expect(given).toEqual({ ok: true })

    // get for the player's actual active character succeeds: inventory
    // resolved characters' live session through the service registry with
    // no explicit isActiveCharacter option.
    const getActive = (await invokeRpc(
      CORA_INVENTORY_GET,
      { characterId: active.character.id },
      PLAYER_ID,
    )) as GetInventoryResult
    expect(getActive.ok).toBe(true)
    if (getActive.ok) {
      expect(getActive.slots).toEqual([
        {
          slot: 0,
          itemId: "stim-pack",
          label: "Stim Pack",
          quantity: 2,
          equipped: false,
        },
      ])
    }

    // get for a character the player owns but is NOT currently playing is
    // rejected - proving the check is bound to the real live session, not an
    // allow-all fallback.
    const getOther = (await invokeRpc(
      CORA_INVENTORY_GET,
      { characterId: other.character.id },
      PLAYER_ID,
    )) as GetInventoryResult
    expect(getOther).toEqual({ ok: false, error: "not_active_character" })
  })
})
