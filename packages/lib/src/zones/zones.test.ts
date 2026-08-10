import { describe, expect, it } from "vitest"
import { vec3 } from "../math/vec3"
import {
  boxZone,
  distanceToCenter,
  isInside,
  polyZone,
  sphereZone,
} from "./zones"

describe("zones", () => {
  describe("sphereZone()", () => {
    it("constructs a sphere zone", () => {
      const z = sphereZone(vec3(0, 0, 0), 5)
      expect(z).toEqual({
        kind: "sphere",
        center: { x: 0, y: 0, z: 0 },
        radius: 5,
      })
    })
  })

  describe("boxZone()", () => {
    it("constructs a box zone with min < max as-is", () => {
      const z = boxZone(vec3(0, 0, 0), vec3(10, 10, 10))
      expect(z).toEqual({
        kind: "box",
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 10 },
      })
    })

    it("normalizes swapped min/max per axis", () => {
      const z = boxZone(vec3(10, -5, 8), vec3(-2, 5, 1))
      expect(z).toEqual({
        kind: "box",
        min: { x: -2, y: -5, z: 1 },
        max: { x: 10, y: 5, z: 8 },
      })
    })

    it("normalizes fully swapped corners", () => {
      const z = boxZone(vec3(10, 10, 10), vec3(0, 0, 0))
      expect(z).toEqual({
        kind: "box",
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 10 },
      })
    })
  })

  describe("polyZone()", () => {
    it("constructs a poly zone with 3 or more points", () => {
      const z = polyZone(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
        0,
        5,
      )
      expect(z.kind).toBe("poly")
      expect(z.points).toHaveLength(3)
      expect(z.minZ).toBe(0)
      expect(z.maxZ).toBe(5)
    })

    it("throws TypeError on 0 points", () => {
      expect(() => polyZone([], 0, 5)).toThrow(TypeError)
    })

    it("throws TypeError on 1 point", () => {
      expect(() => polyZone([{ x: 0, y: 0 }], 0, 5)).toThrow(TypeError)
    })

    it("throws TypeError on 2 points", () => {
      expect(() =>
        polyZone(
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          0,
          5,
        ),
      ).toThrow(TypeError)
    })
  })

  describe("isInside() - sphere", () => {
    const z = sphereZone(vec3(0, 0, 0), 5)

    it("point at center is inside", () => {
      expect(isInside(z, vec3(0, 0, 0))).toBe(true)
    })

    it("point inside radius is inside", () => {
      expect(isInside(z, vec3(3, 0, 0))).toBe(true)
    })

    it("point exactly on radius boundary is inside (inclusive)", () => {
      expect(isInside(z, vec3(5, 0, 0))).toBe(true)
    })

    it("point just outside radius is not inside", () => {
      expect(isInside(z, vec3(5.0001, 0, 0))).toBe(false)
    })

    it("point far outside is not inside", () => {
      expect(isInside(z, vec3(100, 100, 100))).toBe(false)
    })
  })

  describe("isInside() - box", () => {
    const z = boxZone(vec3(0, 0, 0), vec3(10, 10, 10))

    it("point inside box is inside", () => {
      expect(isInside(z, vec3(5, 5, 5))).toBe(true)
    })

    it("point on min corner is inside (inclusive)", () => {
      expect(isInside(z, vec3(0, 0, 0))).toBe(true)
    })

    it("point on max corner is inside (inclusive)", () => {
      expect(isInside(z, vec3(10, 10, 10))).toBe(true)
    })

    it("point on a face boundary is inside (inclusive)", () => {
      expect(isInside(z, vec3(0, 5, 5))).toBe(true)
    })

    it("point just outside min bound is not inside", () => {
      expect(isInside(z, vec3(-0.0001, 5, 5))).toBe(false)
    })

    it("point just outside max bound is not inside", () => {
      expect(isInside(z, vec3(10.0001, 5, 5))).toBe(false)
    })
  })

  describe("isInside() - poly", () => {
    // Square [0,0]-[10,0]-[10,10]-[0,10], z range [0, 5]
    const square = polyZone(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      0,
      5,
    )

    it("point in the middle is inside", () => {
      expect(isInside(square, vec3(5, 5, 2))).toBe(true)
    })

    it("point outside the polygon (x/y) is not inside", () => {
      expect(isInside(square, vec3(20, 20, 2))).toBe(false)
    })

    it("point below minZ is not inside", () => {
      expect(isInside(square, vec3(5, 5, -1))).toBe(false)
    })

    it("point above maxZ is not inside", () => {
      expect(isInside(square, vec3(5, 5, 6))).toBe(false)
    })

    it("point exactly at minZ is inside (inclusive z range)", () => {
      expect(isInside(square, vec3(5, 5, 0))).toBe(true)
    })

    it("point exactly at maxZ is inside (inclusive z range)", () => {
      expect(isInside(square, vec3(5, 5, 5))).toBe(true)
    })

    // Documented semantics: a point that lies exactly on a polygon edge is
    // treated as INSIDE. This avoids the classic ray-casting ambiguity where
    // a point on the boundary could unpredictably resolve to true or false
    // depending on which edge the casted ray happens to graze.
    it("point exactly on a polygon edge is inside (documented semantics)", () => {
      expect(isInside(square, vec3(5, 0, 2))).toBe(true)
      expect(isInside(square, vec3(0, 5, 2))).toBe(true)
    })

    it("point exactly on a polygon vertex is inside (documented semantics)", () => {
      expect(isInside(square, vec3(0, 0, 2))).toBe(true)
      expect(isInside(square, vec3(10, 10, 2))).toBe(true)
    })

    it("concave polygon: point in the notch is not inside", () => {
      // A "C" / notch shape (concave): a 10x10 square with a rectangular
      // bite taken out of the middle-right side.
      const concave = polyZone(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 4 },
          { x: 5, y: 4 },
          { x: 5, y: 6 },
          { x: 10, y: 6 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        0,
        5,
      )

      // Point inside the notch (bitten-out area) should be outside the poly.
      expect(isInside(concave, vec3(8, 5, 2))).toBe(false)
      // Point inside the solid body of the concave shape should be inside.
      expect(isInside(concave, vec3(2, 5, 2))).toBe(true)
      // Point above the notch but still within the solid top bar.
      expect(isInside(concave, vec3(8, 8, 2))).toBe(true)
    })
  })

  describe("distanceToCenter()", () => {
    it("sphere: distance to sphere center", () => {
      const z = sphereZone(vec3(0, 0, 0), 5)
      expect(distanceToCenter(z, vec3(3, 4, 0))).toBe(5)
    })

    it("box: distance to box center", () => {
      const z = boxZone(vec3(0, 0, 0), vec3(10, 10, 10))
      // box center is (5,5,5)
      expect(distanceToCenter(z, vec3(5, 5, 5))).toBe(0)
      expect(distanceToCenter(z, vec3(5, 5, 15))).toBe(10)
    })

    it("poly: distance to x/y centroid at mid-z", () => {
      const z = polyZone(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        0,
        10,
      )
      // centroid of the 4 vertices is (5,5), midZ is 5
      expect(distanceToCenter(z, vec3(5, 5, 5))).toBe(0)
      expect(distanceToCenter(z, vec3(5, 5, 15))).toBe(10)
    })
  })
})
