#!/usr/bin/env node
import { basename, resolve } from "node:path"
import { scaffold } from "./scaffold.js"

const [, , dirArg] = process.argv

if (!dirArg) {
  console.error("Usage: create-cora-server <dir>")
  process.exitCode = 1
} else {
  const targetDir = resolve(process.cwd(), dirArg)
  const projectName = basename(targetDir)

  const result = await scaffold({ targetDir, projectName })

  if (!result.ok) {
    console.error(result.error)
    process.exitCode = 1
  } else {
    console.log(`Created ${result.value.files.length} files in ${targetDir}`)
    console.log("")
    console.log("Next steps:")
    console.log(`  cd ${dirArg}`)
    console.log("  pnpm install")
    console.log("  pnpm test")
  }
}
