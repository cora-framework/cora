import type { JSX } from "react"

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

export function ProgressBar({
  value,
  max = 100,
  label,
}: {
  value: number
  max?: number
  label?: string
}): JSX.Element {
  const clamped = clamp(value, 0, max)
  const percentage = max > 0 ? (clamped / max) * 100 : 0

  return (
    <div className="cora-progress">
      {label !== undefined ? (
        <div className="cora-progress-label">{label}</div>
      ) : null}
      <div
        className="cora-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
      >
        <div
          className="cora-progress-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
