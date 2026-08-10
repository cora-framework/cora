import { distance, type Vec3 } from "../math/vec3"

/**
 * Zones use an x/y ground-plane with z as the vertical height axis, matching
 * typical game-world semantics (a "poly" zone is a 2D footprint extruded
 * along z between minZ and maxZ).
 */

export interface SphereZone {
  kind: "sphere"
  center: Vec3
  radius: number
}

export interface BoxZone {
  kind: "box"
  min: Vec3
  max: Vec3
}

export interface Point2D {
  x: number
  y: number
}

export interface PolyZone {
  kind: "poly"
  points: Point2D[]
  minZ: number
  maxZ: number
}

export type Zone = SphereZone | BoxZone | PolyZone

export function sphereZone(center: Vec3, radius: number): SphereZone {
  return { kind: "sphere", center, radius }
}

/**
 * Constructs an axis-aligned box zone. min/max are normalized per axis, so
 * swapped corners (e.g. min.x > max.x) are handled transparently.
 */
export function boxZone(min: Vec3, max: Vec3): BoxZone {
  return {
    kind: "box",
    min: {
      x: Math.min(min.x, max.x),
      y: Math.min(min.y, max.y),
      z: Math.min(min.z, max.z),
    },
    max: {
      x: Math.max(min.x, max.x),
      y: Math.max(min.y, max.y),
      z: Math.max(min.z, max.z),
    },
  }
}

/**
 * Constructs a polygon zone extruded between minZ and maxZ. Throws
 * TypeError if fewer than 3 points are given (a polygon needs at least 3
 * vertices to enclose an area).
 */
export function polyZone(
  points: readonly Point2D[],
  minZ: number,
  maxZ: number,
): PolyZone {
  if (points.length < 3) {
    throw new TypeError(
      `polyZone requires at least 3 points, received ${points.length}`,
    )
  }
  return {
    kind: "poly",
    points: points.map((p) => ({ x: p.x, y: p.y })),
    minZ,
    maxZ,
  }
}

/**
 * Returns true when `point` lies exactly on the segment a-b (within a small
 * numerical tolerance), inclusive of the endpoints.
 */
function isOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const epsilon = 1e-9
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  if (Math.abs(cross) > epsilon) {
    return false
  }
  const dotProduct = (px - ax) * (bx - ax) + (py - ay) * (by - ay)
  if (dotProduct < 0) {
    return false
  }
  const lenSq = (bx - ax) * (bx - ax) + (by - ay) * (by - ay)
  return dotProduct <= lenSq
}

/**
 * Point-in-polygon test on the x/y plane using ray casting.
 *
 * Chosen boundary semantics: a point that lies exactly on a polygon edge
 * (including its vertices) is treated as INSIDE. This is checked explicitly
 * before ray casting, since plain ray casting has ambiguous/inconsistent
 * behavior for boundary points depending on which edge the cast ray grazes.
 */
function isInsidePolygon2D(
  points: readonly Point2D[],
  px: number,
  py: number,
): boolean {
  const n = points.length

  for (let i = 0; i < n; i++) {
    const a = points[i] as Point2D
    const b = points[(i + 1) % n] as Point2D
    if (isOnSegment(px, py, a.x, a.y, b.x, b.y)) {
      return true
    }
  }

  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = points[i] as Point2D
    const pj = points[j] as Point2D
    const intersects =
      pi.y > py !== pj.y > py &&
      px < ((pj.x - pi.x) * (py - pi.y)) / (pj.y - pi.y) + pi.x
    if (intersects) {
      inside = !inside
    }
  }
  return inside
}

export function isInside(zone: Zone, point: Vec3): boolean {
  switch (zone.kind) {
    case "sphere": {
      const dx = point.x - zone.center.x
      const dy = point.y - zone.center.y
      const dz = point.z - zone.center.z
      const distSq = dx * dx + dy * dy + dz * dz
      return distSq <= zone.radius * zone.radius
    }
    case "box": {
      return (
        point.x >= zone.min.x &&
        point.x <= zone.max.x &&
        point.y >= zone.min.y &&
        point.y <= zone.max.y &&
        point.z >= zone.min.z &&
        point.z <= zone.max.z
      )
    }
    case "poly": {
      if (point.z < zone.minZ || point.z > zone.maxZ) {
        return false
      }
      return isInsidePolygon2D(zone.points, point.x, point.y)
    }
  }
}

export function distanceToCenter(zone: Zone, point: Vec3): number {
  switch (zone.kind) {
    case "sphere": {
      return distance(zone.center, point)
    }
    case "box": {
      const center: Vec3 = {
        x: (zone.min.x + zone.max.x) / 2,
        y: (zone.min.y + zone.max.y) / 2,
        z: (zone.min.z + zone.max.z) / 2,
      }
      return distance(center, point)
    }
    case "poly": {
      const cx =
        zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length
      const cy =
        zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length
      const cz = (zone.minZ + zone.maxZ) / 2
      return distance({ x: cx, y: cy, z: cz }, point)
    }
  }
}
