import "@cora-framework/ui/theme.css"
import "@cora-framework/characters/ui/character-select.css"
import "@cora-framework/inventory/ui/inventory-grid.css"
import "@cora-framework/money/ui/money-hud.css"
import "./harness.css"
import type { CharacterSummary } from "@cora-framework/characters"
import { CharacterSelect } from "@cora-framework/characters/ui"
import type { SlotView } from "@cora-framework/inventory/ui"
import { InventoryGrid } from "@cora-framework/inventory/ui"
import type { AccountBalances } from "@cora-framework/money"
import { MoneyHud } from "@cora-framework/money/ui"
import type {
  CoraNotification,
  MenuItem,
  NotificationKind,
} from "@cora-framework/ui"
import {
  applyTheme,
  Dialog,
  Menu,
  Notifications,
  ProgressBar,
} from "@cora-framework/ui"
import type { JSX } from "react"
import { useEffect, useState } from "react"
import {
  createMockCharacters,
  createMockInventorySlots,
  createMockMoneyBalances,
  createMockNotifications,
  mockCatalogCategoryFor,
  mockRpc,
} from "./mock"

const MONEY_DEPOSIT_AMOUNT = 100_00
const MONEY_WITHDRAW_AMOUNT = 100_00
const MONEY_ADJUST_CASH_DELTA = 500_00

const MOCK_INVENTORY_MAX_WEIGHT = 100
const MOCK_INVENTORY_ITEM_WEIGHT = 2

/**
 * Rebuilds a `SlotView` for `slotNumber` from `content`'s
 * itemId/quantity/equipped fields, including each field only when it is
 * actually present on `content` rather than assigning a possibly-`undefined`
 * value directly - required under `exactOptionalPropertyTypes`, which
 * distinguishes an omitted optional property from one explicitly set to
 * `undefined`.
 */
function withContent(slotNumber: number, content: SlotView): SlotView {
  return {
    slot: slotNumber,
    ...(content.itemId !== undefined ? { itemId: content.itemId } : {}),
    ...(content.label !== undefined ? { label: content.label } : {}),
    ...(content.quantity !== undefined ? { quantity: content.quantity } : {}),
    ...(content.equipped !== undefined ? { equipped: content.equipped } : {}),
  }
}

const MAX_MOCK_CHARACTERS = 4

const NOTIFICATION_KINDS: NotificationKind[] = [
  "info",
  "success",
  "warning",
  "error",
]

const BASE_MENU_ITEMS: MenuItem[] = [
  { id: "open", label: "Open" },
  { id: "save", label: "Save" },
  {
    id: "rename",
    label: "Rename",
    disabled: true,
    hint: "Locked while syncing",
  },
  { id: "delete", label: "Delete" },
]

const EXTRA_MENU_ITEM: MenuItem = {
  id: "share",
  label: "Share",
  hint: "Loaded via mockRpc",
}

let notificationCounter = 0

function nextNotificationId(): string {
  notificationCounter += 1
  return `harness-${notificationCounter}`
}

export function App(): JSX.Element {
  useEffect(() => {
    applyTheme(document.documentElement)
  }, [])

  const [notifications, setNotifications] = useState<CoraNotification[]>(() =>
    createMockNotifications(),
  )

  function addNotification(kind: NotificationKind): void {
    setNotifications((current) => [
      ...current,
      {
        id: nextNotificationId(),
        kind,
        title: `${kind[0]?.toUpperCase()}${kind.slice(1)} notification`,
        message: `This is a demo ${kind} notification.`,
      },
    ])
  }

  function dismissNotification(id: string): void {
    setNotifications((current) => current.filter((item) => item.id !== id))
  }

  const [menuItems, setMenuItems] = useState<MenuItem[]>(BASE_MENU_ITEMS)
  const [activationLog, setActivationLog] = useState<string[]>([])
  const [isLoadingExtra, setIsLoadingExtra] = useState(false)

  function handleMenuActivate(id: string): void {
    const item = menuItems.find((menuItem) => menuItem.id === id)
    const label = item?.label ?? id
    setActivationLog((current) => [
      `${new Date().toLocaleTimeString()} - activated "${label}"`,
      ...current,
    ])
  }

  async function loadExtraMenuItem(): Promise<void> {
    setIsLoadingExtra(true)
    const loaded = await mockRpc(EXTRA_MENU_ITEM, 400)
    setMenuItems((current) => {
      if (current.some((item) => item.id === loaded.id)) {
        return current
      }
      return [...current, loaded]
    })
    setNotifications((current) => [
      ...current,
      {
        id: nextNotificationId(),
        kind: "info",
        title: "Loaded via mockRpc",
        message: `Menu item "${loaded.label}" arrived asynchronously.`,
      },
    ])
    setIsLoadingExtra(false)
  }

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogStatus, setDialogStatus] = useState("No decision yet.")

  function handleDialogConfirm(): void {
    setDialogStatus(`Confirmed at ${new Date().toLocaleTimeString()}`)
    setIsDialogOpen(false)
  }

  function handleDialogCancel(): void {
    setDialogStatus(`Cancelled at ${new Date().toLocaleTimeString()}`)
    setIsDialogOpen(false)
  }

  const [animatedProgress, setAnimatedProgress] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimatedProgress((current) => (current + 4) % 101)
    }, 200)
    return () => {
      clearInterval(timer)
    }
  }, [])

  const [characters, setCharacters] = useState<CharacterSummary[]>(() =>
    createMockCharacters(),
  )
  const [characterLog, setCharacterLog] = useState<string[]>([])
  const nextCharacterId =
    Math.max(0, ...characters.map((character) => character.id)) + 1

  function logCharacterAction(entry: string): void {
    setCharacterLog((current) => [
      `${new Date().toLocaleTimeString()} - ${entry}`,
      ...current,
    ])
  }

  function handleCharacterSelect(id: number): void {
    const character = characters.find((item) => item.id === id)
    logCharacterAction(`selected "${character?.name ?? id}"`)
  }

  function handleCharacterCreate(name: string): void {
    const now = new Date().toISOString()
    const created: CharacterSummary = {
      id: nextCharacterId,
      name,
      appearance: null,
      createdAt: now,
      lastPlayedAt: null,
    }
    setCharacters((current) => [...current, created])
    logCharacterAction(`created "${name}"`)
  }

  function handleCharacterDelete(id: number): void {
    const character = characters.find((item) => item.id === id)
    setCharacters((current) => current.filter((item) => item.id !== id))
    logCharacterAction(`deleted "${character?.name ?? id}"`)
  }

  const [inventorySlots, setInventorySlots] = useState<SlotView[]>(() =>
    createMockInventorySlots(),
  )
  const [inventoryLog, setInventoryLog] = useState<string[]>([])

  function logInventoryAction(entry: string): void {
    setInventoryLog((current) => [
      `${new Date().toLocaleTimeString()} - ${entry}`,
      ...current,
    ])
  }

  const inventoryUsedWeight = inventorySlots.reduce(
    (sum, slot) => sum + (slot.quantity ?? 0) * MOCK_INVENTORY_ITEM_WEIGHT,
    0,
  )

  function handleInventoryMove(fromSlot: number, toSlot: number): void {
    setInventorySlots((current) => {
      const from = current.find((slot) => slot.slot === fromSlot)
      const to = current.find((slot) => slot.slot === toSlot)
      if (from === undefined || to === undefined || from.itemId === undefined) {
        return current
      }
      // Swap contents when the target is occupied (demo semantics only -
      // the real server-side moveSlot merges same-item stacks; see
      // src/server/operations.ts). Rebuilt via `withContent` rather than
      // direct property assignment so an absent (not merely undefined)
      // field stays absent under `exactOptionalPropertyTypes`.
      const fromContent = withContent(fromSlot, to)
      const toContent = withContent(toSlot, from)
      return current.map((slot) => {
        if (slot.slot === fromSlot) return fromContent
        if (slot.slot === toSlot) return toContent
        return slot
      })
    })
    logInventoryAction(`moved slot ${fromSlot} -> ${toSlot}`)
  }

  function handleInventorySplit(
    fromSlot: number,
    toSlot: number,
    quantity: number,
  ): void {
    setInventorySlots((current) => {
      const from = current.find((slot) => slot.slot === fromSlot)
      const to = current.find((slot) => slot.slot === toSlot)
      if (
        from === undefined ||
        to === undefined ||
        from.itemId === undefined ||
        to.itemId !== undefined ||
        from.quantity === undefined ||
        quantity >= from.quantity
      ) {
        return current
      }
      const fromContent: SlotView = {
        ...from,
        quantity: from.quantity - quantity,
      }
      const toContent: SlotView = {
        slot: toSlot,
        itemId: from.itemId,
        ...(from.label !== undefined ? { label: from.label } : {}),
        quantity,
      }
      return current.map((slot) => {
        if (slot.slot === fromSlot) return fromContent
        if (slot.slot === toSlot) return toContent
        return slot
      })
    })
    logInventoryAction(
      `split ${quantity} from slot ${fromSlot} into slot ${toSlot}`,
    )
  }

  function handleInventoryEquip(slot: number): void {
    setInventorySlots((current) => {
      const target = current.find((item) => item.slot === slot)
      if (target === undefined || target.itemId === undefined) {
        return current
      }
      const category = mockCatalogCategoryFor(target.itemId)
      return current.map((item) => {
        if (item.slot === slot) {
          return { ...item, equipped: true }
        }
        if (
          category !== undefined &&
          item.itemId !== undefined &&
          mockCatalogCategoryFor(item.itemId) === category
        ) {
          return { ...item, equipped: false }
        }
        return item
      })
    })
    logInventoryAction(`equipped slot ${slot}`)
  }

  const [moneyBalances, setMoneyBalances] = useState<AccountBalances>(() =>
    createMockMoneyBalances(),
  )
  const [moneyLog, setMoneyLog] = useState<string[]>([])

  function logMoneyAction(entry: string): void {
    setMoneyLog((current) => [
      `${new Date().toLocaleTimeString()} - ${entry}`,
      ...current,
    ])
  }

  function handleMoneyDeposit(): void {
    setMoneyBalances((current) => {
      const amount = Math.min(MONEY_DEPOSIT_AMOUNT, current.cash)
      return {
        ...current,
        cash: current.cash - amount,
        bank: current.bank + amount,
      }
    })
    logMoneyAction(
      `deposited ${MONEY_DEPOSIT_AMOUNT} from cash into bank (mock)`,
    )
  }

  function handleMoneyWithdraw(): void {
    setMoneyBalances((current) => {
      const amount = Math.min(MONEY_WITHDRAW_AMOUNT, current.bank)
      return {
        ...current,
        bank: current.bank - amount,
        cash: current.cash + amount,
      }
    })
    logMoneyAction(
      `withdrew ${MONEY_WITHDRAW_AMOUNT} from bank into cash (mock)`,
    )
  }

  function handleMoneyAdjustCash(): void {
    setMoneyBalances((current) => ({
      ...current,
      cash: current.cash + MONEY_ADJUST_CASH_DELTA,
    }))
    logMoneyAction(`adjusted cash by +${MONEY_ADJUST_CASH_DELTA} (mock)`)
  }

  return (
    <div className="harness">
      <header className="harness-header">
        <h1>CORA UI Harness</h1>
        <p>A dev gallery for exercising @cora-framework/ui components.</p>
      </header>

      <section className="harness-section">
        <h2>Notifications</h2>
        <div className="harness-controls">
          {NOTIFICATION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => addNotification(kind)}
            >
              Add {kind}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadExtraMenuItem()}
            disabled={isLoadingExtra}
          >
            {isLoadingExtra ? "Loading..." : "Load via mockRpc"}
          </button>
        </div>
        <Notifications items={notifications} onDismiss={dismissNotification} />
      </section>

      <section className="harness-section">
        <h2>Menu</h2>
        <Menu
          title="Document actions"
          items={menuItems}
          onActivate={handleMenuActivate}
        />
        <div className="harness-log">
          <h3>Activation log</h3>
          {activationLog.length === 0 ? (
            <p className="harness-log-empty">No activations yet.</p>
          ) : (
            <ul>
              {activationLog.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="harness-section">
        <h2>Dialog</h2>
        <div className="harness-controls">
          <button type="button" onClick={() => setIsDialogOpen(true)}>
            Open dialog
          </button>
        </div>
        <p className="harness-status">{dialogStatus}</p>
        <Dialog
          open={isDialogOpen}
          title="Confirm action"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          onConfirm={handleDialogConfirm}
          onCancel={handleDialogCancel}
        >
          <p>This dialog is part of the CORA UI harness gallery.</p>
        </Dialog>
      </section>

      <section className="harness-section">
        <h2>Progress</h2>
        <ProgressBar label="Animated" value={animatedProgress} />
        <ProgressBar label="Static (72 of 100)" value={72} />
      </section>

      <section className="harness-section">
        <h2>Characters</h2>
        <p className="harness-status">
          @cora-framework/characters' CharacterSelect, rendered with mock data
          (max {MAX_MOCK_CHARACTERS} characters).
        </p>
        <CharacterSelect
          characters={characters}
          maxCharacters={MAX_MOCK_CHARACTERS}
          onSelect={handleCharacterSelect}
          onCreate={handleCharacterCreate}
          onDelete={handleCharacterDelete}
        />
        <div className="harness-log">
          <h3>Action log</h3>
          {characterLog.length === 0 ? (
            <p className="harness-log-empty">No actions yet.</p>
          ) : (
            <ul>
              {characterLog.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="harness-section">
        <h2>Inventory</h2>
        <p className="harness-status">
          @cora-framework/inventory's InventoryGrid, rendered with a mock
          catalog and mutable local slot state (click a filled slot to select it
          as the move source, then click a different slot to move; click Split
          on a selected multi-quantity slot then a target slot to split; click
          Equip on any slot).
        </p>
        <InventoryGrid
          slots={inventorySlots}
          columns={8}
          usedWeight={inventoryUsedWeight}
          maxWeight={MOCK_INVENTORY_MAX_WEIGHT}
          onMove={handleInventoryMove}
          onSplit={handleInventorySplit}
          onEquip={handleInventoryEquip}
        />
        <div className="harness-log">
          <h3>Action log</h3>
          {inventoryLog.length === 0 ? (
            <p className="harness-log-empty">No actions yet.</p>
          ) : (
            <ul>
              {inventoryLog.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="harness-section">
        <h2>Money</h2>
        <p className="harness-status">
          @cora-framework/money's MoneyHud, rendered with mutable local mock
          balances (integer minor units). MoneyHud itself is a pure
          presentational component - the buttons below simulate what a
          `cora.money.deposit`/`withdraw`/`adjust` success (and the resulting
          `cora.money.ui.update` push) would do to the balances.
        </p>
        <MoneyHud
          cash={moneyBalances.cash}
          bank={moneyBalances.bank}
          crypto={moneyBalances.crypto}
        />
        <div className="harness-controls">
          <button type="button" onClick={handleMoneyDeposit}>
            Deposit 100
          </button>
          <button type="button" onClick={handleMoneyWithdraw}>
            Withdraw 100
          </button>
          <button type="button" onClick={handleMoneyAdjustCash}>
            Adjust +500 cash
          </button>
        </div>
        <div className="harness-log">
          <h3>Action log</h3>
          {moneyLog.length === 0 ? (
            <p className="harness-log-empty">No actions yet.</p>
          ) : (
            <ul>
              {moneyLog.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
