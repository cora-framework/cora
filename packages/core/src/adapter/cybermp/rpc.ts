import { RpcServer, type RpcServerContext } from "@cybermp/rpc-server"

/**
 * The rpc bridge between `CoraPlatform` and `@cybermp/rpc-server@0.2.0`.
 *
 * Per `docs/superpowers/research/cybermp-rpc-types.md`, `@cybermp/rpc-router`'s
 * contract/procedure builders are a *higher* layer on top of the same
 * `RpcServer` this module uses directly - and `RpcServer` (via its base
 * `RpcBase`) already exposes exactly the "register by name" primitive
 * `CoraPlatform.registerRpcHandler` needs:
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
 * a second registration under the same name (the dossier's own gotcha
 * about `RpcRouter.apply()` being destructive is about the *router* layer,
 * which this module does not use). CORA enforces "duplicate name throws"
 * itself, matching `createTestPlatform`'s behavior, by tracking registered
 * names before ever calling into `RpcServer`.
 */
export interface CyberMpRpc {
  registerRpcHandler(
    name: string,
    handler: (input: unknown, playerId: number) => Promise<unknown>,
  ): void
  callClient(playerId: number, name: string, payload: unknown): Promise<unknown>
}

/**
 * Constructs the rpc bridge. Takes no `MpServer` reference - `RpcServer`'s
 * own databus talks to the native `mp` global internally (mirroring the
 * same "Local Approach" pattern `getNativeMp` follows for the rest of the
 * adapter), so nothing here needs to thread it through.
 */
export function createCyberMpRpc(): CyberMpRpc {
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
