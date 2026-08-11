import type { CharacterSummary } from "@cora-framework/characters"
import type { SlotView } from "@cora-framework/inventory/ui"
import type { CoraNotification } from "@cora-framework/ui"

// Placeholder mock data layer for the harness. This will eventually be
// replaced by a typed RPC mock layer that mirrors the real CORA transport,
// once that contract exists. For now it only provides static demo data
// and a small artificial-delay helper.

export function createMockCharacters(): CharacterSummary[] {
  return [
    {
      id: 1,
      name: "Alice Vance",
      appearance: null,
      createdAt: "2026-01-01T12:00:00.000Z",
      lastPlayedAt: "2026-01-05T18:30:00.000Z",
    },
    {
      id: 2,
      name: "Bjorn Ostergaard",
      appearance: null,
      createdAt: "2026-01-02T09:15:00.000Z",
      lastPlayedAt: null,
    },
    {
      id: 3,
      name: "Mara Voss",
      appearance: null,
      createdAt: "2026-01-03T20:45:00.000Z",
      lastPlayedAt: "2026-01-04T08:00:00.000Z",
    },
  ]
}

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

/**
 * Mock item catalog for the harness's Inventory section, shaped like
 * `@cora-framework/inventory`'s `ItemDefinition` but kept local rather than
 * importing `defineItemCatalog` - the harness only needs `label` and
 * `category`, both used by the mock move/equip logic below.
 */
export interface MockInventoryItem {
  id: string
  label: string
  category: "weapon" | "consumable" | "gear" | "misc"
}

export const MOCK_INVENTORY_CATALOG: MockInventoryItem[] = [
  { id: "medium-pistol", label: "Medium Pistol", category: "weapon" },
  { id: "combat-knife", label: "Combat Knife", category: "weapon" },
  { id: "stim-pack", label: "Stim Pack", category: "consumable" },
  { id: "armor-jacket", label: "Armor Jacket", category: "gear" },
  { id: "scrap-metal", label: "Scrap Metal", category: "misc" },
]

const MOCK_CATALOG_LABELS: Record<string, string> = Object.fromEntries(
  MOCK_INVENTORY_CATALOG.map((item) => [item.id, item.label]),
)

export function mockInventoryLabelFor(itemId: string): string {
  return MOCK_CATALOG_LABELS[itemId] ?? itemId
}

export function mockCatalogCategoryFor(itemId: string): string | undefined {
  return MOCK_INVENTORY_CATALOG.find((item) => item.id === itemId)?.category
}

const MOCK_INVENTORY_SLOT_COUNT = 16

export function createMockInventorySlots(): SlotView[] {
  const slots: SlotView[] = Array.from(
    { length: MOCK_INVENTORY_SLOT_COUNT },
    (_, index) => ({ slot: index }),
  )
  slots[0] = {
    slot: 0,
    itemId: "medium-pistol",
    label: mockInventoryLabelFor("medium-pistol"),
    quantity: 1,
    equipped: true,
  }
  slots[1] = {
    slot: 1,
    itemId: "combat-knife",
    label: mockInventoryLabelFor("combat-knife"),
    quantity: 1,
    equipped: false,
  }
  slots[2] = {
    slot: 2,
    itemId: "stim-pack",
    label: mockInventoryLabelFor("stim-pack"),
    quantity: 6,
    equipped: false,
  }
  slots[3] = {
    slot: 3,
    itemId: "armor-jacket",
    label: mockInventoryLabelFor("armor-jacket"),
    quantity: 1,
    equipped: false,
  }
  slots[4] = {
    slot: 4,
    itemId: "scrap-metal",
    label: mockInventoryLabelFor("scrap-metal"),
    quantity: 12,
    equipped: false,
  }
  return slots
}

export function mockRpc<T>(data: T, delayMs = 300): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(data)
    }, delayMs)
  })
}
