import {
  err,
  isInside,
  ok,
  type Result,
  sphereZone,
  type Vec3,
} from "@cora/lib"

const SPAWN_ZONE = sphereZone({ x: 0, y: 0, z: 0 }, 50)

/**
 * Checks whether a player position lies inside the sample spawn zone.
 * Replace this with real game logic - it exists to demonstrate wiring
 * @cora/lib's Result and zone helpers into a server module.
 */
export function checkSpawnZone(
  position: Vec3,
): Result<{ inside: boolean }, string> {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    return err("position must consist of finite numbers")
  }

  return ok({ inside: isInside(SPAWN_ZONE, position) })
}
