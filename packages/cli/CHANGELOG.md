# @cora-framework/cli

## 0.1.0

### Minor Changes

- 9a79d79: Initial release of @cora-framework/cli - command-line tools for the CORA framework. Provides `cora doctor` to verify the development environment (Node.js >= 22, pnpm >= 9) and `cora migrate` to run database migrations from an ESM configuration file. Both commands are testable headless via pure functions with injected IO. Usable standalone for managing database migrations and environment verification in any CyberMP project.

### Patch Changes

- Updated dependencies [8372c8f]
- Updated dependencies [3c82165]
  - @cora-framework/db@0.1.0
  - @cora-framework/lib@0.1.0
