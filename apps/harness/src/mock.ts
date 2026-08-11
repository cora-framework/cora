import type { CoraNotification } from "@cora-framework/ui"

// Placeholder mock data layer for the harness. This will eventually be
// replaced by a typed RPC mock layer that mirrors the real CORA transport,
// once that contract exists. For now it only provides static demo data
// and a small artificial-delay helper.

export function createMockNotifications(): CoraNotification[] {
  return [
    {
      id: "mock-info-1",
      kind: "info",
      title: "Harness ready",
      message: "The CORA UI dev harness has finished loading.",
    },
    {
      id: "mock-success-1",
      kind: "success",
      title: "Build succeeded",
      message: "packages/ui compiled without errors.",
    },
    {
      id: "mock-warning-1",
      kind: "warning",
      title: "Preview data",
      message: "Notifications shown here are mock data, not live events.",
    },
  ]
}

export function mockRpc<T>(data: T, delayMs = 300): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(data)
    }, delayMs)
  })
}
