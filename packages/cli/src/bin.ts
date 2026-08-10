#!/usr/bin/env node
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Command } from "commander"
import { runDoctor } from "./doctor.js"

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

program.parse()
