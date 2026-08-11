# @cora-framework/core

## 0.2.1

### Patch Changes

- 5d52b29: Guard the CyberMP adapter's `damage` event mapping against an unverified "no attacker" `killerId` sentinel: log a deduplicated warning when `killerId` equals the target's id or is negative, instead of silently forwarding a possibly-wrong value with no visibility. The mapping still forwards `killerId` unchanged; no throw is introduced. RFC 0001 and the README now note that `onDamage`'s no-attacker representation is unverified against a live server, unlike `onPlayerDeath`'s reliable `null` semantics.

## 0.2.0

### Minor Changes

- a0a9db4: Initial release of @cora-framework/core - the CORA kernel. Boots a list of typed modules against a platform-agnostic adapter (`CoraPlatform`), with per-module error boundaries (a module whose `register()` throws is disabled and logged, and everything it registered so far is rolled back, while the rest of the server keeps running), five stable lifecycle hooks (`onPlayerConnected`, `onPlayerDisconnected`, `onPlayerDeath`, `onDamage`, `onResourceStop`), `defineModule` for declaring modules, a zod-backed config system (`defineConfig`/`loadConfig`), and a role-based permissions facade with subtree-wildcard matching (`cora.admin.*`) backed by `@cora-framework/db`. Ships `createTestPlatform` for fully headless testing with no game process required. The module API this package implements is published as RFC 0001 (`docs/rfcs/0001-module-api.md`).
