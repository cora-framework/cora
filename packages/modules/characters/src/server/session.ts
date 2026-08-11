/**
 * Per-player session state for the character select / spawn flow.
 *
 * A player's session moves through `"connected"` -> `"selecting"` ->
 * `"playing"`. In this module's `register()` the two steps collapse: the
 * moment `playerConnected` fires, a session is created directly in
 * `"selecting"` state and the `cora.characters.ui.open` client call goes out
 * in the same handler (see `characters-module.ts`). The `"connected"` status
 * is kept in the type for completeness - e.g. a future pre-selection loading
 * phase - but is not produced by this module today.
 *
 * `playerDeath` while `"playing"` intentionally leaves the session
 * untouched: respawn handling is deferred to a later phase (see the plan's
 * self-review notes - it depends on upstream respawn events that are not
 * yet verified against a live server).
 */
export type SessionStatus = "connected" | "selecting" | "playing"

export interface PlayingSession {
  status: "playing"
  characterId: number
}

export interface NonPlayingSession {
  status: "connected" | "selecting"
  characterId: null
}

export type PlayerSession = PlayingSession | NonPlayingSession

/**
 * In-memory (per kernel-boot, per-module) tracker of every connected
 * player's session state. Not persisted: on process restart every player is
 * implicitly disconnected and reconnects fresh.
 */
export class SessionManager {
  private readonly sessions = new Map<number, PlayerSession>()
  private readonly connectEpochs = new Map<number, number>()

  /** The player's current session, or `undefined` if not tracked (never
   * connected, or already disconnected/cleared). */
  get(playerId: number): PlayerSession | undefined {
    return this.sessions.get(playerId)
  }

  /**
   * Creates (or replaces) the player's session in `"selecting"` state,
   * synchronously - `register()`'s `playerConnected` hook calls this before
   * doing any `await`, so a synchronous rpc call (e.g. `select`) that
   * happens to run immediately after `playerConnected` fires already sees
   * this session, even though the async character-list fetch and the
   * `cora.characters.ui.open` push that follow have not resolved yet.
   *
   * Returns a monotonically increasing "connect epoch" for the player,
   * starting at 1. A rapid reconnect (a second `playerConnected` for the
   * same player before the first connect's async work has finished) calls
   * this again and gets a higher epoch; the first flow's `epoch` argument to
   * `isCurrentConnectEpoch` then reads as stale, letting the caller skip
   * delivering an outdated `ui.open` character list after a fresher one.
   */
  startSelecting(playerId: number): number {
    const epoch = (this.connectEpochs.get(playerId) ?? 0) + 1
    this.connectEpochs.set(playerId, epoch)
    this.sessions.set(playerId, { status: "selecting", characterId: null })
    return epoch
  }

  /**
   * Whether `epoch` (as returned by a prior `startSelecting` call) is still
   * the player's most recent connect. `false` means a later connect has
   * superseded it - the caller should skip whatever it was about to do on
   * behalf of the stale flow (e.g. pushing `ui.open`).
   */
  isCurrentConnectEpoch(playerId: number, epoch: number): boolean {
    return this.connectEpochs.get(playerId) === epoch
  }

  /** Transitions the player's session to `"playing"` the given character. */
  setPlaying(playerId: number, characterId: number): void {
    this.sessions.set(playerId, { status: "playing", characterId })
  }

  /** Drops the player's session entirely (e.g. on disconnect). */
  clear(playerId: number): void {
    this.sessions.delete(playerId)
  }

  /** Whether the player currently has a `"playing"` session (of any character). */
  isPlaying(playerId: number): boolean {
    return this.sessions.get(playerId)?.status === "playing"
  }

  /**
   * The character id the player is currently playing, or `null` if they are
   * not in a `"playing"` session. Used by the `delete` guard to refuse
   * deleting the caller's own active character.
   */
  activeCharacterId(playerId: number): number | null {
    const session = this.sessions.get(playerId)
    return session?.status === "playing" ? session.characterId : null
  }
}
