export const coraTheme: Record<string, string> = {
  "--cora-bg": "#0b0e14",
  "--cora-surface": "#12161f",
  "--cora-text": "#e6e9ef",
  "--cora-muted": "#8b93a7",
  "--cora-accent": "#22d3ee",
  "--cora-accent-2": "#e879f9",
  "--cora-danger": "#f87171",
  "--cora-success": "#4ade80",
  "--cora-warning": "#fbbf24",
  "--cora-radius": "8px",
  "--cora-font": "system-ui, -apple-system, Segoe UI, sans-serif",
}

export function applyTheme(
  el: HTMLElement,
  overrides?: Record<string, string>,
): void {
  const merged = { ...coraTheme, ...overrides }
  for (const [key, value] of Object.entries(merged)) {
    el.style.setProperty(key, value)
  }
}
