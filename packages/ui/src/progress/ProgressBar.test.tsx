// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ProgressBar } from "./ProgressBar"

afterEach(() => {
  cleanup()
})

describe("ProgressBar", () => {
  it("renders a progressbar role with aria values", () => {
    render(<ProgressBar value={40} />)
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-valuemin")).toBe("0")
    expect(bar.getAttribute("aria-valuemax")).toBe("100")
    expect(bar.getAttribute("aria-valuenow")).toBe("40")
  })

  it("respects a custom max", () => {
    render(<ProgressBar value={5} max={10} />)
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-valuemax")).toBe("10")
    expect(bar.getAttribute("aria-valuenow")).toBe("5")
  })

  it("clamps values above max", () => {
    render(<ProgressBar value={150} max={100} />)
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-valuenow")).toBe("100")
  })

  it("clamps values below 0", () => {
    render(<ProgressBar value={-10} />)
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-valuenow")).toBe("0")
  })

  it("renders an optional visible label", () => {
    render(<ProgressBar value={20} label="Uploading" />)
    expect(screen.getByText("Uploading")).toBeTruthy()
  })

  it("does not render a label element when omitted", () => {
    const { container } = render(<ProgressBar value={20} />)
    expect(container.querySelector(".cora-progress-label")).toBeNull()
  })
})
