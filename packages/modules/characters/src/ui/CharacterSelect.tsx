import type { MenuItem } from "@cora-framework/ui"
import { Dialog, Menu } from "@cora-framework/ui"
import type { JSX } from "react"
import { useState } from "react"
import { type CharacterSummary, isValidCharacterName } from "../contract.js"

const CREATE_ITEM_ID = "__create__"

const INVALID_NAME_MESSAGE =
  "Name must be 2-32 characters, letters, spaces and hyphens only."

function formatLastPlayedHint(character: CharacterSummary): string | undefined {
  if (character.lastPlayedAt === null) {
    return undefined
  }
  return `Last played ${new Date(character.lastPlayedAt).toLocaleString()}`
}

/**
 * Character-select gallery: a `Menu` of the player's own characters plus a
 * "Create character" entry (disabled once `maxCharacters` is reached), a
 * create `Dialog` with client-side name validation reusing
 * `isValidCharacterName` from the contract (the same rule the server
 * enforces, so a rejected name never round-trips to the server only to
 * bounce back), and a per-character delete `Dialog` that only fires
 * `onDelete` after explicit confirmation.
 *
 * Keyboard operability for browsing/selecting/creating comes from `Menu`
 * (arrow keys + Enter); the delete affordance is a plain `<button>` per
 * character, which is natively focusable and activatable via keyboard.
 */
export function CharacterSelect({
  characters,
  maxCharacters,
  onSelect,
  onCreate,
  onDelete,
}: {
  characters: CharacterSummary[]
  maxCharacters: number
  onSelect: (id: number) => void
  onCreate: (name: string) => void
  onDelete: (id: number) => void
}): JSX.Element {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | undefined>(
    undefined,
  )

  const atMax = characters.length >= maxCharacters

  const items: MenuItem[] = [
    ...characters.map((character) => {
      const hint = formatLastPlayedHint(character)
      return {
        id: String(character.id),
        label: character.name,
        ...(hint !== undefined ? { hint } : {}),
      }
    }),
    {
      id: CREATE_ITEM_ID,
      label: "Create character",
      disabled: atMax,
      ...(atMax
        ? { hint: `Maximum of ${maxCharacters} characters reached` }
        : {}),
    },
  ]

  function openCreateDialog(): void {
    setNameInput("")
    setNameError(undefined)
    setIsCreateOpen(true)
  }

  function handleActivate(id: string): void {
    if (id === CREATE_ITEM_ID) {
      openCreateDialog()
      return
    }
    onSelect(Number(id))
  }

  function handleCreateConfirm(): void {
    const trimmed = nameInput.trim()
    if (!isValidCharacterName(trimmed)) {
      setNameError(INVALID_NAME_MESSAGE)
      return
    }
    onCreate(trimmed)
    setIsCreateOpen(false)
  }

  function handleCreateCancel(): void {
    setIsCreateOpen(false)
  }

  const pendingDeleteCharacter = characters.find(
    (character) => character.id === pendingDeleteId,
  )

  function handleDeleteConfirm(): void {
    if (pendingDeleteId === undefined) {
      return
    }
    onDelete(pendingDeleteId)
    setPendingDeleteId(undefined)
  }

  function handleDeleteCancel(): void {
    setPendingDeleteId(undefined)
  }

  return (
    <div className="cora-character-select">
      {characters.length === 0 ? (
        <p className="cora-character-select-empty">
          No characters yet - create one to get started.
        </p>
      ) : null}
      <Menu title="Characters" items={items} onActivate={handleActivate} />
      {characters.length > 0 ? (
        <div className="cora-character-select-delete-row">
          {characters.map((character) => (
            <button
              key={character.id}
              type="button"
              className="cora-character-select-delete-button"
              onClick={() => setPendingDeleteId(character.id)}
            >
              Delete {character.name}
            </button>
          ))}
        </div>
      ) : null}
      <Dialog
        open={isCreateOpen}
        title="Create character"
        confirmLabel="Create"
        onConfirm={handleCreateConfirm}
        onCancel={handleCreateCancel}
      >
        <label
          className="cora-character-select-label"
          htmlFor="cora-character-select-name"
        >
          Name
        </label>
        <input
          id="cora-character-select-name"
          className="cora-character-select-input"
          type="text"
          value={nameInput}
          onChange={(event) => setNameInput(event.target.value)}
        />
        {nameError !== undefined ? (
          <p className="cora-character-select-error" role="alert">
            {nameError}
          </p>
        ) : null}
      </Dialog>
      <Dialog
        open={pendingDeleteCharacter !== undefined}
        title="Delete character"
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      >
        <p>
          Delete {pendingDeleteCharacter?.name ?? "this character"}? This cannot
          be undone.
        </p>
      </Dialog>
    </div>
  )
}
