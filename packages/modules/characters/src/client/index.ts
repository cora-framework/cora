import type {
  CharactersUiClosePayload,
  CharactersUiOpenPayload,
} from "../contract.js"

/**
 * Thin, compile-only sketch of the browser-relay client wiring for the
 * character-select flow.
 *
 * This is NOT exercised at runtime and has no test coverage beyond
 * typechecking - there is no live CyberMP client context available to CORA
 * yet, so nothing here has been proven to work in-game. It exists to give a
 * concrete, typed shape for the future client resource to call once that
 * context exists: register `handleUiOpen`/`handleUiClose` against whatever
 * browser-relay transport CyberMP exposes for `cora.characters.ui.open` /
 * `cora.characters.ui.close` (see `../contract.ts` for the payload shapes
 * and `../server/session.ts` for the server-side flow that pushes them).
 *
 * `requestAppearanceEditor` reaches for the experimental, unverified
 * `openAppearanceEditor` bridge from `@cora-framework/core/experimental`
 * behind a lazy dynamic import - lazy so importing this module never eagerly
 * pulls in the experimental surface, and wrapped in try/catch because that
 * surface throws by design (see `packages/core/src/experimental/index.ts`)
 * unless `CORA_EXPERIMENTAL=1` is set, and even then has no real
 * implementation yet. Any failure here is swallowed rather than surfaced:
 * this whole module is a sketch, not a proven runtime path, so honesty about
 * that limitation matters more than pretending a caught error means
 * something.
 */
export interface CharactersClientDeps {
  /** Called when the server pushes `cora.characters.ui.open`. */
  onOpen(data: CharactersUiOpenPayload): void
  /** Called when the server pushes `cora.characters.ui.close`. */
  onClose(data: CharactersUiClosePayload): void
  /**
   * Optional hook the future client resource can use to react to an
   * appearance-editor request (e.g. update its own UI state) in addition to
   * the experimental native bridge attempt below.
   */
  requestAppearanceEditor?(playerId: number): void
}

export interface CharactersClientHandle {
  /** Untyped relay entrypoint for `cora.characters.ui.open`. */
  handleUiOpen(data: unknown): void
  /** Untyped relay entrypoint for `cora.characters.ui.close`. */
  handleUiClose(data: unknown): void
  /**
   * Requests the native character appearance editor for `playerId` for a
   * newly created character. Unverified until game launch - see the module
   * docstring above.
   */
  requestAppearanceEditor(playerId: number): void
}

/**
 * Builds the handle a future browser-relay client resource registers
 * `cora.characters.ui.open` / `cora.characters.ui.close` against. The
 * `data: unknown` parameters mirror how a real relay transport would hand
 * over an unvalidated payload; this thin facade is the boundary where it
 * gets cast to the typed contract shape before reaching `deps`.
 */
export function registerCharactersClient(
  deps: CharactersClientDeps,
): CharactersClientHandle {
  return {
    handleUiOpen(data: unknown): void {
      deps.onOpen(data as CharactersUiOpenPayload)
    },
    handleUiClose(data: unknown): void {
      deps.onClose(data as CharactersUiClosePayload)
    },
    requestAppearanceEditor(playerId: number): void {
      deps.requestAppearanceEditor?.(playerId)
      void openAppearanceEditorUnverified(playerId)
    },
  }
}

/**
 * Lazily imports the experimental `openAppearanceEditor` bridge and calls
 * it, swallowing whatever it throws. See the module docstring: this is
 * documented, honest best-effort only - never a proven runtime path.
 */
async function openAppearanceEditorUnverified(playerId: number): Promise<void> {
  try {
    const experimental = await import("@cora-framework/core/experimental")
    experimental.openAppearanceEditor(playerId)
  } catch {
    // Expected in every environment today: either CORA_EXPERIMENTAL is
    // unset (ExperimentalUnverifiedError) or it is set but unimplemented
    // (NotImplementedError). Neither is actionable here.
  }
}
