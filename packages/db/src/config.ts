import { err, ok, type Result } from "@cora/lib"

export interface CoraDbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  connectionLimit: number
}

export function resolveConfig(
  input: Partial<CoraDbConfig> & { env?: Record<string, string | undefined> },
): Result<CoraDbConfig, string> {
  const env = input.env ?? {}

  const host = input.host ?? env.CORA_DB_HOST
  const user = input.user ?? env.CORA_DB_USER
  const password = input.password ?? env.CORA_DB_PASSWORD
  const database = input.database ?? env.CORA_DB_DATABASE

  const port =
    input.port ??
    (env.CORA_DB_PORT ? parseInt(env.CORA_DB_PORT, 10) : undefined)
  const connectionLimit = input.connectionLimit ?? 10

  const missingFields: string[] = []
  if (!host) missingFields.push("host")
  if (!user) missingFields.push("user")
  if (!password) missingFields.push("password")
  if (!database) missingFields.push("database")

  if (env.CORA_DB_PORT && Number.isNaN(port)) {
    return err("Invalid port: port must be numeric")
  }

  if (missingFields.length > 0) {
    return err(`Missing required fields: ${missingFields.join(", ")}`)
  }

  return ok({
    host: host as string,
    port: port ?? 3306,
    user: user as string,
    password: password as string,
    database: database as string,
    connectionLimit,
  })
}
