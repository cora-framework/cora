import type { MoneyUiUpdatePayload } from "../contract.js"

/**
 * Thin, compile-only sketch of the browser-relay client wiring for the
 * `cora.money.ui.update` push, mirroring
 * `@cora-framework/inventory/src/client/index.ts`'s pattern (which itself
 * mirrors `@cora-framework/characters/src/client/index.ts`).
 *
 * This is NOT exercised at runtime and has no test coverage beyond
 * typechecking - there is no live CyberMP client context available to CORA
 * yet, so nothing here has been proven to work in-game. It exists to give a
 * concrete, typed shape for the future client resource to call once that
 * context exists: register `handleUiUpdate` against whatever browser-relay
 * transport CyberMP exposes for `cora.money.ui.update` (see `../contract.ts`
 * for the payload shape and `../server/money-module.ts` for the
 * server-side flow that pushes it after every successful balance mutation).
 *
 * Unlike `@cora-framework/inventory`'s client facade, this module has no
 * `mirrorEquipToNative`-style call into `@cora-framework/core/experimental`,
 * and deliberately does not import that surface even lazily. Money has no
 * native game-side counterpart to mirror: inventory equips reflect into a
 * real game item via the (unverified) native item bridge, but a
 * cash/bank/crypto balance is purely a CORA-side concept with no
 * CyberMP-native equivalent to keep in sync. Reaching for the experimental
 * surface here would be dishonest scaffolding for a mirror operation that
 * does not exist, so this facade only ever relays the balance push inward.
 */
export interface MoneyClientDeps {
  /** Called when the server pushes `cora.money.ui.update`. */
  onUpdate(data: MoneyUiUpdatePayload): void
}

export interface MoneyClientHandle {
  /** Untyped relay entrypoint for `cora.money.ui.update`. */
  handleUiUpdate(data: unknown): void
}

/**
 * Builds the handle a future browser-relay client resource registers
 * `cora.money.ui.update` against. The `data: unknown` parameter mirrors how
 * a real relay transport would hand over an unvalidated payload; this thin
 * facade is the boundary where it gets cast to the typed contract shape
 * before reaching `deps`.
 */
export function registerMoneyClient(deps: MoneyClientDeps): MoneyClientHandle {
  return {
    handleUiUpdate(data: unknown): void {
      deps.onUpdate(data as MoneyUiUpdatePayload)
    },
  }
}
