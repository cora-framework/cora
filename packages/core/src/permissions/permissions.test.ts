import { createTestDatabase, runMigrations } from "@cora-framework/db"
import { describe, expect, it } from "vitest"
import { corePermissionsMigrations, createPermissions } from "./permissions.js"

async function setup() {
  const db = createTestDatabase()
  const migrationResult = await runMigrations(db, corePermissionsMigrations)
  if (!migrationResult.ok) {
    throw new Error(migrationResult.error)
  }
  return createPermissions(db)
}

describe("createPermissions", () => {
  it("defineRole creates a role that can then be granted", async () => {
    const permissions = await setup()

    const defineResult = await permissions.defineRole("moderator", [
      "cora.chat.mute",
    ])
    expect(defineResult).toEqual({ ok: true, value: undefined })

    const grantResult = await permissions.grantRole(1, "moderator")
    expect(grantResult).toEqual({ ok: true, value: undefined })

    expect(await permissions.hasPermission(1, "cora.chat.mute")).toBe(true)
  })

  it("defineRole upserts: redefining a role replaces its permission list", async () => {
    const permissions = await setup()

    await permissions.defineRole("moderator", ["cora.chat.mute"])
    await permissions.grantRole(1, "moderator")
    expect(await permissions.hasPermission(1, "cora.chat.mute")).toBe(true)

    await permissions.defineRole("moderator", ["cora.chat.kick"])

    expect(await permissions.hasPermission(1, "cora.chat.mute")).toBe(false)
    expect(await permissions.hasPermission(1, "cora.chat.kick")).toBe(true)
  })

  it("hasPermission is false for a permission no granted role carries", async () => {
    const permissions = await setup()
    await permissions.defineRole("moderator", ["cora.chat.mute"])
    await permissions.grantRole(1, "moderator")

    expect(await permissions.hasPermission(1, "cora.admin.kick")).toBe(false)
  })

  it("hasPermission is false for a player with no granted roles", async () => {
    const permissions = await setup()
    await permissions.defineRole("moderator", ["cora.chat.mute"])

    expect(await permissions.hasPermission(999, "cora.chat.mute")).toBe(false)
  })

  it("wildcard role permission matches a sub-permission", async () => {
    const permissions = await setup()
    await permissions.defineRole("admin", ["cora.admin.*"])
    await permissions.grantRole(1, "admin")

    expect(await permissions.hasPermission(1, "cora.admin.kick")).toBe(true)
    expect(await permissions.hasPermission(1, "cora.admin.ban")).toBe(true)
  })

  it("wildcard role permission does not match an unrelated namespace", async () => {
    const permissions = await setup()
    await permissions.defineRole("admin", ["cora.admin.*"])
    await permissions.grantRole(1, "admin")

    expect(await permissions.hasPermission(1, "cora.chat.mute")).toBe(false)
  })

  it("wildcard does not match the bare prefix without a trailing segment", async () => {
    const permissions = await setup()
    await permissions.defineRole("admin", ["cora.admin.*"])
    await permissions.grantRole(1, "admin")

    expect(await permissions.hasPermission(1, "cora.admin")).toBe(false)
  })

  it("grantRole for an unknown role returns an error naming the known roles", async () => {
    const permissions = await setup()
    await permissions.defineRole("moderator", ["cora.chat.mute"])
    await permissions.defineRole("admin", ["cora.admin.*"])

    const result = await permissions.grantRole(1, "superadmin")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected grantRole to fail")
    expect(result.error).toContain("superadmin")
    expect(result.error).toContain("moderator")
    expect(result.error).toContain("admin")
  })

  it("grantRole for an unknown role when no roles are defined names none", async () => {
    const permissions = await setup()

    const result = await permissions.grantRole(1, "anything")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected grantRole to fail")
    expect(result.error).toContain("(none defined)")
  })

  it("granting the same role twice does not error and is idempotent", async () => {
    const permissions = await setup()
    await permissions.defineRole("moderator", ["cora.chat.mute"])

    expect(await permissions.grantRole(1, "moderator")).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await permissions.grantRole(1, "moderator")).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await permissions.hasPermission(1, "cora.chat.mute")).toBe(true)
  })

  it("revokeRole removes a granted role", async () => {
    const permissions = await setup()
    await permissions.defineRole("moderator", ["cora.chat.mute"])
    await permissions.grantRole(1, "moderator")

    const revokeResult = await permissions.revokeRole(1, "moderator")

    expect(revokeResult).toEqual({ ok: true, value: undefined })
    expect(await permissions.hasPermission(1, "cora.chat.mute")).toBe(false)
  })

  it("revokeRole is a no-op ok when the player never had the role", async () => {
    const permissions = await setup()
    await permissions.defineRole("moderator", ["cora.chat.mute"])

    const revokeResult = await permissions.revokeRole(1, "moderator")

    expect(revokeResult).toEqual({ ok: true, value: undefined })
  })

  it("a player with multiple roles has the union of their permissions", async () => {
    const permissions = await setup()
    await permissions.defineRole("moderator", ["cora.chat.mute"])
    await permissions.defineRole("admin", ["cora.admin.*"])
    await permissions.grantRole(1, "moderator")
    await permissions.grantRole(1, "admin")

    expect(await permissions.hasPermission(1, "cora.chat.mute")).toBe(true)
    expect(await permissions.hasPermission(1, "cora.admin.kick")).toBe(true)
  })
})
