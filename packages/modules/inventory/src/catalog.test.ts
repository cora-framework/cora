import { describe, expect, it } from "vitest"
import { defineItemCatalog, type ItemDefinition } from "./catalog.js"

function item(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: "medium-pistol",
    label: "Medium Pistol",
    weight: 1.5,
    stackable: false,
    maxStack: 1,
    category: "weapon",
    ...overrides,
  }
}

describe("defineItemCatalog", () => {
  it("builds a catalog from valid item definitions", () => {
    const catalog = defineItemCatalog([
      item(),
      item({
        id: "stim-pack",
        label: "Stim Pack",
        weight: 0.2,
        stackable: true,
        maxStack: 10,
        category: "consumable",
      }),
    ])

    expect(catalog.items).toHaveLength(2)
    expect(catalog.byId.get("medium-pistol")?.label).toBe("Medium Pistol")
    expect(catalog.byId.get("stim-pack")?.maxStack).toBe(10)
    expect(catalog.byId.get("unknown-item")).toBeUndefined()
  })

  it("accepts an optional nativeTweakDbId", () => {
    const catalog = defineItemCatalog([
      item({ nativeTweakDbId: "Items.MediumPistol" }),
    ])

    expect(catalog.byId.get("medium-pistol")?.nativeTweakDbId).toBe(
      "Items.MediumPistol",
    )
  })

  it("throws on a duplicate id", () => {
    expect(() =>
      defineItemCatalog([item(), item({ label: "Medium Pistol (dupe)" })]),
    ).toThrow(/duplicate item id/i)
  })

  it("throws on a non-positive weight", () => {
    expect(() => defineItemCatalog([item({ weight: 0 })])).toThrow()
    expect(() => defineItemCatalog([item({ weight: -1 })])).toThrow()
  })

  it("throws when maxStack is less than 1", () => {
    expect(() =>
      defineItemCatalog([item({ stackable: true, maxStack: 0 })]),
    ).toThrow()
  })

  it("throws when stackable is false but maxStack is not 1", () => {
    expect(() =>
      defineItemCatalog([item({ stackable: false, maxStack: 2 })]),
    ).toThrow(/maxStack must be 1/i)
  })

  it("allows stackable true with maxStack 1", () => {
    expect(() =>
      defineItemCatalog([item({ stackable: true, maxStack: 1 })]),
    ).not.toThrow()
  })

  it("throws on a non-kebab-case id", () => {
    expect(() => defineItemCatalog([item({ id: "MediumPistol" })])).toThrow()
    expect(() => defineItemCatalog([item({ id: "medium_pistol" })])).toThrow()
    expect(() => defineItemCatalog([item({ id: "-medium-pistol" })])).toThrow()
    expect(() => defineItemCatalog([item({ id: "medium-pistol-" })])).toThrow()
    expect(() => defineItemCatalog([item({ id: "medium--pistol" })])).toThrow()
  })

  it("throws on an unknown category", () => {
    expect(() =>
      defineItemCatalog([
        // biome-ignore lint/suspicious/noExplicitAny: exercising invalid input on purpose
        item({ category: "junk" as any }),
      ]),
    ).toThrow()
  })

  it("builds an empty catalog from an empty list", () => {
    const catalog = defineItemCatalog([])
    expect(catalog.items).toHaveLength(0)
    expect(catalog.byId.size).toBe(0)
  })

  it("freezes the item list and each item definition", () => {
    const catalog = defineItemCatalog([item()])

    expect(Object.isFrozen(catalog.items)).toBe(true)
    expect(Object.isFrozen(catalog.items[0])).toBe(true)
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: exercising a runtime mutation attempt
      ;(catalog.items[0] as any).weight = 999
    }).toThrow()
  })
})
