import type { InventoryUiRefreshPayload } from "../contract.js"

/**
 * Thin, compile-only sketch of the browser-relay client wiring for the
 * inventory ui.refresh push, mirroring
 * `@cora-framework/characters/src/client/index.ts`'s pattern exactly.
 *
 * This is NOT exercised at runtime and has no test coverage beyond
 * typechecking - there is no live CyberMP client context available to CORA
 * yet, so nothing here has been proven to work in-game. It exists to give a
 * concrete, typed shape for the future client resource to call once that
 * context exists: register `handleUiRefresh` against whatever browser-relay
 * transport CyberMP exposes for `cora.inventory.ui.refresh` (see
 * `../contract.ts` for the payload shape and
 * `../server/inventory-module.ts` for the server-side flow that pushes it).
 *
 * `mirrorEquipToNative` reaches for the experimental, unverified
 * `grantNativeItem` bridge from `@cora-framework/core/experimental` behind a
 * lazy dynamic import - lazy so importing this module never eagerly pulls in
 * the experimental surface, and wrapped in try/catch because that surface
 * throws by design (see `packages/core/src/experimental/index.ts`) unless
 * `CORA_EXPERIMENTAL=1` is set, and even then has no real implementation
 * yet. Any failure here is swallowed rather than surfaced: this whole module
 * is a sketch, not a proven runtime path, so honesty about that limitation
 * matters more than pretending a caught error means something.
 */
export interface InventoryClientDeps {
  /** Called when the server pushes `cora.inventory.ui.refresh`. */
  onRefresh(data: InventoryUiRefreshPayload): void
}

export interface InventoryClientHandle {
  /** Untyped relay entrypoint for `cora.inventory.ui.refresh`. */
  handleUiRefresh(data: unknown): void
  /**
   * Requests the native inventory bridge grant `tweakDbId` to `playerId`,
   * mirroring a confirmed equip into a real game item. Unverified until
   * game launch - see the module docstring above. `tweakDbId` is expected
   * to come from the equipped item's `ItemDefinition.nativeTweakDbId` (see
   * `../catalog.ts`); callers should skip calling this entirely when that
   * field is absent, since there is no native counterpart to mirror.
   */
  mirrorEquipToNative(playerId: number, tweakDbId: string): void
}

/**
 * Builds the handle a future browser-relay client resource registers
 * `cora.inventory.ui.refresh` against. The `data: unknown` parameter mirrors
 * how a real relay transport would hand over an unvalidated payload; this
 * thin facade is the boundary where it gets cast to the typed contract
 * shape before reaching `deps`.
 */
export function registerInventoryClient(
  deps: InventoryClientDeps,
): InventoryClientHandle {
  return {
    handleUiRefresh(data: unknown): void {
      deps.onRefresh(data as InventoryUiRefreshPayload)
    },
    mirrorEquipToNative(playerId: number, tweakDbId: string): void {
      void grantNativeItemUnverified(playerId, tweakDbId)
    },
  }
}

/**
 * Lazily imports the experimental `grantNativeItem` bridge and calls it,
 * swallowing whatever it throws. See the module docstring: this is
 * documented, honest best-effort only - never a proven runtime path.
 */
async function grantNativeItemUnverified(
  playerId: number,
  tweakDbId: string,
): Promise<void> {
  try {
    const experimental = await import("@cora-framework/core/experimental")
    experimental.grantNativeItem(playerId, tweakDbId)
  } catch {
    // Expected in every environment today: either CORA_EXPERIMENTAL is
    // unset (ExperimentalUnverifiedError) or it is set but unimplemented
    // (NotImplementedError). Neither is actionable here.
  }
}
