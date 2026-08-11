import { err, ok, type Result } from "@cora-framework/lib"
import { z } from "zod"

/**
 * Identity helper for declaring a module's config schema. Exists purely for
 * symmetry with `defineModule` / `defineMigrations` and to give module
 * authors a single, discoverable entry point for schema declaration; it
 * performs no validation of its own.
 */
export function defineConfig<T extends z.ZodType>(schema: T): T {
  return schema
}

/**
 * Parses `source` against `schema`, returning a typed value on success or a
 * single readable, human-facing error string on failure. Failure messages
 * are built from zod 4's `z.flattenError`, which splits issues into
 * `formErrors` (whole-object issues) and `fieldErrors` (per-field issues);
 * both are flattened into `"field: message"` lines here so a module can log
 * or surface the result directly without knowing about zod's error shape.
 */
export function loadConfig<T extends z.ZodType>(
  schema: T,
  source: Record<string, unknown>,
): Result<z.infer<T>, string> {
  const result = schema.safeParse(source)
  if (result.success) {
    return ok(result.data as z.infer<T>)
  }

  const flattened = z.flattenError(result.error)
  const lines: string[] = [...flattened.formErrors]
  const fieldErrors = flattened.fieldErrors as Record<
    string,
    string[] | undefined
  >
  for (const [field, messages] of Object.entries(fieldErrors)) {
    for (const message of messages ?? []) {
      lines.push(`${field}: ${message}`)
    }
  }

  return err(lines.join("; "))
}
