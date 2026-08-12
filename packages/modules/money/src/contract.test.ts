import { describe, expect, it } from "vitest"
import {
  adjustInputSchema,
  depositInputSchema,
  getAccountInputSchema,
  transferInputSchema,
  withdrawInputSchema,
} from "./contract.js"

describe("cora.money.get input schema", () => {
  it("accepts a valid input", () => {
    expect(getAccountInputSchema.safeParse({ characterId: 1 }).success).toBe(
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
    expect(getAccountInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.money.transfer input schema", () => {
  it("accepts a valid input", () => {
    expect(
      transferInputSchema.safeParse({
        fromCharacterId: 1,
        toCharacterId: 2,
        kind: "cash",
        amount: 100,
      }).success,
    ).toBe(true)
  })

  it.each([
    [
      {
        fromCharacterId: 1,
        toCharacterId: 2,
        kind: "cash",
        amount: -1,
      },
      "negative amount",
    ],
    [
      { fromCharacterId: 1, toCharacterId: 2, kind: "cash", amount: 0 },
      "zero amount",
    ],
    [
      {
        fromCharacterId: 1,
        toCharacterId: 2,
        kind: "cash",
        amount: 1.5,
      },
      "non-integer amount",
    ],
    [
      { fromCharacterId: 1, toCharacterId: 2, kind: "gold", amount: 1 },
      "unknown kind",
    ],
    [{ toCharacterId: 2, kind: "cash", amount: 1 }, "missing fromCharacterId"],
  ])("rejects %j (%s)", (input) => {
    expect(transferInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.money.deposit input schema", () => {
  it("accepts a valid input", () => {
    expect(
      depositInputSchema.safeParse({ characterId: 1, amount: 100 }).success,
    ).toBe(true)
  })

  it.each([
    [{ characterId: 1, amount: -1 }, "negative amount"],
    [{ characterId: 1, amount: 0 }, "zero amount"],
    [{ characterId: 1, amount: 1.5 }, "non-integer amount"],
    [{ characterId: 1 }, "missing amount"],
  ])("rejects %j (%s)", (input) => {
    expect(depositInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.money.withdraw input schema", () => {
  it("accepts a valid input", () => {
    expect(
      withdrawInputSchema.safeParse({ characterId: 1, amount: 100 }).success,
    ).toBe(true)
  })

  it.each([
    [{ characterId: 1, amount: -1 }, "negative amount"],
    [{ characterId: 1, amount: 0 }, "zero amount"],
    [{ characterId: 1, amount: 1.5 }, "non-integer amount"],
  ])("rejects %j (%s)", (input) => {
    expect(withdrawInputSchema.safeParse(input).success).toBe(false)
  })
})

describe("cora.money.adjust input schema", () => {
  it("accepts a valid input, including a negative delta", () => {
    expect(
      adjustInputSchema.safeParse({
        characterId: 1,
        kind: "bank",
        delta: -500,
        reason: "correction",
      }).success,
    ).toBe(true)
  })

  it("accepts a positive delta", () => {
    expect(
      adjustInputSchema.safeParse({
        characterId: 1,
        kind: "crypto",
        delta: 500,
        reason: "bonus",
      }).success,
    ).toBe(true)
  })

  it.each([
    [
      { characterId: 1, kind: "cash", delta: 1.5, reason: "x" },
      "non-integer delta",
    ],
    [{ characterId: 1, kind: "cash", delta: 0, reason: "" }, "empty reason"],
    [{ characterId: 1, kind: "gold", delta: 1, reason: "x" }, "unknown kind"],
    [{ characterId: 1, kind: "cash", reason: "x" }, "missing delta"],
  ])("rejects %j (%s)", (input) => {
    expect(adjustInputSchema.safeParse(input).success).toBe(false)
  })
})
