// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { InventoryGrid, type SlotView } from "./InventoryGrid"

afterEach(() => {
  cleanup()
})

const LABELS: Record<string, string> = {
  "medium-pistol": "Medium Pistol",
  "stim-pack": "Stim Pack",
}

function labelFor(itemId: string): string {
  return LABELS[itemId] ?? itemId
}

function noop(): void {}

function buildSlots(
  overrides: Partial<Record<number, SlotView>> = {},
): SlotView[] {
  const base: SlotView[] = Array.from({ length: 8 }, (_, index) => ({
    slot: index,
  }))
  base[0] = { slot: 0, itemId: "medium-pistol", quantity: 1, equipped: false }
  base[1] = { slot: 1, itemId: "stim-pack", quantity: 5, equipped: false }
  base[2] = {
    slot: 2,
    itemId: "medium-pistol",
    quantity: 1,
    equipped: true,
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      base[Number(key)] = value
    }
  }
  return base
}

describe("InventoryGrid", () => {
  it("renders item labels and quantity badges for occupied slots", () => {
    render(
      <InventoryGrid
        slots={buildSlots()}
        usedWeight={10}
        maxWeight={100}
        onMove={noop}
        onSplit={noop}
        onEquip={noop}
        labelFor={labelFor}
      />,
    )
    expect(screen.getAllByText("Medium Pistol").length).toBeGreaterThan(0)
    expect(screen.getByText("Stim Pack")).toBeTruthy()
    expect(screen.getByText("5")).toBeTruthy()
  })

  it("renders empty slots without item content", () => {
    render(
      <InventoryGrid
        slots={buildSlots()}
        usedWeight={10}
        maxWeight={100}
        onMove={noop}
        onSplit={noop}
        onEquip={noop}
        labelFor={labelFor}
      />,
    )
    const emptySlotButton = screen.getByLabelText("Slot 3, empty")
    expect(emptySlotButton.textContent).toBe("")
  })

  it("shows an equipped marker for equipped slots", () => {
    render(
      <InventoryGrid
        slots={buildSlots()}
        usedWeight={10}
        maxWeight={100}
        onMove={noop}
        onSplit={noop}
        onEquip={noop}
        labelFor={labelFor}
      />,
    )
    expect(
      screen.getByLabelText(/Slot 2, Medium Pistol x1, equipped/),
    ).toBeTruthy()
  })

  it("reflects usedWeight and maxWeight in the progress bar", () => {
    render(
      <InventoryGrid
        slots={buildSlots()}
        usedWeight={42}
        maxWeight={120}
        onMove={noop}
        onSplit={noop}
        onEquip={noop}
        labelFor={labelFor}
      />,
    )
    const progress = screen.getByRole("progressbar")
    expect(progress.getAttribute("aria-valuenow")).toBe("42")
    expect(progress.getAttribute("aria-valuemax")).toBe("120")
  })

  it("selects a source slot then fires onMove when a different slot is clicked", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(
      <InventoryGrid
        slots={buildSlots()}
        usedWeight={10}
        maxWeight={100}
        onMove={onMove}
        onSplit={noop}
        onEquip={noop}
        labelFor={labelFor}
      />,
    )
    await user.click(screen.getByLabelText(/Slot 0,/))
    await user.click(screen.getByLabelText("Slot 3, empty"))
    expect(onMove).toHaveBeenCalledWith(0, 3)
  })

  it("clicking the same slot again deselects it without calling onMove", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(
      <InventoryGrid
        slots={buildSlots()}
        usedWeight={10}
        maxWeight={100}
        onMove={onMove}
        onSplit={noop}
        onEquip={noop}
        labelFor={labelFor}
      />,
    )
    const sourceButton = screen.getByLabelText(/Slot 0,/)
    await user.click(sourceButton)
    await user.click(sourceButton)
    expect(onMove).not.toHaveBeenCalled()
    expect(sourceButton.getAttribute("aria-pressed")).toBe("false")
  })

  it("fires onEquip when the equip button is clicked", async () => {
    const user = userEvent.setup()
    const onEquip = vi.fn()
    render(
      <InventoryGrid
        slots={buildSlots()}
        usedWeight={10}
        maxWeight={100}
        onMove={noop}
        onSplit={noop}
        onEquip={onEquip}
        labelFor={labelFor}
      />,
    )
    const equipButtons = screen.getAllByText("Equip")
    await user.click(equipButtons[0] as HTMLElement)
    expect(onEquip).toHaveBeenCalledWith(0)
  })

  it("opens a split dialog, rejects an out-of-range quantity, then accepts a valid one", async () => {
    const user = userEvent.setup()
    const onSplit = vi.fn()
    render(
      <InventoryGrid
        slots={buildSlots()}
        usedWeight={10}
        maxWeight={100}
        onMove={noop}
        onSplit={onSplit}
        onEquip={noop}
        labelFor={labelFor}
      />,
    )
    // Slot 1 (Stim Pack x5) is the only slot with quantity > 1, so select it
    // first to reveal its Split button.
    await user.click(screen.getByLabelText(/Slot 1,/))
    await user.click(screen.getByText("Split"))
    // Split is armed; click an empty target slot to open the quantity dialog.
    await user.click(screen.getByLabelText("Slot 4, empty"))
    expect(screen.getByRole("dialog")).toBeTruthy()

    const input = screen.getByLabelText("Quantity")
    await user.type(input, "9")
    await user.click(
      screen.getByText("Split", { selector: ".cora-dialog-confirm" }),
    )
    expect(onSplit).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toBeTruthy()

    await user.clear(input)
    await user.type(input, "2")
    await user.click(
      screen.getByText("Split", { selector: ".cora-dialog-confirm" }),
    )
    expect(onSplit).toHaveBeenCalledWith(1, 4, 2)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
