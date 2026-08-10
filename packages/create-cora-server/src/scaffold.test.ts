import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { scaffold } from "./scaffold"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "create-cora-server-"))
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe("scaffold", () => {
  it("scaffolds a fresh target directory", async () => {
    const targetDir = join(tempRoot, "my-server")

    const result = await scaffold({ targetDir, projectName: "my-server" })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.files).toEqual([...result.value.files].sort())
    expect(result.value.files).toContain("package.json")
    expect(result.value.files).toContain("README.md")
    expect(result.value.files).toContain("tsconfig.json")
    expect(result.value.files).toContain("biome.json")
    expect(result.value.files).toContain(".gitignore")
    expect(result.value.files).not.toContain("gitignore")
    expect(result.value.files).toContain("cora.migrate.mjs")
    expect(result.value.files).toContain("src/server/index.ts")
    expect(result.value.files).toContain("src/server/index.test.ts")

    const packageJson = await readFile(join(targetDir, "package.json"), "utf8")
    expect(packageJson).toContain('"name": "my-server"')
    expect(packageJson).not.toContain("__PROJECT_NAME__")

    const readme = await readFile(join(targetDir, "README.md"), "utf8")
    expect(readme).toContain("# my-server")
    expect(readme).not.toContain("__PROJECT_NAME__")

    const gitignore = await readFile(join(targetDir, ".gitignore"), "utf8")
    expect(gitignore).toContain("node_modules")
  })

  it("errs when the target directory exists and is not empty", async () => {
    const targetDir = join(tempRoot, "occupied")
    await mkdir(targetDir)
    await writeFile(join(targetDir, "keep.txt"), "existing", "utf8")

    const result = await scaffold({ targetDir, projectName: "occupied" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("occupied")
  })

  it("succeeds when the target directory exists but is empty", async () => {
    const targetDir = join(tempRoot, "empty-target")
    await mkdir(targetDir)

    const result = await scaffold({ targetDir, projectName: "empty-target" })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.files.length).toBeGreaterThan(0)
  })
})
