import { describe, expect, it } from "vitest"
import { defineModule } from "./define-module.js"

describe("defineModule", () => {
  it("returns the module definition unchanged for a valid kebab-case id", () => {
    const module = defineModule({ id: "my-module", register() {} })

    expect(module.id).toBe("my-module")
  })

  it("accepts a single-word id", () => {
    const module = defineModule({ id: "characters", register() {} })

    expect(module.id).toBe("characters")
  })

  it("throws for an id with uppercase letters", () => {
    expect(() => defineModule({ id: "MyModule", register() {} })).toThrow(
      /kebab-case/,
    )
  })

  it("throws for an id with underscores", () => {
    expect(() => defineModule({ id: "my_module", register() {} })).toThrow(
      /kebab-case/,
    )
  })

  it("throws for an id with a leading hyphen", () => {
    expect(() => defineModule({ id: "-my-module", register() {} })).toThrow(
      /kebab-case/,
    )
  })

  it("throws for an id with a trailing hyphen", () => {
    expect(() => defineModule({ id: "my-module-", register() {} })).toThrow(
      /kebab-case/,
    )
  })

  it("throws for an empty id", () => {
    expect(() => defineModule({ id: "", register() {} })).toThrow(/kebab-case/)
  })

  it('throws for the reserved id "core"', () => {
    expect(() => defineModule({ id: "core", register() {} })).toThrow(
      /reserved/,
    )
  })
})
