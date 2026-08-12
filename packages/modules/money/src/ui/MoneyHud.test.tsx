// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MoneyHud } from "./MoneyHud"

afterEach(() => {
  cleanup()
})

describe("MoneyHud", () => {
  it("renders the three balances formatted with the default formatter", () => {
    render(<MoneyHud cash={123456} bank={789} crypto={0} />)
    expect(screen.getByText("1,234.56")).toBeTruthy()
    expect(screen.getByText("7.89")).toBeTruthy()
    expect(screen.getByText("0.00")).toBeTruthy()
  })

  it("formats a zero balance as 0.00", () => {
    render(<MoneyHud cash={0} bank={0} crypto={0} />)
    expect(screen.getAllByText("0.00").length).toBe(3)
  })

  it("adds thousands separators to large values", () => {
    render(<MoneyHud cash={123456789} bank={0} crypto={0} />)
    expect(screen.getByText("1,234,567.89")).toBeTruthy()
  })

  it("formats a negative delta correctly", () => {
    render(<MoneyHud cash={-500} bank={0} crypto={0} />)
    expect(screen.getByText("-5.00")).toBeTruthy()
  })

  it("respects a custom format function", () => {
    render(
      <MoneyHud
        cash={100}
        bank={200}
        crypto={300}
        format={(minor) => `$${minor}`}
      />,
    )
    expect(screen.getByText("$100")).toBeTruthy()
    expect(screen.getByText("$200")).toBeTruthy()
    expect(screen.getByText("$300")).toBeTruthy()
  })

  it("exposes an accessible group with per-value aria-labels", () => {
    render(<MoneyHud cash={123456} bank={789} crypto={100} />)
    expect(screen.getByRole("group", { name: "Money" })).toBeTruthy()
    expect(screen.getByLabelText("Cash: 1,234.56")).toBeTruthy()
    expect(screen.getByLabelText("Bank: 7.89")).toBeTruthy()
    expect(screen.getByLabelText("Crypto: 1.00")).toBeTruthy()
  })
})
