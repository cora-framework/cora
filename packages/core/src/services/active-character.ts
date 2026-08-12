import { defineServiceToken, type ServiceToken } from "./services.js"

/**
 * The core-standard contract for "is this player currently playing this
 * character?" - defined in core (not in the characters module) so neither
 * a provider (characters) nor a consumer (inventory, money, ...) module
 * needs to import the other. Both import this token from
 * `@cora-framework/core`; see `docs/rfcs/0002-kernel-services.md`.
 */
export interface ActiveCharacterProvider {
  isActiveCharacter(
    playerId: number,
    characterId: number,
  ): boolean | Promise<boolean>
  getActiveCharacterId(playerId: number): number | null
}

/**
 * The well-known token for `ActiveCharacterProvider`. The characters module
 * provides it (wrapping its live session state); character-bound modules
 * consume it lazily via `ctx.services.get(activeCharacterProviderToken)`.
 */
export const activeCharacterProviderToken: ServiceToken<ActiveCharacterProvider> =
  defineServiceToken<ActiveCharacterProvider>("cora.characters.activeCharacter")
