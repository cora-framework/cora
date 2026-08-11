import { Dialog, ProgressBar } from "@cora-framework/ui"
import type { JSX } from "react"
import { useState } from "react"

/**
 * Presentational view of a single inventory slot. This is intentionally a
 * component-local type distinct from `../contract.ts`'s `InventorySlot`: the
 * contract's `GetInventoryResult.slots` only lists *occupied* slots (see the
 * `inventory_slots` table docs in `../migrations.ts` and the `get` handler
 * in `../server/inventory-module.ts`, which only selects rows that exist),
 * whereas `InventoryGrid` renders a fixed-size grid that must also draw
 * empty cells. Callers (the harness section below, and eventually a real
 * client resource) are expected to materialize a full `SlotView[]` - one
 * entry per slot index up to the configured capacity - by merging the
 * occupied `InventorySlot[]` from `cora.inventory.get` into a dense array,
 * leaving `itemId`/`label`/`quantity`/`equipped` unset for empty slots.
 *
 * `label` mirrors the contract's `InventorySlot.label` (see `../contract.ts`):
 * the server resolves it from the configured catalog and denormalizes it
 * directly onto each filled slot, so this component reads `slot.label`
 * directly rather than taking a `labelFor` callback.
 */
export interface SlotView {
  slot: number
  itemId?: string
  label?: string
  quantity?: number
  equipped?: boolean
}

const MIN_SPLIT_QUANTITY = 1

function slotAriaLabel(slot: SlotView): string {
  if (slot.itemId === undefined || slot.label === undefined) {
    return `Slot ${slot.slot}, empty`
  }
  const qty = slot.quantity ?? 1
  const equipped = slot.equipped === true ? ", equipped" : ""
  return `Slot ${slot.slot}, ${slot.label} x${qty}${equipped}`
}

/**
 * CEF-friendly inventory grid: a `<button>` per slot (native focus/keyboard
 * operability, no custom roving-tabindex needed), click-select interaction
 * instead of drag and drop.
 *
 * Interaction model:
 * - Click an occupied slot to select it as the move source; clicking it
 *   again deselects it without calling `onMove`.
 * - With a source selected, clicking a different slot fires
 *   `onMove(source, target)` and clears the selection.
 * - A selected slot holding more than one unit shows a "Split" button. That
 *   button arms split mode (the source stays selected); the next click on a
 *   different slot picks the split target and opens a `Dialog` asking for a
 *   quantity, instead of firing `onMove`. Confirming with a valid quantity
 *   (`1..sourceQuantity-1`) fires `onSplit(source, target, quantity)`.
 * - Every occupied, unequipped slot shows an "Equip" button that fires
 *   `onEquip(slot)` directly, independent of selection. Equipped slots show
 *   a marker instead (there is no `onUnequip` - not part of this task's
 *   scope per the plan).
 *
 * Drag and drop can layer on top of this later without changing the props
 * contract: the click-select model is the CEF-friendly baseline.
 */
export function InventoryGrid({
  slots,
  columns = 8,
  usedWeight,
  maxWeight,
  onMove,
  onSplit,
  onEquip,
}: {
  slots: SlotView[]
  columns?: number
  usedWeight: number
  maxWeight: number
  onMove: (fromSlot: number, toSlot: number) => void
  onSplit: (fromSlot: number, toSlot: number, quantity: number) => void
  onEquip: (slot: number) => void
}): JSX.Element {
  const [selectedSlot, setSelectedSlot] = useState<number | undefined>(
    undefined,
  )
  const [splitArmed, setSplitArmed] = useState(false)
  const [splitTarget, setSplitTarget] = useState<number | undefined>(undefined)
  const [splitQuantityInput, setSplitQuantityInput] = useState("")
  const [splitError, setSplitError] = useState<string | undefined>(undefined)

  const slotBySlot = new Map(slots.map((slot) => [slot.slot, slot]))
  const sourceSlot =
    selectedSlot !== undefined ? slotBySlot.get(selectedSlot) : undefined
  const isSplitOpen = splitArmed && splitTarget !== undefined

  function resetSelection(): void {
    setSelectedSlot(undefined)
    setSplitArmed(false)
    setSplitTarget(undefined)
    setSplitQuantityInput("")
    setSplitError(undefined)
  }

  function handleSlotClick(clicked: SlotView): void {
    if (splitArmed) {
      if (selectedSlot === undefined || clicked.slot === selectedSlot) {
        return
      }
      setSplitTarget(clicked.slot)
      return
    }

    if (selectedSlot === undefined) {
      if (clicked.itemId !== undefined) {
        setSelectedSlot(clicked.slot)
      }
      return
    }

    if (clicked.slot === selectedSlot) {
      setSelectedSlot(undefined)
      return
    }

    onMove(selectedSlot, clicked.slot)
    resetSelection()
  }

  function handleSplitButtonClick(slotNumber: number): void {
    setSelectedSlot(slotNumber)
    setSplitArmed(true)
    setSplitTarget(undefined)
    setSplitQuantityInput("")
    setSplitError(undefined)
  }

  function handleEquipButtonClick(slotNumber: number): void {
    onEquip(slotNumber)
  }

  function handleSplitConfirm(): void {
    if (selectedSlot === undefined || splitTarget === undefined) {
      return
    }
    const sourceQuantity = sourceSlot?.quantity ?? 1
    const maxQuantity = sourceQuantity - 1
    const parsed = Number(splitQuantityInput)
    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_SPLIT_QUANTITY ||
      parsed > maxQuantity
    ) {
      setSplitError(
        `Enter a quantity between ${MIN_SPLIT_QUANTITY} and ${maxQuantity}.`,
      )
      return
    }
    onSplit(selectedSlot, splitTarget, parsed)
    resetSelection()
  }

  function handleSplitCancel(): void {
    resetSelection()
  }

  return (
    <div className="cora-inventory-grid-container">
      <ProgressBar
        label={`Weight ${usedWeight} / ${maxWeight}`}
        value={usedWeight}
        max={maxWeight}
      />
      <div
        className="cora-inventory-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {slots.map((slot) => {
          const label = slot.label
          const isSelected = slot.slot === selectedSlot
          const isEmpty = slot.itemId === undefined
          const classNames = [
            "cora-inventory-slot",
            isEmpty
              ? "cora-inventory-slot-empty"
              : "cora-inventory-slot-filled",
            isSelected ? "cora-inventory-slot-selected" : "",
          ]
            .filter(Boolean)
            .join(" ")

          return (
            <div key={slot.slot} className={classNames}>
              <button
                type="button"
                className="cora-inventory-slot-main"
                aria-label={slotAriaLabel(slot)}
                aria-pressed={isSelected}
                onClick={() => handleSlotClick(slot)}
              >
                {label !== undefined ? (
                  <span className="cora-inventory-slot-label">{label}</span>
                ) : null}
                {slot.quantity !== undefined && slot.quantity > 1 ? (
                  <span className="cora-inventory-slot-qty">
                    {slot.quantity}
                  </span>
                ) : null}
                {slot.equipped === true ? (
                  <span
                    className="cora-inventory-slot-equipped-marker"
                    aria-hidden="true"
                  >
                    E
                  </span>
                ) : null}
              </button>
              {!isEmpty && slot.equipped !== true ? (
                <button
                  type="button"
                  className="cora-inventory-slot-equip-button"
                  onClick={() => handleEquipButtonClick(slot.slot)}
                >
                  Equip
                </button>
              ) : null}
              {isSelected &&
              !splitArmed &&
              slot.quantity !== undefined &&
              slot.quantity > 1 ? (
                <button
                  type="button"
                  className="cora-inventory-slot-split-button"
                  onClick={() => handleSplitButtonClick(slot.slot)}
                >
                  Split
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      <Dialog
        open={isSplitOpen}
        title="Split stack"
        confirmLabel="Split"
        onConfirm={handleSplitConfirm}
        onCancel={handleSplitCancel}
      >
        <label
          className="cora-inventory-split-label"
          htmlFor="cora-inventory-split-quantity"
        >
          Quantity
        </label>
        <input
          id="cora-inventory-split-quantity"
          className="cora-inventory-split-input"
          type="number"
          value={splitQuantityInput}
          onChange={(event) => setSplitQuantityInput(event.target.value)}
        />
        {splitError !== undefined ? (
          <p className="cora-inventory-split-error" role="alert">
            {splitError}
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
