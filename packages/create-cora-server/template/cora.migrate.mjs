import { charactersMigrations } from "@cora-framework/characters"
import { corePermissionsMigrations } from "@cora-framework/core"
import { inventoryMigrations } from "@cora-framework/inventory"
import { moneyMigrations } from "@cora-framework/money"

// Plain JavaScript (not TypeScript) because the `cora migrate` CLI loads
// this file directly via a dynamic `import()`, with no build step in
// between - see `@cora-framework/cli`'s `migrate` command. Its `db` shape
// must be kept in sync by hand with `cora.config.ts`'s `db` export; it is
// not imported from there for the same reason.
//
// The migration list mirrors what `createKernel` runs on every boot
// (core permissions first, then each module's own migrations, in the order
// `buildModules` lists them in `src/server/build-modules.ts`) so
// `pnpm migrate` and a live server boot always apply the same schema.
export default {
  db: {
    host: process.env.CORA_DB_HOST ?? "127.0.0.1",
    port: Number(process.env.CORA_DB_PORT ?? 3306),
    user: process.env.CORA_DB_USER ?? "root",
    password: process.env.CORA_DB_PASSWORD ?? "",
    database: process.env.CORA_DB_DATABASE ?? "cora_app",
  },
  migrations: [
    ...corePermissionsMigrations,
    ...charactersMigrations,
    ...inventoryMigrations,
    ...moneyMigrations,
  ],
}
