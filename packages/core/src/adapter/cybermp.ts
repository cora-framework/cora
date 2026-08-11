import { bindNativeEvents } from "./cybermp/events.js"
import { getNativeMp } from "./cybermp/mp.js"
import { createCyberMpRpc } from "./cybermp/rpc.js"
import type { CoraPlatform } from "./types.js"

/**
 * The real `CoraPlatform` implementation for the CyberMP runtime.
 *
 * This is the only file in `@cora-framework/core` (together with its
 * `./cybermp/*` submodules) that may import `@cybermp/*` - enforced by
 * `src/adapter/import-boundary.test.ts`. Everything else in this package,
 * and every module built on top of it, depends only on the `CoraPlatform`
 * interface.
 *
 * Because it depends on the CyberMP native `mp` global, this module is
 * compile-only until a real server process is available to run it against:
 * it typechecks against the real `@cybermp/rpc-server@0.2.0` and
 * `@cybermp/server-types@3.2.5` packages, but no lane-1 (headless) test
 * constructs it - there is no `mp` global to mock into `globalThis` that
 * would exercise anything beyond `getNativeMp()`'s own presence check,
 * since `RpcServer` itself is pinned to the same native runtime and cannot
 * be constructed without it either.
 *
 * Not exported from `@cora-framework/core`'s main entry point - import it
 * from the `@cora-framework/core/cybermp` subpath instead, so that
 * consuming `@cora-framework/core` for its kernel/types alone never pulls
 * `@cybermp/*` into the dependency graph.
 */
export function createCyberMpPlatform(): CoraPlatform {
  const mp = getNativeMp()
  const events = bindNativeEvents(mp)
  const rpc = createCyberMpRpc()

  return {
    events,
    registerRpcHandler: rpc.registerRpcHandler,
    callClient: rpc.callClient,
    log(level, message) {
      const prefixed = `[${level}] ${message}`
      if (level === "error") {
        console.error(prefixed)
      } else if (level === "warn") {
        console.warn(prefixed)
      } else {
        console.log(prefixed)
      }
    },
  }
}
