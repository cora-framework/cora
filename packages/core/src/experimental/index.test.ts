import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createMapPin,
  ExperimentalUnverifiedError,
  grantNativeItem,
  NotImplementedError,
  openAppearanceEditor,
  removeMapPin,
  setHudElementVisible,
  setNameplateText,
} from "./index.js"

const ENV_KEY = "CORA_EXPERIMENTAL"

describe("experimental fence", () => {
  const originalValue = process.env[ENV_KEY]

  beforeEach(() => {
    delete process.env[ENV_KEY]
  })

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY]
    } else {
      process.env[ENV_KEY] = originalValue
    }
  })

  const calls: Array<[string, () => void]> = [
    ["setNameplateText", () => setNameplateText(1, "hi")],
    ["createMapPin", () => createMapPin("pin-1", { x: 0, y: 0, z: 0 })],
    ["removeMapPin", () => removeMapPin("pin-1")],
    ["setHudElementVisible", () => setHudElementVisible("healthbar", false)],
    ["grantNativeItem", () => grantNativeItem(1, "Items.Cyberdeck")],
    ["openAppearanceEditor", () => openAppearanceEditor(1)],
  ]

  it.each(calls)(
    "%s throws ExperimentalUnverifiedError when CORA_EXPERIMENTAL is unset",
    (_name, call) => {
      expect(call).toThrow(ExperimentalUnverifiedError)
    },
  )

  it.each(calls)(
    "%s throws NotImplementedError when CORA_EXPERIMENTAL=1",
    (_name, call) => {
      process.env[ENV_KEY] = "1"
      expect(call).toThrow(NotImplementedError)
    },
  )

  it("does not treat other truthy env values as enabled", () => {
    process.env[ENV_KEY] = "true"
    expect(() => setNameplateText(1, "hi")).toThrow(ExperimentalUnverifiedError)
  })

  it("error messages name the offending feature", () => {
    expect(() => removeMapPin("pin-1")).toThrow(/removeMapPin/)
  })
})
