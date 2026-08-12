import { fileURLToPath } from "node:url"
import { createKernel, type Kernel } from "@cora-framework/core"
import { createCyberMpPlatform } from "@cora-framework/core/cybermp"
import { createDatabase } from "@cora-framework/db"
import config from "../../cora.config.js"
import { buildModules } from "./build-modules.js"

/**
 * Boots the real server: the live CyberMP platform adapter, a MySQL-backed
 * database handle from `cora.config.ts`, and a kernel running the
 * characters + inventory + money modules built by `buildModules`.
 *
 * COMPILE-ONLY outside a running CyberMP process: `createCyberMpPlatform()`
 * requires the native `mp` global that only exists inside a live CyberMP
 * server, so this function typechecks and builds here but cannot actually
 * run in this repository or in CI - it is meant to be started by CyberMP
 * itself once deployed. The wiring this function performs (module list,
 * kernel boot, migrations) is proven headlessly instead, against
 * `createTestPlatform`/`createTestDatabase`, by `build-modules.test.ts`.
 */
export async function startServer(): Promise<Kernel> {
  const platform = await createCyberMpPlatform()
  const db = createDatabase(config.db)

  const kernel = await createKernel({
    platform,
    db,
    modules: buildModules(config),
  })

  if (kernel.disabledModules.length > 0) {
    platform.log(
      "error",
      `server started with disabled modules: ${kernel.disabledModules.join(", ")}`,
    )
  } else {
    platform.log("info", "server started")
  }

  return kernel
}

// Guarded entry point: only calls `startServer` when this file is the
// process's main module (not when it is merely imported, e.g. by a test),
// so importing this module elsewhere never has the side effect of trying to
// boot a live platform.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url)
if (isMainModule) {
  startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to start server: ${message}`)
    process.exitCode = 1
  })
}
