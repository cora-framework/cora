import { beforeEach, describe, expect, it } from "vitest"
import { createLocale, type Locale, type LocaleDict } from "./locale"

describe("Locale system", () => {
  let locale: Locale

  beforeEach(() => {
    const locales: Record<string, LocaleDict> = {
      en: {
        "inventory.full": "Inventory is full",
        greeting: "Hello, {name}!",
        count: "You have {count} items",
        multiple: "Player {player} with {item}",
        repeated: "{name} says {name}",
      },
      de: {
        "inventory.full": "Inventar ist voll",
        greeting: "Hallo, {name}!",
      },
    }

    locale = createLocale({ locales, fallback: "en" })
  })

  it("should look up key in current locale", () => {
    expect(locale.t("inventory.full")).toBe("Inventory is full")
  })

  it("should fall back to fallback locale when key not in current", () => {
    locale.setLocale("de")
    expect(locale.t("greeting")).toBe("Hallo, {name}!")
  })

  it("should return key verbatim when not found in current or fallback", () => {
    expect(locale.t("unknown.key")).toBe("unknown.key")
  })

  it("should interpolate single placeholder", () => {
    expect(locale.t("greeting", { name: "Alice" })).toBe("Hello, Alice!")
  })

  it("should interpolate multiple different placeholders", () => {
    expect(locale.t("multiple", { player: "Bob", item: "sword" })).toBe(
      "Player Bob with sword",
    )
  })

  it("should handle repeated placeholders", () => {
    expect(locale.t("repeated", { name: "Charlie" })).toBe(
      "Charlie says Charlie",
    )
  })

  it("should stringify numeric parameters", () => {
    expect(locale.t("count", { count: 42 })).toBe("You have 42 items")
  })

  it("should leave unknown placeholders as-is", () => {
    expect(locale.t("greeting", { name: "Dave", unknown: "value" })).toBe(
      "Hello, Dave!",
    )
    expect(locale.t("count", { count: 5, missing: "param" })).toBe(
      "You have 5 items",
    )
  })

  it("should leave unresolved placeholders in string", () => {
    expect(locale.t("greeting")).toBe("Hello, {name}!")
    expect(locale.t("count")).toBe("You have {count} items")
  })

  it("should change locale with setLocale", () => {
    expect(locale.t("inventory.full")).toBe("Inventory is full")
    const result = locale.setLocale("de")
    expect(result.ok).toBe(true)
    expect(locale.t("inventory.full")).toBe("Inventar ist voll")
  })

  it("should return error for unknown locale code", () => {
    const result = locale.setLocale("fr")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("en")
      expect(result.error).toContain("de")
    }
  })

  it("should return current locale with getLocale", () => {
    expect(locale.getLocale()).toBe("en")
    locale.setLocale("de")
    expect(locale.getLocale()).toBe("de")
  })

  it("should check key existence with has() in current locale", () => {
    expect(locale.has("inventory.full")).toBe(true)
    expect(locale.has("unknown.key")).toBe(false)
    locale.setLocale("de")
    expect(locale.has("greeting")).toBe(true)
  })

  it("should fall back to fallback locale for has()", () => {
    locale.setLocale("de")
    expect(locale.has("count")).toBe(true)
  })

  it("should throw TypeError if fallback code missing from locales", () => {
    expect(() => {
      createLocale({
        locales: { en: { key: "value" } },
        fallback: "de",
      })
    }).toThrow(TypeError)
  })

  it("should handle empty params object", () => {
    expect(locale.t("greeting", {})).toBe("Hello, {name}!")
  })

  it("should not interpolate prototype-inherited keys like {constructor}", () => {
    const locales = {
      test: {
        pattern: "{constructor}",
      },
    }
    const testLocale = createLocale({
      locales,
      fallback: "test",
    })
    expect(testLocale.t("pattern", { name: "Alice" })).toBe("{constructor}")
  })

  it("should return false from has() for prototype-inherited keys like toString", () => {
    expect(locale.has("toString")).toBe(false)
  })

  it("should handle complex interpolation patterns", () => {
    const locales = {
      test: {
        pattern: "{a} {b} {a} {c}",
      },
    }
    const testLocale = createLocale({
      locales,
      fallback: "test",
    })
    expect(testLocale.t("pattern", { a: "A", b: "B", c: "C" })).toBe("A B A C")
  })
})
