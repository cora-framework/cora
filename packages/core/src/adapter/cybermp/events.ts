import { TypedEmitter } from "@cora-framework/lib"
import type { MpPlayer, MpServer } from "@cybermp/server-types"
import type { CoraPlayer, PlatformEvents } from "../types.js"

/**
 * Maps the five stable `PlatformEvents` onto the real CyberMP native event
 * bus. Names and payload shapes are pinned to `@cybermp/server-types@3.2.5`
 * and based on observed behavior of the CyberMP reference gamemode (which
 * additionally validated that all five are actually emitted by a real
 * gamemode, not merely declared in the types package):
 *
 * - `playerConnected(playerId, tempId)` -> `PlatformEvents.playerConnected`.
 *   `tempId` has no CORA equivalent and is dropped.
 * - `playerDisconnected(playerId, reason)` -> `PlatformEvents.playerDisconnected`.
 * - `playerDeath(playerId, { killerId? })` -> `PlatformEvents.playerDeath`.
 *   `killerId` is optional upstream; CORA normalizes "no killer" to `null`.
 * - `damage(playerId, data: DamageEventData)` -> `PlatformEvents.damage`.
 *   Upstream's single event covers both "who got hit" and "who hit them" in
 *   one payload (`data.killerId`, `data.totalDamage`); CORA's stable
 *   `damage` hook splits this into `(targetId, attackerId, amount)` so
 *   modules never need to know the upstream field names. Unlike
 *   `playerDeath`, upstream's `data.killerId` for `damage` is a required
 *   number with no documented "no attacker" sentinel, so it is passed
 *   through as-is (not normalized to `null`); see
 *   `createDamageKillerIdAnomalyLogger` below for the anomaly guard this
 *   implies.
 * - `resourceStop()` -> `PlatformEvents.resourceStop`, no payload either
 *   side.
 *
 * Everything else on `MpEventsMap` (spawn/respawn/despawn, vehicle enter or
 * exit, appearance change, and so on) is intentionally not bound here - see
 * RFC 0001 and `src/experimental/index.ts` for why.
 */

function toCoraPlayer(player: MpPlayer): CoraPlayer {
  return { id: player.id, name: player.nickname }
}

/**
 * Resolves a `CoraPlayer` for `playerId`. Falls back to an id-only identity
 * (empty name) rather than throwing when the native entity is already gone
 * - this matters most for `playerDisconnected`, which can fire after the
 * player entity has started tearing down.
 */
function resolveCoraPlayer(mp: MpServer, playerId: number): CoraPlayer {
  if (mp.players.exists(playerId)) {
    return toCoraPlayer(mp.players.at(playerId))
  }
  return { id: playerId, name: "" }
}

function toAttackerId(killerId: number | undefined): number | null {
  return typeof killerId === "number" ? killerId : null
}

/**
 * `DamageEventData.killerId` is a required `number` upstream with no
 * documented sentinel for "no attacker" - the no-attacker sentinel for
 * damage is undocumented upstream; values are forwarded unchanged and
 * anomalies logged. This is unlike
 * `PlayerDeathEventData.killerId`, which is optional and reliably maps to
 * `null`. Two values are the most likely "no human attacker" signals
 * (self-damage / environmental-or-NPC damage): `killerId === targetId`, and
 * negative `killerId`. Until a real sentinel is observed against a live
 * server, this only logs a warning (once per distinct anomalous value, so a
 * running server does not get spammed) - it never throws, and the mapping
 * still forwards `killerId` through unchanged.
 *
 * Pulled out as a standalone factory (rather than inlined in
 * `bindNativeEvents`) so it can be unit-tested without a `MpServer`: it only
 * ever sees plain numbers, never the native `mp` global.
 */
export function createDamageKillerIdAnomalyLogger(
  warn: (message: string) => void = (message) =>
    console.warn(`[warn] ${message}`),
): (killerId: number, targetId: number) => void {
  const loggedValues = new Set<number>()

  return (killerId, targetId) => {
    const isAnomalous = killerId === targetId || killerId < 0
    if (!isAnomalous || loggedValues.has(killerId)) {
      return
    }
    loggedValues.add(killerId)
    warn(
      `unexpected damage killerId value ${killerId} (no-attacker sentinel unknown upstream); please report`,
    )
  }
}

/**
 * Subscribes to the native `mp.events` surface and forwards each of the
 * five stable events onto a fresh `TypedEmitter<PlatformEvents>`, which
 * becomes `CoraPlatform.events`.
 */
export function bindNativeEvents(mp: MpServer): TypedEmitter<PlatformEvents> {
  const emitter = new TypedEmitter<PlatformEvents>()
  const warnDamageKillerIdAnomaly = createDamageKillerIdAnomalyLogger()

  mp.events.on("playerConnected", (playerId) => {
    emitter.emit("playerConnected", resolveCoraPlayer(mp, playerId))
  })

  mp.events.on("playerDisconnected", (playerId, reason) => {
    emitter.emit("playerDisconnected", resolveCoraPlayer(mp, playerId), reason)
  })

  mp.events.on("playerDeath", (playerId, data) => {
    emitter.emit(
      "playerDeath",
      resolveCoraPlayer(mp, playerId),
      toAttackerId(data.killerId),
    )
  })

  mp.events.on("damage", (playerId, data) => {
    warnDamageKillerIdAnomaly(data.killerId, playerId)
    emitter.emit(
      "damage",
      playerId,
      toAttackerId(data.killerId),
      data.totalDamage,
    )
  })

  mp.events.on("resourceStop", () => {
    emitter.emit("resourceStop")
  })

  return emitter
}
