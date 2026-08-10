import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { err, ok, type Result } from "@cora/lib"

const currentDir = dirname(fileURLToPath(import.meta.url))

/**
 * The committed template directory lives one level up from this module
 * (`src/` during tests, `dist/` once built), so it is resolved relative to
 * this file rather than baked in as an absolute path.
 */
const templateDir = join(currentDir, "..", "template")

const PLACEHOLDER = "__PROJECT_NAME__"
const PERSONALIZED_FILES = ["package.json", "README.md"]

/**
 * Files committed in the template under a dotless name and renamed back to
 * their dotfile form after copying into the target directory. npm never
 * ships dotfiles in a published tarball regardless of the package's
 * `files` array, so `.gitignore` is committed as `gitignore` and restored
 * here instead of being lost on publish.
 */
const RENAMED_ON_COPY: ReadonlyArray<readonly [string, string]> = [
  ["gitignore", ".gitignore"],
]

export interface ScaffoldOptions {
  targetDir: string
  projectName: string
}

export interface ScaffoldResult {
  files: string[]
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch {
    return false
  }
}

async function listFilesRecursive(
  dir: string,
  base: string,
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, base)))
    } else if (entry.isFile()) {
      files.push(relative(base, fullPath).split(sep).join("/"))
    }
  }

  return files
}

/**
 * Scaffold a new CORA server project into `targetDir` by copying the
 * committed template directory and personalizing it with `projectName`.
 *
 * Refuses to write into a target directory that already exists and
 * contains files; a missing or empty directory is fine.
 */
export async function scaffold(
  options: ScaffoldOptions,
): Promise<Result<ScaffoldResult, string>> {
  const { targetDir, projectName } = options

  if (await directoryExists(targetDir)) {
    const existing = await readdir(targetDir)
    if (existing.length > 0) {
      return err(
        `Target directory "${targetDir}" already exists and is not empty`,
      )
    }
  } else {
    await mkdir(targetDir, { recursive: true })
  }

  await cp(templateDir, targetDir, { recursive: true })

  for (const [from, to] of RENAMED_ON_COPY) {
    await rename(join(targetDir, from), join(targetDir, to))
  }

  for (const relativeFile of PERSONALIZED_FILES) {
    const filePath = join(targetDir, relativeFile)
    const content = await readFile(filePath, "utf8")
    const personalized = content.split(PLACEHOLDER).join(projectName)
    await writeFile(filePath, personalized, "utf8")
  }

  const files = (await listFilesRecursive(targetDir, targetDir)).sort()

  return ok({ files })
}
