import { describe, expect, it } from "vitest"
import {
  add,
  cross,
  distance,
  distanceSq,
  dot,
  equalsApprox,
  length,
  lengthSq,
  lerp,
  normalize,
  scale,
  sub,
  vec3,
} from "./vec3"

describe("vec3", () => {
  describe("vec3()", () => {
    it("constructs a vector with x, y, z", () => {
      const v = vec3(1, 2, 3)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
    })

    it("constructs with zero values", () => {
      const v = vec3(0, 0, 0)
      expect(v).toEqual({ x: 0, y: 0, z: 0 })
    })

    it("constructs with negative values", () => {
      const v = vec3(-1, -2, -3)
      expect(v.x).toBe(-1)
      expect(v.y).toBe(-2)
      expect(v.z).toBe(-3)
    })
  })

  describe("add()", () => {
    it("adds two vectors component-wise", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const result = add(a, b)
      expect(result).toEqual({ x: 5, y: 7, z: 9 })
    })

    it("does not mutate input vectors", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const aOriginal = { x: a.x, y: a.y, z: a.z }
      const bOriginal = { x: b.x, y: b.y, z: b.z }
      add(a, b)
      expect(a).toEqual(aOriginal)
      expect(b).toEqual(bOriginal)
    })

    it("add and sub roundtrip: a + b - b = a", () => {
      const a = vec3(1.5, 2.7, 3.3)
      const b = vec3(4.2, 5.1, 6.8)
      const result = sub(add(a, b), b)
      expect(equalsApprox(result, a)).toBe(true)
    })
  })

  describe("sub()", () => {
    it("subtracts two vectors component-wise", () => {
      const a = vec3(5, 7, 9)
      const b = vec3(1, 2, 3)
      const result = sub(a, b)
      expect(result).toEqual({ x: 4, y: 5, z: 6 })
    })

    it("does not mutate input vectors", () => {
      const a = vec3(5, 7, 9)
      const b = vec3(1, 2, 3)
      const aOriginal = { x: a.x, y: a.y, z: a.z }
      const bOriginal = { x: b.x, y: b.y, z: b.z }
      sub(a, b)
      expect(a).toEqual(aOriginal)
      expect(b).toEqual(bOriginal)
    })
  })

  describe("scale()", () => {
    it("scales a vector by a scalar", () => {
      const v = vec3(1, 2, 3)
      const result = scale(v, 2)
      expect(result).toEqual({ x: 2, y: 4, z: 6 })
    })

    it("scales by zero", () => {
      const v = vec3(1, 2, 3)
      const result = scale(v, 0)
      expect(result).toEqual({ x: 0, y: 0, z: 0 })
    })

    it("scales by negative scalar", () => {
      const v = vec3(1, 2, 3)
      const result = scale(v, -1)
      expect(result).toEqual({ x: -1, y: -2, z: -3 })
    })

    it("does not mutate input vector", () => {
      const v = vec3(1, 2, 3)
      const vOriginal = { x: v.x, y: v.y, z: v.z }
      scale(v, 2)
      expect(v).toEqual(vOriginal)
    })
  })

  describe("dot()", () => {
    it("computes dot product", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const result = dot(a, b)
      expect(result).toBe(1 * 4 + 2 * 5 + 3 * 6) // 4 + 10 + 18 = 32
    })

    it("dot product of orthogonal vectors is zero", () => {
      const a = vec3(1, 0, 0)
      const b = vec3(0, 1, 0)
      expect(dot(a, b)).toBe(0)
    })

    it("dot product is commutative", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      expect(dot(a, b)).toBe(dot(b, a))
    })

    it("does not mutate input vectors", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const aOriginal = { x: a.x, y: a.y, z: a.z }
      const bOriginal = { x: b.x, y: b.y, z: b.z }
      dot(a, b)
      expect(a).toEqual(aOriginal)
      expect(b).toEqual(bOriginal)
    })
  })

  describe("cross()", () => {
    it("computes cross product", () => {
      const a = vec3(1, 0, 0)
      const b = vec3(0, 1, 0)
      const result = cross(a, b)
      expect(result).toEqual({ x: 0, y: 0, z: 1 })
    })

    it("right-hand rule: unit X x unit Y = unit Z", () => {
      const x = vec3(1, 0, 0)
      const y = vec3(0, 1, 0)
      const z = cross(x, y)
      expect(z).toEqual({ x: 0, y: 0, z: 1 })
    })

    it("right-hand rule: unit Y x unit Z = unit X", () => {
      const y = vec3(0, 1, 0)
      const z = vec3(0, 0, 1)
      const x = cross(y, z)
      expect(x).toEqual({ x: 1, y: 0, z: 0 })
    })

    it("right-hand rule: unit Z x unit X = unit Y", () => {
      const z = vec3(0, 0, 1)
      const x = vec3(1, 0, 0)
      const y = cross(z, x)
      expect(y).toEqual({ x: 0, y: 1, z: 0 })
    })

    it("cross product is anti-commutative: a x b = -(b x a)", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const ab = cross(a, b)
      const ba = cross(b, a)
      expect(equalsApprox(ab, scale(ba, -1))).toBe(true)
    })

    it("does not mutate input vectors", () => {
      const a = vec3(1, 0, 0)
      const b = vec3(0, 1, 0)
      const aOriginal = { x: a.x, y: a.y, z: a.z }
      const bOriginal = { x: b.x, y: b.y, z: b.z }
      cross(a, b)
      expect(a).toEqual(aOriginal)
      expect(b).toEqual(bOriginal)
    })
  })

  describe("lengthSq()", () => {
    it("computes squared length", () => {
      const v = vec3(3, 4, 0)
      expect(lengthSq(v)).toBe(9 + 16) // 25
    })

    it("zero vector has zero squared length", () => {
      expect(lengthSq(vec3(0, 0, 0))).toBe(0)
    })

    it("does not mutate input vector", () => {
      const v = vec3(3, 4, 0)
      const vOriginal = { x: v.x, y: v.y, z: v.z }
      lengthSq(v)
      expect(v).toEqual(vOriginal)
    })
  })

  describe("length()", () => {
    it("computes length", () => {
      const v = vec3(3, 4, 0)
      expect(length(v)).toBe(5)
    })

    it("zero vector has zero length", () => {
      expect(length(vec3(0, 0, 0))).toBe(0)
    })

    it("unit vector has length 1", () => {
      const v = vec3(1, 0, 0)
      expect(length(v)).toBe(1)
    })

    it("does not mutate input vector", () => {
      const v = vec3(3, 4, 0)
      const vOriginal = { x: v.x, y: v.y, z: v.z }
      length(v)
      expect(v).toEqual(vOriginal)
    })
  })

  describe("distanceSq()", () => {
    it("computes squared distance between two points", () => {
      const a = vec3(0, 0, 0)
      const b = vec3(3, 4, 0)
      expect(distanceSq(a, b)).toBe(25)
    })

    it("distance is symmetric", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      expect(distanceSq(a, b)).toBe(distanceSq(b, a))
    })

    it("does not mutate input vectors", () => {
      const a = vec3(0, 0, 0)
      const b = vec3(3, 4, 0)
      const aOriginal = { x: a.x, y: a.y, z: a.z }
      const bOriginal = { x: b.x, y: b.y, z: b.z }
      distanceSq(a, b)
      expect(a).toEqual(aOriginal)
      expect(b).toEqual(bOriginal)
    })
  })

  describe("distance()", () => {
    it("computes distance between two points", () => {
      const a = vec3(0, 0, 0)
      const b = vec3(3, 4, 0)
      expect(distance(a, b)).toBe(5)
    })

    it("distance is symmetric", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      expect(distance(a, b)).toBe(distance(b, a))
    })

    it("distance from a point to itself is zero", () => {
      const a = vec3(1, 2, 3)
      expect(distance(a, a)).toBe(0)
    })

    it("does not mutate input vectors", () => {
      const a = vec3(0, 0, 0)
      const b = vec3(3, 4, 0)
      const aOriginal = { x: a.x, y: a.y, z: a.z }
      const bOriginal = { x: b.x, y: b.y, z: b.z }
      distance(a, b)
      expect(a).toEqual(aOriginal)
      expect(b).toEqual(bOriginal)
    })
  })

  describe("normalize()", () => {
    it("normalizes a vector to unit length", () => {
      const v = vec3(3, 4, 0)
      const result = normalize(v)
      expect(length(result)).toBeCloseTo(1)
    })

    it("normalized vector is parallel to original", () => {
      const v = vec3(3, 4, 0)
      const normalized = normalize(v)
      expect(dot(normalized, scale(v, 1 / length(v)))).toBeCloseTo(1)
    })

    it("zero vector returns zero vector (safe)", () => {
      const v = vec3(0, 0, 0)
      const result = normalize(v)
      expect(result).toEqual({ x: 0, y: 0, z: 0 })
    })

    it("does not mutate input vector", () => {
      const v = vec3(3, 4, 0)
      const vOriginal = { x: v.x, y: v.y, z: v.z }
      normalize(v)
      expect(v).toEqual(vOriginal)
    })

    it("unit vector remains unit vector", () => {
      const v = vec3(1, 0, 0)
      const result = normalize(v)
      expect(result).toEqual({ x: 1, y: 0, z: 0 })
    })
  })

  describe("lerp()", () => {
    it("lerp(a, b, 0) returns a", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const result = lerp(a, b, 0)
      expect(equalsApprox(result, a)).toBe(true)
    })

    it("lerp(a, b, 1) returns b", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const result = lerp(a, b, 1)
      expect(equalsApprox(result, b)).toBe(true)
    })

    it("lerp(a, b, 0.5) returns midpoint", () => {
      const a = vec3(0, 0, 0)
      const b = vec3(2, 4, 6)
      const result = lerp(a, b, 0.5)
      expect(equalsApprox(result, vec3(1, 2, 3))).toBe(true)
    })

    it("clamps t to [0, 1] below 0", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const result = lerp(a, b, -0.5)
      expect(equalsApprox(result, a)).toBe(true)
    })

    it("clamps t to [0, 1] above 1", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const result = lerp(a, b, 1.5)
      expect(equalsApprox(result, b)).toBe(true)
    })

    it("does not mutate input vectors", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(4, 5, 6)
      const aOriginal = { x: a.x, y: a.y, z: a.z }
      const bOriginal = { x: b.x, y: b.y, z: b.z }
      lerp(a, b, 0.5)
      expect(a).toEqual(aOriginal)
      expect(b).toEqual(bOriginal)
    })
  })

  describe("equalsApprox()", () => {
    it("vectors within epsilon are equal", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(1 + 1e-7, 2 + 1e-7, 3 + 1e-7)
      expect(equalsApprox(a, b, 1e-6)).toBe(true)
    })

    it("vectors outside epsilon are not equal", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(1 + 1e-5, 2 + 1e-5, 3 + 1e-5)
      expect(equalsApprox(a, b, 1e-6)).toBe(false)
    })

    it("identical vectors are equal", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(1, 2, 3)
      expect(equalsApprox(a, b)).toBe(true)
    })

    it("uses default epsilon of 1e-6", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(1 + 1e-7, 2 + 1e-7, 3 + 1e-7)
      expect(equalsApprox(a, b)).toBe(true)
    })

    it("does not mutate input vectors", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(1, 2, 3)
      const aOriginal = { x: a.x, y: a.y, z: a.z }
      const bOriginal = { x: b.x, y: b.y, z: b.z }
      equalsApprox(a, b)
      expect(a).toEqual(aOriginal)
      expect(b).toEqual(bOriginal)
    })

    it("only one component outside epsilon makes vectors unequal", () => {
      const a = vec3(1, 2, 3)
      const b = vec3(1 + 1e-7, 2 + 1e-5, 3 + 1e-7)
      expect(equalsApprox(a, b, 1e-6)).toBe(false)
    })
  })
})
