import type { TypedEmitter } from "@cora-framework/lib"

/**
 * Minimal player identity as seen by the kernel and modules. Grows over
 * time as modules need more fields; keep additions backward-compatible.
 */
export interface CoraPlayer {
  id: number
  name: string
}

/**
 * The stable set of platform events the kernel can subscribe to. This is
 * intentionally small: only events validated against real upstream usage
 * are promoted here. Anything else belongs under `experimental`.
 */
export interface PlatformEvents extends Record<string, unknown[]> {
  playerConnected: [player: CoraPlayer]
  playerDisconnected: [player: CoraPlayer, reason: string]
  playerDeath: [player: CoraPlayer, killerId: number | null]
  damage: [targetId: number, attackerId: number | null, amount: number]
  resourceStop: []
}

/**
 * The typed boundary between the kernel and the underlying game platform.
 * The kernel and every module depend only on this interface; nothing
 * outside `src/adapter/cybermp.ts` (and its submodules) may import
 * `@cybermp/*` directly.
 */
export interface CoraPlatform {
  events: TypedEmitter<PlatformEvents>
  registerRpcHandler(
    name: string,
    handler: (input: unknown, playerId: number) => Promise<unknown>,
  ): void
  callClient(playerId: number, name: string, payload: unknown): Promise<unknown>
  log(level: "info" | "warn" | "error", message: string): void
}
