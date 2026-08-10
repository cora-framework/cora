import type { JSX, ReactNode } from "react"
import { useEffect } from "react"

export function Dialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element | null {
  useEffect(() => {
    if (!open) {
      return
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onCancel()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onCancel])

  if (!open) {
    return null
  }

  return (
    <div className="cora-dialog-overlay">
      <div
        className="cora-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="cora-dialog-title">{title}</h2>
        <div className="cora-dialog-body">{children}</div>
        <div className="cora-dialog-actions">
          <button
            type="button"
            className="cora-dialog-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="cora-dialog-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
