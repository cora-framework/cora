import { describe, expect, it } from "vitest"
import { z } from "zod"
import { defineConfig, loadConfig } from "./config.js"

describe("defineConfig", () => {
  it("returns the schema unchanged", () => {
    const schema = defineConfig(z.object({ port: z.number() }))
    expect(schema.safeParse({ port: 1 }).success).toBe(true)
  })
})

describe("loadConfig", () => {
  it("parses a valid source into a typed value", () => {
    const schema = defineConfig(
      z.object({
        port: z.number(),
        host: z.string().min(1),
      }),
    )

    const result = loadConfig(schema, { port: 30120, host: "0.0.0.0" })

    expect(result).toEqual({
      ok: true,
      value: { port: 30120, host: "0.0.0.0" },
    })
  })

  it("returns a single readable error listing every failing field", () => {
    const schema = defineConfig(
      z.object({
        port: z.number(),
        host: z.string().min(1),
      }),
    )

    const result = loadConfig(schema, { port: "not-a-number", host: "" })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected loadConfig to fail")

    expect(result.error).toContain("port:")
    expect(result.error).toContain("host:")
    expect(result.error).toContain("expected number")
    expect(result.error).toContain("Too small")
  })

  it("reports a missing required field by name", () => {
    const schema = defineConfig(z.object({ port: z.number() }))

    const result = loadConfig(schema, {})

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected loadConfig to fail")
    expect(result.error).toContain("port:")
  })
})
