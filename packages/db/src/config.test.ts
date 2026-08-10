import { describe, expect, it } from "vitest"
import { resolveConfig } from "./config"

describe("resolveConfig", () => {
  it("accepts explicit full config", () => {
    const r = resolveConfig({
      host: "localhost",
      user: "root",
      password: "x",
      database: "cora",
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.port).toBe(3306)
      expect(r.value.connectionLimit).toBe(10)
    }
  })

  it("falls back to env variables", () => {
    const env = {
      CORA_DB_HOST: "db.example.com",
      CORA_DB_USER: "cora",
      CORA_DB_PASSWORD: "secret",
      CORA_DB_DATABASE: "cora",
      CORA_DB_PORT: "3307",
    }
    const r = resolveConfig({ env })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.host).toBe("db.example.com")
      expect(r.value.port).toBe(3307)
    }
  })

  it("explicit values win over env", () => {
    const r = resolveConfig({
      host: "explicit",
      user: "u",
      password: "p",
      database: "d",
      env: { CORA_DB_HOST: "env" },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.host).toBe("explicit")
  })

  it("errors with the list of missing fields", () => {
    const r = resolveConfig({ host: "h" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("user")
      expect(r.error).toContain("password")
      expect(r.error).toContain("database")
      expect(r.error).not.toContain("host")
    }
  })

  it("rejects a non-numeric env port", () => {
    const r = resolveConfig({
      host: "h",
      user: "u",
      password: "p",
      database: "d",
      env: { CORA_DB_PORT: "abc" },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("port")
  })

  it("rejects env port with non-numeric suffix", () => {
    const r = resolveConfig({
      host: "h",
      user: "u",
      password: "p",
      database: "d",
      env: { CORA_DB_PORT: "3307xyz" },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("port")
  })

  it("rejects a non-integer explicit port", () => {
    const r = resolveConfig({
      host: "h",
      user: "u",
      password: "p",
      database: "d",
      port: 3.5,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("port")
  })

  it("rejects a negative explicit connectionLimit", () => {
    const r = resolveConfig({
      host: "h",
      user: "u",
      password: "p",
      database: "d",
      connectionLimit: -1,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("connectionLimit")
  })
})
