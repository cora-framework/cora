import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// src/adapter/import-boundary.test.ts -> src/
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

const ALLOWED_FILE = join(SRC_ROOT, "adapter", "cybermp.ts")
const ALLOWED_DIR_PREFIX = join(SRC_ROOT, "adapter", "cybermp") + sep
// This test file's own source necessarily contains the string "@cybermp/"
// (in the import-statement regex below and in this comment) without ever
// actually importing from an `@cybermp/*` package - exclude it from the
// scan rather than let it flag itself.
const SELF = join(SRC_ROOT, "adapter", "import-boundary.test.ts")

// Matches real import/require statements, not prose mentioning "@cybermp/"
// in a docstring (several allowed files, and this one, do that legitimately).
const CYBERMP_IMPORT_PATTERN = /(?:from|require\()\s*["']@cybermp\//

function listTsFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full))
    } else if (entry.endsWith(".ts")) {
      files.push(full)
    }
  }
  return files
}

describe("adapter import boundary", () => {
  it("only src/adapter/cybermp.ts and src/adapter/cybermp/* import @cybermp/*", () => {
    const offenders: string[] = []

    for (const file of listTsFiles(SRC_ROOT)) {
      const isAllowed =
        file === ALLOWED_FILE ||
        file === SELF ||
        file.startsWith(ALLOWED_DIR_PREFIX)
      if (isAllowed) continue

      const content = readFileSync(file, "utf8")
      if (CYBERMP_IMPORT_PATTERN.test(content)) {
        offenders.push(relative(SRC_ROOT, file))
      }
    }

    expect(offenders).toEqual([])
  })

  it("index.ts does not export createCyberMpPlatform (kept on the ./cybermp subpath)", () => {
    const indexContent = readFileSync(join(SRC_ROOT, "index.ts"), "utf8")
    expect(indexContent).not.toMatch(/createCyberMpPlatform/)
  })

  it("package.json exposes the cybermp adapter only via a ./cybermp subpath export", () => {
    const packageJson = JSON.parse(
      readFileSync(join(SRC_ROOT, "..", "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> }

    expect(packageJson.exports).toHaveProperty("./cybermp")
  })
})
