import { defineMigrations } from "@cora-framework/db"

const migrations = defineMigrations("app", [
  {
    sequence: 1,
    name: "create-players",
    async up(db) {
      await db.schema
        .createTable("players")
        .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
        .addColumn("identifier", "text", (col) => col.notNull().unique())
        .addColumn("name", "text", (col) => col.notNull())
        .addColumn("created_at", "text", (col) => col.notNull())
        .execute()
    },
  },
])

export default {
  db: {
    host: process.env.CORA_DB_HOST ?? "127.0.0.1",
    port: Number(process.env.CORA_DB_PORT ?? 3306),
    user: process.env.CORA_DB_USER ?? "root",
    password: process.env.CORA_DB_PASSWORD ?? "",
    database: process.env.CORA_DB_DATABASE ?? "cora_app",
  },
  migrations,
}
