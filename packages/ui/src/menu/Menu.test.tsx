// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MenuItem } from "./Menu"
import { Menu } from "./Menu"

afterEach(() => {
  cleanup()
})

const items: MenuItem[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo", disabled: true },
  { id: "c", label: "Charlie" },
]

describe("Menu", () => {
  it("renders a menu with menuitem roles", () => {
    render(<Menu items={items} onActivate={() => {}} />)
    expect(screen.getByRole("menu")).toBeTruthy()
    expect(screen.getAllByRole("menuitem")).toHaveLength(3)
  })

  it("sets aria-label from title", () => {
    render(<Menu title="Actions" items={items} onActivate={() => {}} />)
    expect(screen.getByRole("menu").getAttribute("aria-label")).toBe("Actions")
  })

  it("marks disabled items with aria-disabled", () => {
    render(<Menu items={items} onActivate={() => {}} />)
    const bravo = screen.getByText("Bravo").closest('[role="menuitem"]')
    expect(bravo?.getAttribute("aria-disabled")).toBe("true")
  })

  it("defaults selection to the first non-disabled item", () => {
    render(<Menu items={items} onActivate={() => {}} />)
    const alpha = screen.getByText("Alpha").closest('[role="menuitem"]')
    expect(alpha?.getAttribute("data-selected")).toBe("true")
  })

  it("moves highlight down with ArrowDown, skipping disabled items", () => {
    const onSelect = vi.fn()
    render(<Menu items={items} onActivate={() => {}} onSelect={onSelect} />)
    const menu = screen.getByRole("menu")
    fireEvent.keyDown(menu, { key: "ArrowDown" })
    expect(onSelect).toHaveBeenCalledWith("c")
    const charlie = screen.getByText("Charlie").closest('[role="menuitem"]')
    expect(charlie?.getAttribute("data-selected")).toBe("true")
  })

  it("wraps to the first non-disabled item with ArrowDown at the end", () => {
    const onSelect = vi.fn()
    render(<Menu items={items} onActivate={() => {}} onSelect={onSelect} />)
    const menu = screen.getByRole("menu")
    fireEvent.keyDown(menu, { key: "ArrowDown" })
    fireEvent.keyDown(menu, { key: "ArrowDown" })
    expect(onSelect).toHaveBeenLastCalledWith("a")
  })

  it("wraps to the last non-disabled item with ArrowUp at the start", () => {
    const onSelect = vi.fn()
    render(<Menu items={items} onActivate={() => {}} onSelect={onSelect} />)
    const menu = screen.getByRole("menu")
    fireEvent.keyDown(menu, { key: "ArrowUp" })
    expect(onSelect).toHaveBeenLastCalledWith("c")
  })

  it("calls onActivate with the selected id on Enter", () => {
    const onActivate = vi.fn()
    render(<Menu items={items} onActivate={onActivate} />)
    const menu = screen.getByRole("menu")
    fireEvent.keyDown(menu, { key: "Enter" })
    expect(onActivate).toHaveBeenCalledWith("a")
  })

  it("calls onActivate on click of a non-disabled item", () => {
    const onActivate = vi.fn()
    render(<Menu items={items} onActivate={onActivate} />)
    fireEvent.click(screen.getByText("Charlie"))
    expect(onActivate).toHaveBeenCalledWith("c")
  })

  it("does nothing on click of a disabled item", () => {
    const onActivate = vi.fn()
    render(<Menu items={items} onActivate={onActivate} />)
    fireEvent.click(screen.getByText("Bravo"))
    expect(onActivate).not.toHaveBeenCalled()
  })

  it("respects a controlled selectedId", () => {
    render(<Menu items={items} selectedId="c" onActivate={() => {}} />)
    const charlie = screen.getByText("Charlie").closest('[role="menuitem"]')
    expect(charlie?.getAttribute("data-selected")).toBe("true")
    const alpha = screen.getByText("Alpha").closest('[role="menuitem"]')
    expect(alpha?.getAttribute("data-selected")).toBeNull()
  })

  it("keeps click and keyboard selection in sync (no stale id on Enter after click)", async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    const onSelect = vi.fn()
    render(<Menu items={items} onActivate={onActivate} onSelect={onSelect} />)

    await user.click(screen.getByText("Charlie"))
    expect(onSelect).toHaveBeenCalledWith("c")

    await user.keyboard("{Enter}")

    expect(onActivate.mock.calls).toEqual([["c"], ["c"]])
  })

  it("does not activate a disabled item on Enter with a controlled selectedId", () => {
    const onActivate = vi.fn()
    render(<Menu items={items} selectedId="b" onActivate={onActivate} />)
    const menu = screen.getByRole("menu")
    fireEvent.keyDown(menu, { key: "Enter" })
    expect(onActivate).not.toHaveBeenCalled()
  })
})
