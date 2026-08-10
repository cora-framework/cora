import type { JSX } from "react"
import { useEffect } from "react"

export type NotificationKind = "info" | "success" | "warning" | "error"

export interface CoraNotification {
  id: string
  kind: NotificationKind
  title: string
  message?: string
  durationMs?: number
}

const DEFAULT_DURATION_MS = 5000

function NotificationItem({
  item,
  onDismiss,
}: {
  item: CoraNotification
  onDismiss: (id: string) => void
}): JSX.Element {
  const { id, kind, title, message, durationMs = DEFAULT_DURATION_MS } = item

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id)
    }, durationMs)
    return () => {
      clearTimeout(timer)
    }
  }, [id, durationMs, onDismiss])

  return (
    <div className={`cora-notification cora-notification--${kind}`}>
      <div className="cora-notification__body">
        <span className="cora-notification__title">{title}</span>
        {message !== undefined ? (
          <span className="cora-notification__message">{message}</span>
        ) : null}
      </div>
      <button
        type="button"
        className="cora-notification__dismiss"
        aria-label={`Dismiss ${title}`}
        onClick={() => onDismiss(id)}
      >
        &times;
      </button>
    </div>
  )
}

export function Notifications({
  items,
  onDismiss,
}: {
  items: CoraNotification[]
  onDismiss: (id: string) => void
}): JSX.Element {
  return (
    <div className="cora-notifications" role="status" aria-live="polite">
      {items.map((item) => (
        <NotificationItem key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
