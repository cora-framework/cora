// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CharacterSummary } from "../contract.js"
import { CharacterSelect } from "./CharacterSelect"

afterEach(() => {
  cleanup()
})

const CHARACTERS: CharacterSummary[] = [
  {
    id: 1,
    name: "Alice Vance",
    appearance: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastPlayedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Bjorn Ostergaard",
    appearance: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastPlayedAt: null,
  },
]

function noop(): void {}

describe("CharacterSelect", () => {
  it("renders every character in the menu", () => {
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={4}
        onSelect={noop}
        onCreate={noop}
        onDelete={noop}
      />,
    )
    expect(screen.getByText("Alice Vance")).toBeTruthy()
    expect(screen.getByText("Bjorn Ostergaard")).toBeTruthy()
  })

  it("shows an empty state when there are no characters", () => {
    render(
      <CharacterSelect
        characters={[]}
        maxCharacters={4}
        onSelect={noop}
        onCreate={noop}
        onDelete={noop}
      />,
    )
    expect(screen.getByText(/No characters yet/)).toBeTruthy()
  })

  it("fires onSelect with the character id on activation", () => {
    const onSelect = vi.fn()
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={4}
        onSelect={onSelect}
        onCreate={noop}
        onDelete={noop}
      />,
    )
    fireEvent.click(screen.getByText("Alice Vance"))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it("disables the create entry once at the character limit", () => {
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={2}
        onSelect={noop}
        onCreate={noop}
        onDelete={noop}
      />,
    )
    const createItem = screen
      .getByText("Create character")
      .closest('[role="menuitem"]')
    expect(createItem?.getAttribute("aria-disabled")).toBe("true")
  })

  it("does not open the create dialog when at the limit", () => {
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={2}
        onSelect={noop}
        onCreate={noop}
        onDelete={noop}
      />,
    )
    fireEvent.click(screen.getByText("Create character"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("rejects an invalid name client-side without calling onCreate", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={4}
        onSelect={noop}
        onCreate={onCreate}
        onDelete={noop}
      />,
    )
    await user.click(screen.getByText("Create character"))
    const input = screen.getByLabelText("Name")
    await user.type(input, "a")
    await user.click(screen.getByText("Create"))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("accepts a valid name, calls onCreate and closes the dialog", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={4}
        onSelect={noop}
        onCreate={onCreate}
        onDelete={noop}
      />,
    )
    await user.click(screen.getByText("Create character"))
    const input = screen.getByLabelText("Name")
    await user.type(input, "Mara Voss")
    await user.click(screen.getByText("Create"))
    expect(onCreate).toHaveBeenCalledWith("Mara Voss")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not call onCreate for a name with leading/trailing spaces left after trim still invalid", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={4}
        onSelect={noop}
        onCreate={onCreate}
        onDelete={noop}
      />,
    )
    await user.click(screen.getByText("Create character"))
    const input = screen.getByLabelText("Name")
    await user.type(input, "123")
    await user.click(screen.getByText("Create"))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it("only fires onDelete after confirming the delete dialog", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={4}
        onSelect={noop}
        onCreate={noop}
        onDelete={onDelete}
      />,
    )
    await user.click(screen.getByText("Delete Alice Vance"))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeTruthy()
    await user.click(screen.getByText("Delete"))
    expect(onDelete).toHaveBeenCalledWith(1)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not fire onDelete when the delete dialog is cancelled", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <CharacterSelect
        characters={CHARACTERS}
        maxCharacters={4}
        onSelect={noop}
        onCreate={noop}
        onDelete={onDelete}
      />,
    )
    await user.click(screen.getByText("Delete Alice Vance"))
    await user.click(screen.getByText("Cancel"))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
