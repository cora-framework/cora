import { describe, expect, it } from "vitest"
import {
  equipItemInputSchema,
  getInventoryInputSchema,
  giveItemInputSchema,
  moveItemInputSchema,
  removeItemInputSchema,
  splitStackInputSchema,
} from "./contract.js"

describe("cora.inventory.get input schema", () => {
  it("accepts a valid input", () => {
    expect(getInventoryInputSchema.safeParse({ characterId: 1 }).success).toBe(
      true,
    )
  })

  it.each([
    [{}, "missing characterId"],
    [{ characterId: 0 }, "non-positive characterId"],
    [{ characterId: -1 }, "negative characterId"],
    [{ characterId: 1.5 }, "non-integer characterId"],
    [{ characterId: "1" }, "string characterId"],
    [{ characterId: 1, extra: true }, "unknown extra field"],
  ])("rejects %j (%s)", (input) => {
    expect(getInventoryInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.inventory.move input schema", () => {
  it("accepts a valid input", () => {
    expect(
      moveItemInputSchema.safeParse({
        characterId: 1,
        fromSlot: 0,
        toSlot: 1,
      }).success,
    ).toBe(true)
  })

  it.each([
    [{ characterId: 1, fromSlot: -1, toSlot: 1 }, "negative fromSlot"],
    [{ characterId: 1, fromSlot: 0, toSlot: -1 }, "negative toSlot"],
    [{ characterId: 1, fromSlot: 0.5, toSlot: 1 }, "non-integer fromSlot"],
    [{ characterId: 1, toSlot: 1 }, "missing fromSlot"],
  ])("rejects %j (%s)", (input) => {
    expect(moveItemInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.inventory.split input schema", () => {
  it("accepts a valid input", () => {
    expect(
      splitStackInputSchema.safeParse({
        characterId: 1,
        fromSlot: 0,
        toSlot: 1,
        quantity: 3,
      }).success,
    ).toBe(true)
  })

  it.each([
    [
      { characterId: 1, fromSlot: 0, toSlot: 1, quantity: 0 },
      "non-positive quantity",
    ],
    [
      { characterId: 1, fromSlot: 0, toSlot: 1, quantity: -1 },
      "negative quantity",
    ],
    [
      { characterId: 1, fromSlot: 0, toSlot: 1, quantity: 1.5 },
      "non-integer quantity",
    ],
    [{ characterId: 1, fromSlot: 0, toSlot: 1 }, "missing quantity"],
  ])("rejects %j (%s)", (input) => {
    expect(splitStackInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.inventory.give input schema", () => {
  it("accepts a valid input", () => {
    expect(
      giveItemInputSchema.safeParse({
        characterId: 1,
        itemId: "medium-pistol",
        quantity: 1,
      }).success,
    ).toBe(true)
  })

  it.each([
    [{ characterId: 1, itemId: "", quantity: 1 }, "empty itemId"],
    [
      { characterId: 1, itemId: "medium-pistol", quantity: 0 },
      "non-positive quantity",
    ],
    [{ characterId: 1, quantity: 1 }, "missing itemId"],
  ])("rejects %j (%s)", (input) => {
    expect(giveItemInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.inventory.remove input schema", () => {
  it("accepts a valid input", () => {
    expect(
      removeItemInputSchema.safeParse({
        characterId: 1,
        slot: 0,
        quantity: 1,
      }).success,
    ).toBe(true)
  })

  it.each([
    [{ characterId: 1, slot: -1, quantity: 1 }, "negative slot"],
    [{ characterId: 1, slot: 0, quantity: 0 }, "non-positive quantity"],
  ])("rejects %j (%s)", (input) => {
    expect(removeItemInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.inventory.equip input schema", () => {
  it("accepts a valid input", () => {
    expect(
      equipItemInputSchema.safeParse({ characterId: 1, slot: 0 }).success,
    ).toBe(true)
  })

  it.each([
    [{ characterId: 1, slot: -1 }, "negative slot"],
    [{ characterId: 1, slot: 0.5 }, "non-integer slot"],
    [{ slot: 0 }, "missing characterId"],
  ])("rejects %j (%s)", (input) => {
    expect(equipItemInputSchema.safeParse(input).success).toBe(false)
  })
})
