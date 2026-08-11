# RFC 0002: Kernel Services

- Status: accepted
- Author(s): CORA core team
- Date: 2026-08-11

## Summary

The kernel exposes a typed, lazily-resolved service registry (`ctx.services`) that lets one module publish an implementation for a well-known contract and any other module consume it, without either importing the other. Services are identified by `ServiceToken<T>`, created with `defineServiceToken`, and namespaced by convention as `cora.<module>.<service>`. This RFC also publishes the first core-standard token, `activeCharacterProviderToken`, which lets character-bound modules ask "is this player currently playing this character?" against the live characters module without depending on it.

## Motivation

CORA modules must not import each other: `@cora-framework/inventory` cannot import `@cora-framework/characters`, and vice versa, so that either can be published, versioned, and used independently, and so a broken module cannot drag another module's internals down with it (RFC 0001). That constraint is easy to keep when modules are self-contained, but real roleplay servers need modules to integrate. A concrete example: an inventory-like module needs to know whether a given character is the one a given player currently has selected, but that fact lives inside a characters-like module's live session state, and there is no shared reference between the two modules' `register()` calls to pass it through by hand.

Before this RFC, a module in that position had exactly two options: take the answer as a constructor-time callback that the server owner wires up manually (workable, but it pushes cross-module plumbing onto every server owner and silently does the wrong thing - allow everything - if they forget), or reach for a direct import (which breaks the decoupling the whole module system depends on). Neither scales to a third, fourth, or fifth module that all need the same fact. What was missing was a place, owned by the kernel rather than by any one module, where a module can publish "here is my answer to this well-known question" and another module can ask for it later, with core defining the shape of the question so that neither the publisher nor the consumer needs to know about the other's package.

## Design

### `ServiceToken<T>` and `defineServiceToken`

A service token is a typed handle for a single service, carrying a phantom type so `T` is checked at `provide`/`get` call sites instead of erased:

```ts
export interface ServiceToken<T> {
  readonly name: string
  readonly _type?: T
}

export function defineServiceToken<T>(name: string): ServiceToken<T> {
  return { name }
}
```

`_type` never holds a real value - it exists purely for TypeScript's inference, not at runtime. The registry keys registrations on `name`, not on token identity, so two tokens created with the same `name` (for example by two independent `defineServiceToken` calls) are the same service as far as the registry is concerned.

### `ServiceRegistry`

```ts
import type { ServiceToken } from "@cora-framework/core"

export interface ServiceRegistry {
  provide<T>(token: ServiceToken<T>, impl: T): void
  get<T>(token: ServiceToken<T>): T | undefined
}
```

`provide` registers an implementation for a token; `get` looks one up, returning `undefined` if nothing has been provided yet. `createServiceRegistry()` builds one backed by a single `Map<string, unknown>` - the map itself is untyped, and `ServiceToken<T>` is the only place the type contract lives, trusted back into `T` at the single documented cast inside `get`.

The kernel creates exactly one `ServiceRegistry` at boot and hands the same instance to every module as `ctx.services`. Its lifetime is the kernel's lifetime: it is not cleared by `shutdown()`, because a shut-down kernel is not reused (a fresh process creates a fresh registry).

`provide` throws if a service is already registered under the same token name:

```ts
import { createServiceRegistry, defineServiceToken } from "@cora-framework/core"

const registry = createServiceRegistry()
const greetingToken = defineServiceToken<() => string>("cora.greeter.greeting")

registry.provide(greetingToken, () => "hello")
registry.get(greetingToken)?.() // "hello"

registry.provide(greetingToken, () => "hi") // throws: already registered
```

### Lazy, use-time resolution

The registry is meant to be consulted lazily, inside a handler or hook body at call time, not eagerly during `register()`. This is the design's crux: because modules run their `register()` in whatever order they were listed in `createKernel({ modules })`, a consumer module's `register()` may run before a provider module's `register()`. If `get` were only ever meaningful at registration time, module authors would need to sequence their module lists correctly, which is exactly the kind of cross-module coupling this feature exists to avoid. Instead, a module calls `ctx.services.get(token)` from inside the function that runs later - an RPC handler, a hook callback - by which point every module's `register()` has already completed. `get` before the provider has registered returns `undefined`; the same `get` called after both modules have registered succeeds, regardless of which module was listed first:

```ts
import {
  defineModule,
  defineServiceToken,
  type CoraModuleContext,
} from "@cora-framework/core"

const greetingToken = defineServiceToken<() => string>("cora.greeter.greeting")

const providerModule = defineModule({
  id: "greeter",
  register(ctx: CoraModuleContext) {
    ctx.services.provide(greetingToken, () => "hello")
  },
})

const consumerModule = defineModule({
  id: "welcomer",
  register(ctx: CoraModuleContext) {
    ctx.platform.registerRpcHandler("cora.welcomer.greet", async () => {
      // Resolved lazily, at call time - not during register(). By the time
      // this handler runs, every module's register() has already completed,
      // so registration order between "greeter" and "welcomer" in the
      // modules list passed to createKernel does not matter.
      const greeting = ctx.services.get(greetingToken)
      return greeting ? greeting() : "hello, stranger"
    })
  },
})
```

### Naming convention

Token names are namespaced the same way RPC handler names and permission strings are (RFC 0001): `cora.<module>.<service>`, where `<module>` is the id of the module that owns the contract - typically the module that provides the implementation, since it is the one whose internal state the service exposes. This keeps token names collision-free across independently published modules without the kernel needing to enforce a naming scheme at the type level.

### Worked example: `activeCharacterProviderToken`

The first core-standard token published under this scheme answers the concrete case that motivated this RFC: a character-bound module needs to know whether a player currently has a given character active, without importing the module that owns character sessions.

```ts
import { defineServiceToken, type ServiceToken } from "@cora-framework/core"

export interface ActiveCharacterProvider {
  isActiveCharacter(
    playerId: number,
    characterId: number,
  ): boolean | Promise<boolean>
  getActiveCharacterId(playerId: number): number | null
}

export const activeCharacterProviderToken: ServiceToken<ActiveCharacterProvider> =
  defineServiceToken<ActiveCharacterProvider>("cora.characters.activeCharacter")
```

`ActiveCharacterProvider` and `activeCharacterProviderToken` are defined in `@cora-framework/core`, not in a characters-owning module - this is the detail that preserves decoupling. A characters-owning module provides the token, wrapping its own live session state; any character-bound module (an inventory-like module, a money-like module) consumes the token. Both sides depend only on core, which every module already depends on, never on each other:

```ts
import {
  activeCharacterProviderToken,
  type CoraModuleContext,
} from "@cora-framework/core"

// In the characters-owning module's register():
function provideActiveCharacter(ctx: CoraModuleContext) {
  ctx.services.provide(activeCharacterProviderToken, {
    isActiveCharacter: (playerId: number, characterId: number) => {
      return playerId === characterId // stand-in for real session lookup
    },
    getActiveCharacterId: (playerId: number) => playerId, // stand-in
  })
}

// In a character-bound module's RPC handler, called later:
async function checkActiveCharacter(
  ctx: CoraModuleContext,
  playerId: number,
  characterId: number,
) {
  const provider = ctx.services.get(activeCharacterProviderToken)
  if (!provider) {
    return false // characters-owning module not present; caller decides the fallback
  }
  return provider.isActiveCharacter(playerId, characterId)
}
```

If the characters-owning module is not part of a given deployment - a server owner running the character-bound module standalone, for instance - `get` simply returns `undefined`, and the consuming module is responsible for deciding what that means for it (typically a documented, explicitly unsafe fallback rather than a silent one).

## Drawbacks & alternatives

**A full DI container was considered and rejected**, in the same spirit as RFC 0001's rejection of a DI container for module wiring itself. A container (in the shape of InversifyJS, as used by prior CyberMP roleplay codebases) buys automatic constructor injection and lifecycle management CORA does not need: modules do not depend on each other's internals, only on a small number of well-known, deliberately narrow contracts published through core. A container's decorator-driven wiring is harder to headlessly test and asks more of module authors than `register(ctx)` currently does. The registry described here is a typed map with two methods; it keeps the entire cross-module integration surface auditable in one file.

**Direct cross-module import** (a character-bound module importing a characters-owning module directly) was rejected for the same reason RFC 0001 forbids it generally: it couples publishable, independently-versioned packages together, and lets one module's bug or breaking change ripple into another's build.

**A return value from the provider's factory function** (the provider module returning its implementation from `register()` for the server owner to thread through by hand) was considered and rejected: it only works if the code that wires up the module list holds both references and passes one into the other's options, which does not scale past two or three modules and reintroduces exactly the manual-wiring burden this RFC removes. The registry lets any module resolve a token without a reference to the provider module at all.

## Unresolved questions

- **Service versioning.** A token name currently carries no version information; if a service's contract needs a breaking change, there is no established convention yet for introducing `cora.characters.activeCharacter.v2` alongside the original versus retiring the old name outright. This is deferred until a real breaking change to a published token forces the question.
- **Competing providers of the same token.** Today, a second `provide` call for a token that is already registered throws synchronously at boot, deterministically disabling the second module (per RFC 0001's error boundary) rather than silently overwriting the first provider or silently ignoring the second. Whether a future release should offer an explicit override mechanism, or keep the current double-provide-throws behavior as permanent, is open.
