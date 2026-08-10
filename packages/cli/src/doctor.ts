export interface DoctorCheck {
  name: string
  ok: boolean
  detail: string
}

export interface DoctorEnv {
  nodeVersion: string
  pnpmVersion: string | null
  platform: string
}

const MIN_NODE_MAJOR = 22
const MIN_PNPM_MAJOR = 9

const parseMajor = (version: string): number | null => {
  const normalized = version.startsWith("v") ? version.slice(1) : version
  const match = /^(\d+)\./.exec(normalized)
  if (!match || match[1] === undefined) {
    return null
  }
  return Number.parseInt(match[1], 10)
}

const checkNode = (nodeVersion: string): DoctorCheck => {
  const major = parseMajor(nodeVersion)
  const normalized = nodeVersion.startsWith("v")
    ? nodeVersion.slice(1)
    : nodeVersion

  if (major === null) {
    return {
      name: "node",
      ok: false,
      detail: `could not parse node version "${nodeVersion}"`,
    }
  }

  if (major < MIN_NODE_MAJOR) {
    return {
      name: "node",
      ok: false,
      detail: `node ${normalized} is below the required minimum (>= ${MIN_NODE_MAJOR})`,
    }
  }

  return {
    name: "node",
    ok: true,
    detail: `node ${normalized} satisfies the minimum (>= ${MIN_NODE_MAJOR})`,
  }
}

const checkPnpm = (pnpmVersion: string | null): DoctorCheck => {
  if (pnpmVersion === null) {
    return {
      name: "pnpm",
      ok: false,
      detail: "pnpm not found on PATH",
    }
  }

  const major = parseMajor(pnpmVersion)

  if (major === null) {
    return {
      name: "pnpm",
      ok: false,
      detail: `could not parse pnpm version "${pnpmVersion}"`,
    }
  }

  if (major < MIN_PNPM_MAJOR) {
    return {
      name: "pnpm",
      ok: false,
      detail: `pnpm ${pnpmVersion} is below the required minimum (>= ${MIN_PNPM_MAJOR})`,
    }
  }

  return {
    name: "pnpm",
    ok: true,
    detail: `pnpm ${pnpmVersion} satisfies the minimum (>= ${MIN_PNPM_MAJOR})`,
  }
}

const checkPlatform = (platform: string): DoctorCheck => ({
  name: "platform",
  ok: true,
  detail: `running on ${platform}`,
})

export function runDoctor(env: DoctorEnv): DoctorCheck[] {
  return [
    checkNode(env.nodeVersion),
    checkPnpm(env.pnpmVersion),
    checkPlatform(env.platform),
  ]
}
