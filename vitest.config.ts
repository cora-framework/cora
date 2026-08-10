import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/template/**"],
    passWithNoTests: true,
  },
})
