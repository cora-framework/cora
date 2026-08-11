# @cora-framework/ui

React component kit for the [CORA framework](https://github.com/cora-framework/cora) - usable standalone in any React project, no framework required.

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP. Provides production-ready components and theme tokens for building CEF UIs.

## Install

```sh
pnpm add @cora-framework/ui react
```

## Theme

CSS custom properties are defined in `@cora-framework/ui/theme.css`. Import it in your application:

```ts
import "@cora-framework/ui/theme.css"
```

All components use the `--cora-*` token namespace. Available tokens:

- `--cora-bg` - background color
- `--cora-surface` - surface/panel color
- `--cora-text` - text color
- `--cora-muted` - muted text color
- `--cora-accent` - primary accent color
- `--cora-accent-2` - secondary accent color
- `--cora-danger` - error/danger color
- `--cora-success` - success color
- `--cora-warning` - warning color
- `--cora-radius` - border radius
- `--cora-font` - font family

Override tokens programmatically with `applyTheme()`:

```ts
import { applyTheme, coraTheme } from "@cora-framework/ui"

const overrides = {
  "--cora-accent": "#ff00ff",
  "--cora-bg": "#1a1a1a",
}

// Apply to root element or any container
applyTheme(document.documentElement, overrides)
```

## Components

### Notifications

Display dismissible notifications with auto-timeout. Keep the `onDismiss` callback stable with `useCallback` - the timer depends on it.

```tsx
import { Notifications, type CoraNotification } from "@cora-framework/ui"
import { useCallback, useState } from "react"

export function MyNotifications() {
  const [items, setItems] = useState<CoraNotification[]>([])

  const handleDismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const showNotification = () => {
    setItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        kind: "info",
        title: "Operation complete",
        message: "Your file has been saved.",
        durationMs: 5000, // optional, defaults to 5000ms
      },
    ])
  }

  return (
    <>
      <button onClick={showNotification}>Show Notification</button>
      <Notifications items={items} onDismiss={handleDismiss} />
    </>
  )
}
```

### Menu

Interactive menu with keyboard navigation. Supports controlled (via `selectedId`) or uncontrolled selection.

```tsx
import { Menu, type MenuItem } from "@cora-framework/ui"
import { useState } from "react"

export function MyMenu() {
  const [selected, setSelected] = useState<string | undefined>()

  const items: MenuItem[] = [
    { id: "open", label: "Open", hint: "Ctrl+O" },
    { id: "save", label: "Save", hint: "Ctrl+S" },
    { id: "export", label: "Export", disabled: true },
  ]

  return (
    <Menu
      title="File"
      items={items}
      selectedId={selected}
      onSelect={setSelected}
      onActivate={(id) => console.log("Activated:", id)}
    />
  )
}
```

### Dialog

Modal dialog with confirm/cancel actions. Press Escape to cancel.

```tsx
import { Dialog } from "@cora-framework/ui"
import { useState } from "react"

export function MyDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>Delete File</button>
      <Dialog
        open={open}
        title="Confirm deletion"
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={() => {
          console.log("Confirmed")
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      >
        This action cannot be undone.
      </Dialog>
    </>
  )
}
```

### ProgressBar

Linear progress indicator with optional label. Value is clamped between 0 and `max`.

```tsx
import { ProgressBar } from "@cora-framework/ui"
import { useState } from "react"

export function MyProgress() {
  const [progress, setProgress] = useState(0)

  return (
    <>
      <ProgressBar
        value={progress}
        max={100}
        label="Download progress"
      />
      <button onClick={() => setProgress((p) => Math.min(p + 10, 100))}>
        Increment
      </button>
    </>
  )
}
```

## Development

Start the dev harness to test components locally:

```sh
pnpm --filter harness dev
```

The harness runs at `http://localhost:5173` and hot-reloads as you edit components.

## Type Safety

All components export TypeScript types. Import types for better IDE support:

```ts
import type { CoraNotification, MenuItem } from "@cora-framework/ui"
```
