import type { MpServer } from "@cybermp/server-types"

/**
 * Resolves the CyberMP native `mp` global.
 *
 * `@cybermp/server-types` documents two consumer patterns for `mp` (see its
 * README): a "Global Approach" (the consumer's own `global.d.ts` declares
 * `const mp: MpServer` and code reads the ambient global directly) and a
 * "Local Approach" (the consumer re-exports `globalThis.mp` as a typed
 * local). Its own `src/mp.ts` is `declare const mp: MpServer; export { mp }`
 * - an ambient type declaration with no runtime value - so importing `mp`
 * as a value from the package itself would resolve to nothing at runtime.
 * This follows the documented "Local Approach" instead: we import only the
 * `MpServer` type and read the real object CyberMP injects into
 * `globalThis` at resource start.
 */
export function getNativeMp(): MpServer {
  const globalMp = (globalThis as { mp?: MpServer }).mp
  if (!globalMp) {
    throw new Error(
      "CyberMP native `mp` global is not present. createCyberMpPlatform() " +
        "must run inside a live CyberMP server resource process, after the " +
        "runtime has injected `mp` into globalThis.",
    )
  }
  return globalMp
}
