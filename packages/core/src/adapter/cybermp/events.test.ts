import { describe, expect, it, vi } from "vitest"
import { createDamageKillerIdAnomalyLogger } from "./events.js"

/**
 * Coverage for the damage `killerId` anomaly guard: the no-attacker sentinel
 * for damage is undocumented upstream; values are forwarded unchanged and
 * anomalies logged. Upstream's `DamageEventData.killerId` has no documented
 * "no attacker" sentinel, so CORA logs a warning (deduplicated per distinct
 * anomalous value) instead of guessing at one. This exercises the pure,
 * `MpServer`-free factory directly rather than going through
 * `bindNativeEvents`, which needs a live-shaped native `mp` global to
 * construct.
 */
describe("createDamageKillerIdAnomalyLogger", () => {
  it("does not log for a normal killerId distinct from the target", () => {
    const warnings: string[] = []
    const warnDamageKillerIdAnomaly = createDamageKillerIdAnomalyLogger(
      (message) => warnings.push(message),
    )

    warnDamageKillerIdAnomaly(7, 3)

    expect(warnings).toEqual([])
  })

  it("logs once when killerId equals targetId (self/no-attacker signal)", () => {
    const warnings: string[] = []
    const warnDamageKillerIdAnomaly = createDamageKillerIdAnomalyLogger(
      (message) => warnings.push(message),
    )

    warnDamageKillerIdAnomaly(5, 5)

    expect(warnings).toEqual([
      "unexpected damage killerId value 5 (no-attacker sentinel unknown upstream); please report",
    ])
  })

  it("logs once when killerId is negative", () => {
    const warnings: string[] = []
    const warnDamageKillerIdAnomaly = createDamageKillerIdAnomalyLogger(
      (message) => warnings.push(message),
    )

    warnDamageKillerIdAnomaly(-1, 9)

    expect(warnings).toEqual([
      "unexpected damage killerId value -1 (no-attacker sentinel unknown upstream); please report",
    ])
  })

  it("dedupes: two identical anomalous events produce exactly one log", () => {
    const warnings: string[] = []
    const warnDamageKillerIdAnomaly = createDamageKillerIdAnomalyLogger(
      (message) => warnings.push(message),
    )

    warnDamageKillerIdAnomaly(5, 5)
    warnDamageKillerIdAnomaly(5, 5)
    warnDamageKillerIdAnomaly(5, 12)

    expect(warnings).toHaveLength(1)
  })

  it("logs separately for each distinct anomalous value", () => {
    const warnings: string[] = []
    const warnDamageKillerIdAnomaly = createDamageKillerIdAnomalyLogger(
      (message) => warnings.push(message),
    )

    warnDamageKillerIdAnomaly(5, 5)
    warnDamageKillerIdAnomaly(-2, 8)

    expect(warnings).toHaveLength(2)
  })

  it("uses the default console.warn-based logger when none is injected", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    try {
      const warnDamageKillerIdAnomaly = createDamageKillerIdAnomalyLogger()

      warnDamageKillerIdAnomaly(4, 4)

      expect(warnSpy).toHaveBeenCalledWith(
        "[warn] unexpected damage killerId value 4 (no-attacker sentinel unknown upstream); please report",
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})
