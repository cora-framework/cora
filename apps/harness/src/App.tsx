import "@cora-framework/ui/theme.css"
import "@cora-framework/characters/ui/character-select.css"
import "./harness.css"
import type { CharacterSummary } from "@cora-framework/characters"
import { CharacterSelect } from "@cora-framework/characters/ui"
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
import { createMockCharacters, createMockNotifications, mockRpc } from "./mock"

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
    </div>
  )
}
