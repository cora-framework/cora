#!/usr/bin/env node
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { CoraDb } from "@cora/db"
import { createDatabase } from "@cora/db"
import { Command } from "commander"
import { runDoctor } from "./doctor.js"
import { runMigrateWithDb, validateMigrateConfig } from "./migrate.js"

const currentDir = dirname(fileURLToPath(import.meta.url))
const packageJsonPath = join(currentDir, "..", "package.json")
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  version: string
}

const getPnpmVersion = (): string | null => {
  try {
    return execSync("pnpm --version", { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

const program = new Command()

program
  .name("cora")
  .description("CORA framework command-line tools")
  .version(packageJson.version)

program
  .command("doctor")
  .description(
    "Check that the current environment satisfies CORA's requirements",
  )
  .action(() => {
    const checks = runDoctor({
      nodeVersion: process.version,
      pnpmVersion: getPnpmVersion(),
      platform: process.platform,
    })

    const nameWidth = Math.max(...checks.map((check) => check.name.length))

    for (const check of checks) {
      const marker = check.ok ? "ok" : "fail"
      console.log(
        `[${marker}] ${check.name.padEnd(nameWidth)}  ${check.detail}`,
      )
    }

    if (checks.some((check) => !check.ok)) {
      process.exitCode = 1
    }
  })

program
  .command("migrate")
  .description("Run pending CORA database migrations")
  .option(
    "-c, --config <path>",
    "path to the migrate config module",
    "./cora.migrate.mjs",
  )
  .action(async (options: { config: string }) => {
    const configPath = isAbsolute(options.config)
      ? options.config
      : resolve(process.cwd(), options.config)

    let configModule: unknown
    try {
      configModule = await import(pathToFileURL(configPath).href)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(
        `Failed to load migrate config at "${configPath}": ${message}`,
      )
      process.exitCode = 1
      return
    }

    const exported =
      configModule !== null &&
      typeof configModule === "object" &&
      "default" in configModule
        ? (configModule as { default: unknown }).default
        : undefined

    const validated = validateMigrateConfig(exported)
    if (!validated.ok) {
      console.error(`Invalid migrate config: ${validated.error}`)
      process.exitCode = 1
      return
    }

    let db: CoraDb | undefined
    try {
      db = createDatabase(validated.value.db)
      const result = await runMigrateWithDb(db, validated.value.migrations)

      if (!result.ok) {
        console.error(result.error)
        process.exitCode = 1
        return
      }

      if (result.value.applied.length === 0) {
        console.log("No pending migrations")
      } else {
        for (const id of result.value.applied) {
          console.log(`Applied ${id}`)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Migration failed: ${message}`)
      process.exitCode = 1
    } finally {
      if (db) {
        await db.destroy()
      }
    }
  })

program.parse()
