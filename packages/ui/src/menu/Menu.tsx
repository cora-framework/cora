import type { JSX, KeyboardEvent } from "react"
import { useState } from "react"

export interface MenuItem {
  id: string
  label: string
  disabled?: boolean
  hint?: string
}

function firstEnabledId(items: MenuItem[]): string | undefined {
  return items.find((item) => !item.disabled)?.id
}

function nextEnabledId(
  items: MenuItem[],
  currentId: string | undefined,
  direction: 1 | -1,
): string | undefined {
  const enabled = items.filter((item) => !item.disabled)
  if (enabled.length === 0) {
    return undefined
  }
  const currentIndex = enabled.findIndex((item) => item.id === currentId)
  if (currentIndex === -1) {
    return direction === 1 ? enabled[0]?.id : enabled[enabled.length - 1]?.id
  }
  const nextIndex = (currentIndex + direction + enabled.length) % enabled.length
  return enabled[nextIndex]?.id
}

export function Menu({
  title,
  items,
  selectedId,
  onSelect,
  onActivate,
}: {
  title?: string
  items: MenuItem[]
  selectedId?: string
  onSelect?: (id: string) => void
  onActivate: (id: string) => void
}): JSX.Element {
  const [internalSelectedId, setInternalSelectedId] = useState<
    string | undefined
  >(() => firstEnabledId(items))

  const isControlled = selectedId !== undefined
  const currentSelectedId = isControlled ? selectedId : internalSelectedId

  function moveSelection(direction: 1 | -1): void {
    const nextId = nextEnabledId(items, currentSelectedId, direction)
    if (nextId === undefined) {
      return
    }
    if (!isControlled) {
      setInternalSelectedId(nextId)
    }
    onSelect?.(nextId)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveSelection(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      moveSelection(-1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (currentSelectedId !== undefined) {
        onActivate(currentSelectedId)
      }
    }
  }

  function handleItemClick(item: MenuItem): void {
    if (item.disabled) {
      return
    }
    onActivate(item.id)
  }

  return (
    <div
      className="cora-menu"
      role="menu"
      aria-label={title}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {title !== undefined ? (
        <div className="cora-menu-title">{title}</div>
      ) : null}
      {items.map((item) => {
        const isSelected = item.id === currentSelectedId
        return (
          <div
            key={item.id}
            role="menuitem"
            aria-disabled={item.disabled === true ? "true" : undefined}
            data-selected={isSelected ? "true" : undefined}
            className={
              isSelected
                ? "cora-menu-item cora-menu-item-selected"
                : "cora-menu-item"
            }
            tabIndex={-1}
            onClick={() => handleItemClick(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                handleItemClick(item)
              }
            }}
          >
            <span className="cora-menu-item-label">{item.label}</span>
            {item.hint !== undefined ? (
              <span className="cora-menu-item-hint">{item.hint}</span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
