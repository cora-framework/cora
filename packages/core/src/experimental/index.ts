import type { Vec3 } from "@cora-framework/lib"

/**
 * Unverified CyberMP native platform surfaces.
 *
 * Based on observed behavior of the CyberMP reference gamemode, these
 * surfaces (native HUD toggling, nameplates, minimap markers, native item
 * grants, the character appearance editor) are all "native-reusable"
 * candidates - real upstream mechanisms exist for each - but none of them
 * has ever been exercised inside a live CyberMP process by CORA. Unlike the
 * five stable `PlatformEvents`, there is no real-world proof any of these
 * behave the way their declared upstream signatures suggest; each is
 * unverified until in-game testing is possible.
 *
 * Every export below is fenced behind the `CORA_EXPERIMENTAL` environment
 * variable:
 *
 * - Unset (the default, and the only supported state outside of 2b/2c's own
 *   in-game verification work): calling any of these throws
 *   `ExperimentalUnverifiedError` immediately.
 * - `CORA_EXPERIMENTAL=1`: the fence lifts, but no real native
 *   implementation is wired up yet - calls instead throw
 *   `NotImplementedError`, a distinct signal meaning "verification pending"
 *   rather than "unsafe to call".
 *
 * The signatures themselves are the real intended shape of each bridge
 * (based on observed behavior of the CyberMP reference gamemode's
 * native-reusable surfaces), so that 2b/2c can implement against a stable
 * contract - only the body is a placeholder.
 */

/**
 * Thrown by every `experimental.*` export when `CORA_EXPERIMENTAL` is not
 * set to `"1"`. This is the default, safe outcome: the surface has not been
 * verified in-game and calling it is refused outright.
 */
export class ExperimentalUnverifiedError extends Error {
  constructor(feature: string) {
    super(
      `"${feature}" is an experimental CyberMP platform surface that has not ` +
        "been verified in-game. Set the CORA_EXPERIMENTAL=1 environment " +
        "variable to opt in once you understand the risk - see " +
        "src/experimental/index.ts for details.",
    )
    this.name = "ExperimentalUnverifiedError"
  }
}

/**
 * Thrown by every `experimental.*` export once `CORA_EXPERIMENTAL=1` lifts
 * the fence above. The signature is real; the implementation is not - it is
 * pending in-game verification and lands in a later CORA phase (2b/2c).
 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(
      `"${feature}" is fenced open (CORA_EXPERIMENTAL=1) but has no real ` +
        "implementation yet. It is pending in-game verification and will " +
        "land in a later CORA phase (2b/2c).",
    )
    this.name = "NotImplementedError"
  }
}

/**
 * Every `experimental.*` export funnels through this single fence. It
 * never returns: either `CORA_EXPERIMENTAL` is unset and it throws
 * `ExperimentalUnverifiedError`, or it is set to `"1"` and it throws
 * `NotImplementedError` - there is no third, non-throwing path yet.
 */
function fence(feature: string): never {
  if (process.env.CORA_EXPERIMENTAL !== "1") {
    throw new ExperimentalUnverifiedError(feature)
  }
  throw new NotImplementedError(feature)
}

/**
 * Sets the on-screen nameplate text for `playerId`.
 *
 * Intended bridge: `inkTextWidget` inside `inkHUDLayer`, per-frame
 * projected to the target player's screen position, based on observed
 * behavior of the CyberMP reference gamemode's nameplate mechanism.
 * Unverified: CORA has never driven this widget.
 */
export function setNameplateText(playerId: number, text: string): void {
  fence(`setNameplateText(${playerId}, ${JSON.stringify(text)})`)
}

/**
 * Creates a minimap marker ("map pin") at `position`, addressable later by
 * `id`.
 *
 * Intended bridge: the native mappin system, based on observed behavior of
 * the CyberMP reference gamemode. Unverified: CORA has never created or
 * removed a native mappin.
 */
export function createMapPin(id: string, position: Vec3): void {
  fence(`createMapPin(${id}, ${JSON.stringify(position)})`)
}

/**
 * Removes a previously created map pin by `id`.
 */
export function removeMapPin(id: string): void {
  fence(`removeMapPin(${id})`)
}

/**
 * Toggles the visibility of a native HUD element (health bar, minimap,
 * quest tracker, and so on).
 *
 * Intended bridge: the config-var/`GHudService` pattern observed for native
 * HUD toggling in the CyberMP reference gamemode. Unverified.
 */
export function setHudElementVisible(element: string, visible: boolean): void {
  fence(`setHudElementVisible(${element}, ${visible})`)
}

/**
 * Grants a native inventory item to `playerId` by TweakDB id (for example
 * `"Items.Cyberdeck"`).
 *
 * Intended bridge: `mp.game.AddToInventory`, mirroring an equip/grant
 * action from server-authoritative inventory state into a real game item
 * (see the "hybrid" inventory strategy in the design spec). Unverified.
 */
export function grantNativeItem(playerId: number, tweakDbId: string): void {
  fence(`grantNativeItem(${playerId}, ${tweakDbId})`)
}

/**
 * Opens the native character appearance editor for `playerId`.
 *
 * Intended bridge: `MenuScenario_CharacterCustomizationMirror`, based on
 * observed behavior of the CyberMP reference gamemode's appearance-editing
 * flow. Unverified.
 */
export function openAppearanceEditor(playerId: number): void {
  fence(`openAppearanceEditor(${playerId})`)
}
