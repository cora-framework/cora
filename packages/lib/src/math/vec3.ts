export interface Vec3 {
  x: number
  y: number
  z: number
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  }
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

export function scale(v: Vec3, s: number): Vec3 {
  return {
    x: v.x * s,
    y: v.y * s,
    z: v.z * s,
  }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function lengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z
}

export function length(v: Vec3): number {
  return Math.sqrt(lengthSq(v))
}

export function distanceSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSq(a, b))
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v)
  if (len === 0) {
    return { x: 0, y: 0, z: 0 }
  }
  return scale(v, 1 / len)
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const clamped = Math.max(0, Math.min(1, t))
  return {
    x: a.x + (b.x - a.x) * clamped,
    y: a.y + (b.y - a.y) * clamped,
    z: a.z + (b.z - a.z) * clamped,
  }
}

export function equalsApprox(
  a: Vec3,
  b: Vec3,
  epsilon: number = 1e-6,
): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.z - b.z) <= epsilon
  )
}
