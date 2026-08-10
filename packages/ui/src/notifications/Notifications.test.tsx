// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CoraNotification } from "./Notifications"
import { Notifications } from "./Notifications"

afterEach(() => {
  cleanup()
})

describe("Notifications", () => {
  it("renders titles and messages", () => {
    const items: CoraNotification[] = [
      {
        id: "1",
        kind: "info",
        title: "Saved",
        message: "Your changes were saved.",
      },
      { id: "2", kind: "error", title: "Failed" },
    ]
    render(<Notifications items={items} onDismiss={() => {}} />)

    expect(screen.getByText("Saved")).toBeTruthy()
    expect(screen.getByText("Your changes were saved.")).toBeTruthy()
    expect(screen.getByText("Failed")).toBeTruthy()
  })

  it("has a status region with aria-live polite", () => {
    render(<Notifications items={[]} onDismiss={() => {}} />)
    const region = screen.getByRole("status")
    expect(region.getAttribute("aria-live")).toBe("polite")
  })

  it("calls onDismiss with the right id when the dismiss button is clicked", () => {
    const onDismiss = vi.fn()
    const items: CoraNotification[] = [
      { id: "1", kind: "info", title: "Saved" },
      { id: "2", kind: "error", title: "Failed" },
    ]
    render(<Notifications items={items} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByLabelText("Dismiss Failed"))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith("2")
  })

  describe("auto-dismiss", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("auto-dismisses after the default duration (5000ms)", () => {
      const onDismiss = vi.fn()
      const items: CoraNotification[] = [
        { id: "1", kind: "info", title: "Saved" },
      ]
      render(<Notifications items={items} onDismiss={onDismiss} />)

      expect(onDismiss).not.toHaveBeenCalled()
      vi.advanceTimersByTime(4999)
      expect(onDismiss).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onDismiss).toHaveBeenCalledWith("1")
    })

    it("respects a custom durationMs", () => {
      const onDismiss = vi.fn()
      const items: CoraNotification[] = [
        { id: "1", kind: "info", title: "Quick", durationMs: 1000 },
      ]
      render(<Notifications items={items} onDismiss={onDismiss} />)

      vi.advanceTimersByTime(999)
      expect(onDismiss).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onDismiss).toHaveBeenCalledWith("1")
    })
  })
})
