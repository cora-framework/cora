# @cora-framework/lib

Shared utilities for the [CORA framework](https://github.com/cora-framework/cora) - usable standalone in any CyberMP project, no framework required.

Part of **CORA - Cyber Online Runtime Architecture**, the open-source framework for CyberMP.

## Install

```sh
pnpm add @cora-framework/lib
```

## Usage

### Result - type-safe error handling

A discriminated union for Result types that pairs success and error values.

```ts
import { ok, err, type Result } from "@cora-framework/lib"

function parsePort(raw: string): Result<number, string> {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 65536 ? ok(n) : err(`invalid port: ${raw}`)
}

const result = parsePort("3000")
if (result.ok) {
  console.log(`Port is valid:`, result.value) // result.value is number
} else {
  console.log(`Error:`, result.error) // result.error is string
}
```

### Vec3 - 3D vector math

Pure 3D vector operations for geometry and physics calculations.

```ts
import {
  vec3,
  add,
  sub,
  scale,
  distance,
  distanceSq,
  dot,
  cross,
  length,
  lengthSq,
  normalize,
  lerp,
  equalsApprox,
} from "@cora-framework/lib"

const a = vec3(1, 2, 3)
const b = vec3(4, 5, 6)

const sum = add(a, b)        // { x: 5, y: 7, z: 9 }
const diff = sub(a, b)       // { x: -3, y: -3, z: -3 }
const scaled = scale(a, 2)   // { x: 2, y: 4, z: 6 }

const d = distance(a, b)     // scalar distance between points
const d2 = distanceSq(a, b)  // squared distance (faster, no sqrt)

const dotProd = dot(a, b)    // scalar dot product
const crossed = cross(a, b)  // vector cross product

const len = length(a)        // magnitude of vector
const len2 = lengthSq(a)     // squared magnitude (faster)

const unit = normalize(a)    // unit vector in same direction
const midpoint = lerp(a, b, 0.5) // interpolate between a and b

const equal = equalsApprox(a, b, 1e-6) // fuzzy equality within epsilon
```

All functions are pure (no mutation); zero-vector normalize returns zero vector safely.

### Zones - spatial containment

Define and query 3D spatial regions (spheres, axis-aligned boxes, extruded polygons).

```ts
import {
  vec3,
  sphereZone,
  boxZone,
  polyZone,
  isInside,
  distanceToCenter,
  type Zone,
} from "@cora-framework/lib"

// Sphere: point + radius
const sphere = sphereZone(vec3(0, 0, 0), 10)

// Box: axis-aligned with automatic min/max normalization
const box = boxZone(vec3(0, 0, 0), vec3(10, 10, 10))

// Polygon: 2D footprint extruded vertically
const poly = polyZone(
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 5, y: 10 },
  ],
  0,
  20 // minZ and maxZ
)

const point = vec3(5, 5, 5)
const inZone = isInside(sphere, point)       // true/false
const dist = distanceToCenter(box, point)    // scalar distance to zone center

// Zones use x/y as the ground plane with z as vertical height, matching typical game-world semantics
```

### TypedEmitter - strictly-typed events

A minimal event emitter where each instance owns its listeners (no global singleton).

```ts
import { TypedEmitter } from "@cora-framework/lib"

type GameEvents = {
  playerJoined: [playerId: string]
  playerLeft: [playerId: string]
  scoreChanged: [playerId: string, newScore: number]
}

const gameEmitter = new TypedEmitter<GameEvents>()

// Define handlers as named functions for reuse
const onPlayerJoined = (playerId: string) => {
  console.log(`${playerId} joined`)
}

const onScoreChanged = (playerId: string, newScore: number) => {
  console.log(`${playerId} scored: ${newScore}`)
}

// Subscribe with full type safety
const unsubscribe = gameEmitter.on("playerJoined", onPlayerJoined)

// Fire-once listeners
gameEmitter.once("scoreChanged", onScoreChanged)

// Emit with type checking
gameEmitter.emit("playerJoined", "alice")
gameEmitter.emit("scoreChanged", "alice", 100)

// Unsubscribe
unsubscribe()

// Query listener count
const count = gameEmitter.listenerCount("playerJoined")

// Remove handlers
gameEmitter.off("playerJoined", onPlayerJoined)

// Clear all listeners for an event, or all events
gameEmitter.removeAllListeners("playerJoined")
gameEmitter.removeAllListeners()
```

Event maps must be declared as type aliases (not interfaces) to satisfy the `Record<string, unknown[]>` constraint required by TypedEmitter.

Emit dispatches over a snapshot of listeners taken at call time, so handlers added or removed during dispatch never affect the current emit - only subsequent ones. If a handler throws, other handlers still run; errors are collected and rethrown as a single `AggregateError` once dispatch completes.

### Locale - i18n without external dependencies

Simple string-based locale system with interpolation, no external i18n libraries required.

```ts
import { createLocale, type Locale } from "@cora-framework/lib"

const locale = createLocale({
  locales: {
    en: {
      "greeting": "Hello, {name}!",
      "inventory.full": "Inventory is full",
      "inventory.count": "You have {count} item(s)",
    },
    de: {
      "greeting": "Hallo, {name}!",
      "inventory.full": "Inventar ist voll",
      "inventory.count": "Du hast {count} Gegenstand(e)",
    },
  },
  fallback: "en",
})

// Translate with optional parameter interpolation
locale.t("greeting", { name: "Alice" })      // "Hello, Alice!"
locale.t("inventory.count", { count: 5 })    // "You have 5 item(s)"
locale.t("greeting")                          // "Hello, {name}!"

// Switch locale
const result = locale.setLocale("de")
if (result.ok) {
  locale.t("greeting", { name: "Bob" })      // "Hallo, Bob!"
} else {
  console.log(result.error) // Unknown locale code "xx". Available codes: en, de
}

// Query current locale and check for keys
locale.getLocale()           // "de"
locale.has("greeting")       // true
locale.has("unknown.key")    // false
```

Resolution order: current locale, then fallback locale, then the key itself verbatim (never throws on missing keys). Numbers in params are automatically stringified.
