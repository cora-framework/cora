import { describe, expect, it } from "vitest"
import { checkSpawnZone } from "./index"

describe("checkSpawnZone", () => {
  it("reports positions inside the spawn zone", () => {
    const result = checkSpawnZone({ x: 1, y: 1, z: 0 })
    expect(result).toEqual({ ok: true, value: { inside: true } })
  })

  it("reports positions outside the spawn zone", () => {
    const result = checkSpawnZone({ x: 100, y: 0, z: 0 })
    expect(result).toEqual({ ok: true, value: { inside: false } })
  })

  it("rejects non-finite coordinates", () => {
    const result = checkSpawnZone({ x: Number.NaN, y: 0, z: 0 })
    expect(result.ok).toBe(false)
  })
})
