import type { JSX } from "react"

/**
 * Default `format` for `MoneyHud`: converts an integer minor-units amount
 * (see `../contract.ts`'s `AccountBalances` - cash/bank/crypto are always
 * integers, e.g. cents, never floats) into a "1,234.56"-style display
 * string. Division only happens here, at the presentation boundary; every
 * other layer of this module keeps amounts as integers to avoid rounding
 * drift on money (see the module README's minor-units note).
 */
function defaultFormat(minor: number): string {
  const negative = minor < 0
  const absMinor = Math.abs(minor)
  const wholePart = Math.trunc(absMinor / 100)
  const fractionPart = String(absMinor % 100).padStart(2, "0")
  const wholeWithSeparators = wholePart
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${negative ? "-" : ""}${wholeWithSeparators}.${fractionPart}`
}

/**
 * Compact, read-only balance HUD for a character's three accounts (see
 * `../contract.ts`'s `AccountBalances`). Deliberately a pure presentational
 * component - no interactions, no internal state, no RPC calls - mirroring
 * how `@cora-framework/inventory`'s `InventoryGrid` separates presentation
 * from the (not-yet-existing) client resource that would fetch/mutate real
 * data. Callers own the balances (from `cora.money.get` or the
 * `cora.money.ui.update` push) and re-render this on change.
 *
 * `crypto` uses the same `format` as `cash`/`bank` by default rather than a
 * distinct one: this module defines no exchange-rate or external-price
 * semantics for `crypto` (see `../contract.ts`'s `AccountKind` docs) - it is
 * just a third cash/bank-shaped integer-minor-units balance, so formatting
 * it identically keeps the HUD honest about that rather than implying a
 * conversion that does not exist. Callers who do attach real-world pricing
 * to `crypto` downstream can still override display uniformly (or per-call,
 * by rendering their own markup) via `format`.
 */
export function MoneyHud({
  cash,
  bank,
  crypto,
  format = defaultFormat,
}: {
  cash: number
  bank: number
  crypto: number
  format?: (minor: number) => string
}): JSX.Element {
  return (
    /* biome-ignore lint/a11y/useSemanticElements: role="group" here names an arbitrary cluster of read-only values, not a set of form controls, so <fieldset> would be the wrong (and misleading) semantic - this follows the WAI-ARIA "Group" pattern for non-form groupings. */
    <div className="cora-money-hud" role="group" aria-label="Money">
      <div className="cora-money-hud-row cora-money-hud-cash">
        <span className="cora-money-hud-label">Cash</span>
        <output
          className="cora-money-hud-value"
          aria-label={`Cash: ${format(cash)}`}
        >
          {format(cash)}
        </output>
      </div>
      <div className="cora-money-hud-row cora-money-hud-bank">
        <span className="cora-money-hud-label">Bank</span>
        <output
          className="cora-money-hud-value"
          aria-label={`Bank: ${format(bank)}`}
        >
          {format(bank)}
        </output>
      </div>
      <div className="cora-money-hud-row cora-money-hud-crypto">
        <span className="cora-money-hud-label">Crypto</span>
        <output
          className="cora-money-hud-value"
          aria-label={`Crypto: ${format(crypto)}`}
        >
          {format(crypto)}
        </output>
      </div>
    </div>
  )
}
