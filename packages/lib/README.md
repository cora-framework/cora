# @cora/lib

Shared utilities for the [CORA framework](https://github.com/cora-framework/cora) - usable standalone in any CyberMP project, no framework required.

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

## Install

```sh
pnpm add @cora/lib
```

## Usage

```ts
import { ok, err, type Result } from "@cora/lib"

function parsePort(raw: string): Result<number, string> {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 65536 ? ok(n) : err(`invalid port: ${raw}`)
}
```

More utilities land here throughout Phase 1 (locales, zones/interactions, shared helpers).
