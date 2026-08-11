import { z } from "zod"

/** RPC procedure names, namespaced `cora.characters.*` per RFC 0001. */
export const CORA_CHARACTERS_LIST = "cora.characters.list"
export const CORA_CHARACTERS_CREATE = "cora.characters.create"
export const CORA_CHARACTERS_DELETE = "cora.characters.delete"
export const CORA_CHARACTERS_SELECT = "cora.characters.select"

/** Maximum number of characters a single player may own at once. */
export const MAX_CHARACTERS_PER_PLAYER = 4

export const CHARACTER_NAME_MIN_LENGTH = 2
export const CHARACTER_NAME_MAX_LENGTH = 32

/**
 * Unicode letters, spaces and hyphens only. `\p{L}` matches a letter from
 * any script (not just ASCII), so names such as "Jose Garcia" or "Bjorn
 * Ostergaard" are valid, while digits, punctuation (other than `-`) and
 * emoji are not.
 */
export const CHARACTER_NAME_PATTERN = /^[\p{L} -]+$/u

/**
 * Business-rule name validation (length + character set), independent of
 * the zod boundary schema below. Used both by the server handler (to
 * produce the `"invalid_name"` typed error) and reusable client-side by the
 * character-select UI for the same 2-32 char rule.
 */
export function isValidCharacterName(name: string): boolean {
  return (
    name.length >= CHARACTER_NAME_MIN_LENGTH &&
    name.length <= CHARACTER_NAME_MAX_LENGTH &&
    CHARACTER_NAME_PATTERN.test(name)
  )
}

export interface CharacterPosition {
  x: number
  y: number
  z: number
}

/** The default spawn position used for a character with no stored position yet. */
export const DEFAULT_SPAWN_POSITION: CharacterPosition = { x: 0, y: 0, z: 0 }

export interface CharacterSummary {
  id: number
  name: string
  appearance: string | null
  createdAt: string
  lastPlayedAt: string | null
}

/**
 * Error union shared by every `cora.characters.*` procedure result. Also
 * reused (and extended) by the session/spawn state machine landing in a
 * later task, so it is designed once here rather than per-handler.
 */
export type CharactersError =
  | "invalid_input"
  | "invalid_name"
  | "limit_reached"
  | "not_found"
  | "not_owner"
  | "already_playing"

export interface CharactersErrorResult {
  ok: false
  error: CharactersError
  details?: string
}

export type ListCharactersResult =
  | { ok: true; characters: CharacterSummary[] }
  | CharactersErrorResult

export type CreateCharacterResult =
  | { ok: true; character: CharacterSummary }
  | CharactersErrorResult

export type DeleteCharacterResult = { ok: true } | CharactersErrorResult

export type SelectCharacterResult =
  | { ok: true; characterId: number; position: CharacterPosition }
  | CharactersErrorResult

export const listCharactersInputSchema = z.object({}).strict()
export type ListCharactersInput = z.infer<typeof listCharactersInputSchema>

export const createCharacterInputSchema = z.object({
  name: z.string(),
  appearance: z.string().optional(),
})
export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>

export const deleteCharacterInputSchema = z.object({
  characterId: z.number().int().positive(),
})
export type DeleteCharacterInput = z.infer<typeof deleteCharacterInputSchema>

export const selectCharacterInputSchema = z.object({
  characterId: z.number().int().positive(),
})
export type SelectCharacterInput = z.infer<typeof selectCharacterInputSchema>
