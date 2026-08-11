import type { RpcServerContext } from "@cybermp/rpc-server"

/**
 * The rpc bridge between `CoraPlatform` and `@cybermp/rpc-server@0.2.0`.
 *
 * Based on observed behavior of the CyberMP reference gamemode,
 * `@cybermp/rpc-router`'s contract/procedure builders are a *higher* layer
 * on top of the same `RpcServer` this module uses directly - and
 * `RpcServer` (via its base `RpcBase`) already exposes exactly the
 * "register by name" primitive `CoraPlatform.registerRpcHandler` needs:
 *
 * - `RpcServer.register(method, ...handlers)` (inherited from `RpcBase`,
 *   itself delegating to an internal `RpcProvider`) adds a named REGISTER
 *   (call/response) handler - this is the dynamic by-name registration
 *   surface, no router/contract layer required.
 * - `RpcServer.callClient(player, method, data)` is the direct client-call
 *   surface `CoraPlatform.callClient` needs.
 *
 * So the "pragmatic bridge" the plan anticipated turned out to be a thin
 * wrapper rather than a hand-rolled dynamic handler map: `RpcServer`'s own
 * API already matches `CoraPlatform`'s shape closely enough that no extra
 * indirection is needed. The one adaptation made here is unwrapping
 * `RpcServer`'s `(ctx, next)` handler signature - `ctx.data` /
 * `ctx.player.id` - down to `CoraPlatform`'s plain `(input, playerId)`.
 *
 * Duplicate-name protection: `RpcProvider.register` does not itself reject
 * a second registration under the same name (this is unverified until
 * in-game testing is possible for the router layer's own `RpcRouter.apply()`
 * gotchas, which this module does not use in the first place). CORA
 * enforces "duplicate name throws" itself, matching `createTestPlatform`'s
 * behavior, by tracking registered names before ever calling into
 * `RpcServer`.
 *
 * `RpcServer` is imported dynamically inside `createCyberMpRpc` rather than
 * at module top level: `@cybermp/rpc-server` throws at import time (not
 * construction time) when the native `mp` global is absent, so a top-level
 * import would make this module fail to load outside a live CyberMP
 * process, before `getNativeMp()`'s own friendly error ever gets a chance
 * to run. Only the type import above stays static - types are erased and
 * never trigger the runtime import.
 */
export interface CyberMpRpc {
  registerRpcHandler(
    name: string,
    handler: (input: unknown, playerId: number) => Promise<unknown>,
  ): void
  callClient(playerId: number, name: string, payload: unknown): Promise<unknown>
}

/**
 * Constructs the rpc bridge. Async because it dynamically imports
 * `@cybermp/rpc-server` (see the module docstring above); callers must
 * await it before `RpcServer` is available. Takes no `MpServer` reference -
 * `RpcServer`'s own databus talks to the native `mp` global internally
 * (mirroring the same "Local Approach" pattern `getNativeMp` follows for
 * the rest of the adapter), so nothing here needs to thread it through.
 */
export async function createCyberMpRpc(): Promise<CyberMpRpc> {
  const { RpcServer } = await import("@cybermp/rpc-server")
  const rpcServer = new RpcServer({ name: "cora" })
  const registeredNames = new Set<string>()

  return {
    registerRpcHandler(name, handler) {
      if (registeredNames.has(name)) {
        throw new Error(`rpc handler "${name}" is already registered`)
      }
      registeredNames.add(name)

      rpcServer.register(name, async (ctx: RpcServerContext) => {
        return handler(ctx.data, ctx.player.id)
      })
    },
    async callClient(playerId, name, payload) {
      return rpcServer.callClient(playerId, name, payload)
    },
  }
}
