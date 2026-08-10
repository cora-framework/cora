// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Dialog } from "./Dialog"

afterEach(() => {
  cleanup()
})

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Dialog
        open={false}
        title="Confirm"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders a dialog with role and aria attributes when open", () => {
    render(
      <Dialog
        open
        title="Delete item"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(dialog.getAttribute("aria-label")).toBe("Delete item")
    expect(screen.getByText("Delete item")).toBeTruthy()
  })

  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn()
    render(
      <Dialog
        open
        title="Delete item"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("does not call onCancel on Escape once closed", () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <Dialog
        open
        title="Delete item"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )
    rerender(
      <Dialog
        open={false}
        title="Delete item"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("calls onConfirm and onCancel from the buttons", () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <Dialog
        open
        title="Delete item"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByText("Confirm"))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText("Cancel"))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("supports custom confirm and cancel labels", () => {
    render(
      <Dialog
        open
        title="Delete item"
        confirmLabel="Yes, delete"
        cancelLabel="No, keep it"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByText("Yes, delete")).toBeTruthy()
    expect(screen.getByText("No, keep it")).toBeTruthy()
  })

  it("renders children in the body", () => {
    render(
      <Dialog open title="Delete item" onConfirm={() => {}} onCancel={() => {}}>
        <p>Are you sure?</p>
      </Dialog>,
    )
    expect(screen.getByText("Are you sure?")).toBeTruthy()
  })
})
