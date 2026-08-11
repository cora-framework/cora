import { TypedEmitter } from "@cora-framework/lib"
import type { CoraPlatform, PlatformEvents } from "./types.js"

interface ClientCall {
  playerId: number
  name: string
  payload: unknown
}

interface LogEntry {
  level: "info" | "warn" | "error"
  message: string
}

export interface TestPlatform {
  platform: CoraPlatform
  emit<K extends keyof PlatformEvents>(
    event: K,
    ...args: PlatformEvents[K]
  ): void
  invokeRpc(name: string, input: unknown, playerId: number): Promise<unknown>
  clientCalls: ClientCall[]
  logs: LogEntry[]
}

/**
 * A fully in-memory implementation of `CoraPlatform` for lane-1 (headless,
 * no game process) tests. Every side effect is captured in an array on the
 * returned object so tests can assert on it directly.
 */
export function createTestPlatform(): TestPlatform {
  const events = new TypedEmitter<PlatformEvents>()
  const handlers = new Map<
    string,
    (input: unknown, playerId: number) => Promise<unknown>
  >()
  const clientCalls: ClientCall[] = []
  const logs: LogEntry[] = []

  const platform: CoraPlatform = {
    events,
    registerRpcHandler(name, handler) {
      if (handlers.has(name)) {
        throw new Error(`rpc handler "${name}" is already registered`)
      }
      handlers.set(name, handler)
    },
    async callClient(playerId, name, payload) {
      clientCalls.push({ playerId, name, payload })
      return undefined
    },
    log(level, message) {
      logs.push({ level, message })
    },
  }

  return {
    platform,
    emit(event, ...args) {
      events.emit(event, ...args)
    },
    async invokeRpc(name, input, playerId) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`no rpc handler registered for "${name}"`)
      }
      return handler(input, playerId)
    },
    clientCalls,
    logs,
  }
}
