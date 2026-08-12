import { createCharactersModule } from "@cora-framework/characters"
import type { CoraModule } from "@cora-framework/core"
import { createInventoryModule } from "@cora-framework/inventory"
import { createMoneyModule } from "@cora-framework/money"
import type { CoraServerConfig } from "../../cora.config.js"

/**
 * Builds the module list this server boots the kernel with. Pure: takes only
 * a `CoraServerConfig`, touches no platform and no database, so it can be
 * called both by the real entry point (`src/server/index.ts`, against the
 * live CyberMP platform) and headlessly in tests (against
 * `createTestPlatform`/`createTestDatabase`) - see `build-modules.test.ts`.
 *
 * `characters` is listed first because it is the module that publishes the
 * core-standard active-character service (RFC 0002,
 * `activeCharacterProviderToken` from `@cora-framework/core`). `inventory`
 * and `money` both resolve that service automatically from the kernel's
 * shared service registry at handler call time - no manual
 * `isActiveCharacter` wiring is required here, and registration order does
 * not actually matter for that resolution (it is looked up lazily per call,
 * not at register time). Without `characters` booted alongside them,
 * inventory and money still work, but fall back to an allow-all check and
 * log a one-time warning - fine for a quick local test, not for production.
 */
export function buildModules(config: CoraServerConfig): CoraModule[] {
  return [
    createCharactersModule(),
    createInventoryModule({
      catalog: config.catalog,
      slots: config.slots,
      maxWeight: config.maxWeight,
    }),
    createMoneyModule({
      startingCash: config.startingCash,
      startingBank: config.startingBank,
    }),
  ]
}
