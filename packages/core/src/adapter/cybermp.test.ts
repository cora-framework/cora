import { describe, expect, it } from "vitest"

/**
 * Regression coverage for the cybermp adapter's import-time behavior.
 *
 * `@cybermp/rpc-server` (via `@cybermp/rpc-core`) throws at *import* time,
 * not construction time, when the native `mp` global is absent from
 * `globalThis`. Before the lazy-load fix, `./cybermp.ts` imported
 * `RpcServer` from `@cybermp/rpc-server` at the top level of
 * `./cybermp/rpc.ts`, so merely importing `./cybermp.js` outside a live
 * CyberMP process threw an upstream "Unresolved environment" error - before
 * `getNativeMp()`'s own friendly error in `createCyberMpPlatform` ever ran.
 * That made the friendly error dead code.
 *
 * This test asserts both halves of the fix: importing the module resolves
 * (does not throw) even with no `mp` global present, and calling
 * `createCyberMpPlatform()` in that same environment rejects with CORA's
 * own friendly error - not anything thrown by the upstream package.
 */
describe("createCyberMpPlatform (import-time behavior)", () => {
  it("resolves the module import with no CyberMP `mp` global present", async () => {
    expect((globalThis as { mp?: unknown }).mp).toBeUndefined()

    await expect(import("./cybermp.js")).resolves.toBeDefined()
  })

  it("rejects with CORA's own friendly error when constructed outside a live CyberMP process", async () => {
    expect((globalThis as { mp?: unknown }).mp).toBeUndefined()

    const { createCyberMpPlatform } = await import("./cybermp.js")

    await expect(createCyberMpPlatform()).rejects.toThrow(
      /CyberMP native `mp` global is not present.*must run inside a live CyberMP server resource process/s,
    )
  })
})
