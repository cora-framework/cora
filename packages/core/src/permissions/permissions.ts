import type { CoraDb } from "@cora-framework/db"
import { defineMigrations } from "@cora-framework/db"
import { err, ok, type Result } from "@cora-framework/lib"

interface PermissionsSchema {
  cora_roles: { role: string; permissions: string }
  cora_player_roles: { player_id: number; role: string }
}

/**
 * The core permissions module's own migrations: `cora_roles` (role name to
 * a JSON-encoded permission-string array) and `cora_player_roles` (a
 * player-to-role grant, composite-keyed on `(player_id, role)` so the same
 * grant can't be duplicated). Registered under module id `"core"`.
 *
 * The kernel always runs these first, ahead of any application module's
 * migrations, since `ctx.permissions` must be usable from every module's
 * `register()`.
 */
export const corePermissionsMigrations = defineMigrations("core", [
  {
    sequence: 1,
    name: "create-roles-and-player-roles",
    async up(trx) {
      await trx.schema
        .createTable("cora_roles")
        .addColumn("role", "text", (col) => col.primaryKey())
        .addColumn("permissions", "text", (col) => col.notNull())
        .execute()

      await trx.schema
        .createTable("cora_player_roles")
        .addColumn("player_id", "integer", (col) => col.notNull())
        .addColumn("role", "text", (col) => col.notNull())
        .addPrimaryKeyConstraint("cora_player_roles_pk", ["player_id", "role"])
        .execute()
    },
  },
])

/**
 * Role-based permission checks backed by `CoraDb`. Roles are defined with a
 * flat list of permission strings; players are granted zero or more roles;
 * `hasPermission` is true if any of a player's granted roles carries a
 * permission that matches the query, per `matchesPermission` below.
 */
export interface Permissions {
  grantRole(playerId: number, role: string): Promise<Result<void, string>>
  revokeRole(playerId: number, role: string): Promise<Result<void, string>>
  hasPermission(playerId: number, permission: string): Promise<boolean>
  defineRole(role: string, permissions: string[]): Promise<Result<void, string>>
}

/**
 * A stored permission matches a query permission if it is identical, or if
 * it ends in `.*` and the query starts with everything before the `*`
 * (e.g. stored `"cora.admin.*"` matches query `"cora.admin.kick"`, but not
 * bare `"cora.admin"` - the wildcard only covers a strict sub-permission).
 */
function matchesPermission(stored: string, query: string): boolean {
  if (stored === query) return true
  if (!stored.endsWith(".*")) return false

  const prefix = stored.slice(0, -1) // e.g. "cora.admin."
  return query.startsWith(prefix) && query.length > prefix.length
}

/**
 * Builds the `Permissions` facade over `db`. Assumes `corePermissionsMigrations`
 * has already been applied (the kernel guarantees this by always running
 * core migrations before modules register).
 */
export function createPermissions(db: CoraDb): Permissions {
  const typedDb = db as unknown as CoraDb<PermissionsSchema>

  return {
    async defineRole(role, permissions) {
      const permissionsJson = JSON.stringify(permissions)

      const existing = await typedDb
        .selectFrom("cora_roles")
        .select("role")
        .where("role", "=", role)
        .executeTakeFirst()

      if (existing) {
        await typedDb
          .updateTable("cora_roles")
          .set({ permissions: permissionsJson })
          .where("role", "=", role)
          .execute()
      } else {
        await typedDb
          .insertInto("cora_roles")
          .values({ role, permissions: permissionsJson })
          .execute()
      }

      return ok(undefined)
    },

    async grantRole(playerId, role) {
      const knownRoles = await typedDb
        .selectFrom("cora_roles")
        .select("role")
        .execute()

      if (!knownRoles.some((row) => row.role === role)) {
        const knownRoleNames = knownRoles.map((row) => row.role)
        return err(
          `Unknown role "${role}". Known roles: ${
            knownRoleNames.length > 0
              ? knownRoleNames.join(", ")
              : "(none defined)"
          }`,
        )
      }

      const alreadyGranted = await typedDb
        .selectFrom("cora_player_roles")
        .select("role")
        .where("player_id", "=", playerId)
        .where("role", "=", role)
        .executeTakeFirst()

      if (!alreadyGranted) {
        await typedDb
          .insertInto("cora_player_roles")
          .values({ player_id: playerId, role })
          .execute()
      }

      return ok(undefined)
    },

    async revokeRole(playerId, role) {
      // A player who never had this role is a no-op success, not an error -
      // revoking is idempotent.
      await typedDb
        .deleteFrom("cora_player_roles")
        .where("player_id", "=", playerId)
        .where("role", "=", role)
        .execute()

      return ok(undefined)
    },

    async hasPermission(playerId, permission) {
      const grantedRoles = await typedDb
        .selectFrom("cora_player_roles")
        .select("role")
        .where("player_id", "=", playerId)
        .execute()

      if (grantedRoles.length === 0) return false

      const roleNames = grantedRoles.map((row) => row.role)
      const roleRows = await typedDb
        .selectFrom("cora_roles")
        .select(["role", "permissions"])
        .where("role", "in", roleNames)
        .execute()

      for (const roleRow of roleRows) {
        const storedPermissions: string[] = JSON.parse(roleRow.permissions)
        if (
          storedPermissions.some((stored) =>
            matchesPermission(stored, permission),
          )
        ) {
          return true
        }
      }

      return false
    },
  }
}
