import { describe, expect, it } from "vitest"
import { runDoctor } from "./doctor"

describe("runDoctor", () => {
  it("passes all checks for a healthy environment", () => {
    const checks = runDoctor({
      nodeVersion: "v22.10.0",
      pnpmVersion: "10.4.0",
      platform: "linux",
    })

    expect(checks.every((check) => check.ok)).toBe(true)
    expect(checks.map((check) => check.name)).toEqual([
      "node",
      "pnpm",
      "platform",
    ])
  })

  it("accepts node versions without a leading v prefix", () => {
    const checks = runDoctor({
      nodeVersion: "22.10.0",
      pnpmVersion: "9.0.0",
      platform: "linux",
    })

    const node = checks.find((check) => check.name === "node")
    expect(node?.ok).toBe(true)
  })

  it("fails when node is too old", () => {
    const checks = runDoctor({
      nodeVersion: "v21.7.3",
      pnpmVersion: "10.4.0",
      platform: "linux",
    })

    const node = checks.find((check) => check.name === "node")
    expect(node?.ok).toBe(false)
    expect(node?.detail).toContain("21.7.3")
  })

  it("passes node at exactly the minimum major version", () => {
    const checks = runDoctor({
      nodeVersion: "v22.0.0",
      pnpmVersion: "10.4.0",
      platform: "linux",
    })

    const node = checks.find((check) => check.name === "node")
    expect(node?.ok).toBe(true)
  })

  it("fails when pnpm is missing", () => {
    const checks = runDoctor({
      nodeVersion: "v22.10.0",
      pnpmVersion: null,
      platform: "linux",
    })

    const pnpm = checks.find((check) => check.name === "pnpm")
    expect(pnpm?.ok).toBe(false)
    expect(pnpm?.detail).toContain("not found")
  })

  it("fails when pnpm is too old", () => {
    const checks = runDoctor({
      nodeVersion: "v22.10.0",
      pnpmVersion: "8.15.0",
      platform: "linux",
    })

    const pnpm = checks.find((check) => check.name === "pnpm")
    expect(pnpm?.ok).toBe(false)
    expect(pnpm?.detail).toContain("8.15.0")
  })

  it("accepts pnpm at exactly the minimum major version", () => {
    const checks = runDoctor({
      nodeVersion: "v22.10.0",
      pnpmVersion: "9.0.0",
      platform: "linux",
    })

    const pnpm = checks.find((check) => check.name === "pnpm")
    expect(pnpm?.ok).toBe(true)
  })

  it("reports the platform check as informational and always ok", () => {
    const checks = runDoctor({
      nodeVersion: "v22.10.0",
      pnpmVersion: "10.4.0",
      platform: "win32",
    })

    const platform = checks.find((check) => check.name === "platform")
    expect(platform?.ok).toBe(true)
    expect(platform?.detail).toContain("win32")
  })
})
