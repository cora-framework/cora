---
title: Philosophy
description: Why CORA exists and what it refuses to repeat.
---

Frameworks of the FiveM era grew organically on untyped Lua events. The result is familiar to every server owner: silent event-name typos, version chaos between core and modules, SQL files applied by hand, and 3 a.m. crashes that a compiler would have caught.

CyberMP is TypeScript-native with schema-driven RPC. CORA is built on one bet: **use that fully**.

## Principles

1. **The compiler is a maintainer.** Every boundary - UI to client, client to server, server to database - is a typed contract. Breaking changes surface at build time.
2. **Modules are packages.** Semver, changelogs, dependency graphs. Updating is `pnpm up`, not folder surgery.
3. **Fail small.** A crashing module is disabled and logged; it never takes the server with it.
4. **Standalone first.** Our db/lib/ui packages serve any CyberMP project. Adopt the whole framework only when it earns it.
5. **Open by default.** MIT license, public RFCs, decisions with written reasoning.

## Status

CyberMP itself is pre-release. CORA develops against the public [CyberMP repos](https://github.com/Cyber-MP) - browser-tested UIs, headless-tested server logic - so that 1.0 lands the day the game does.

CORA is an independent community project, not affiliated with the CyberMP team or CD PROJEKT RED.
