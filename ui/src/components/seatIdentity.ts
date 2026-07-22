/**
 * Seat-binding rules shared by every game's board (roadmap C2 / REVIEW §3.3).
 *
 * `canDrive` and `myNames` were character-for-character identical in all three boards, because they are
 * **platform** rules, not game rules: whether this client may act (it controls the active seat, and that
 * seat isn't an AI the server already plays) and what its own seats are called. The one place they lived
 * per-game was an accident of copy-paste — Stone Age silently shipped without a "You are X" line for
 * exactly that reason.
 *
 * Typed off plain seat identity (`{ id, name }` + the active seat's id), **never** off `@game-hub/engine`,
 * so it lives in the shared components and a board feeds it the ingredients from its own typed view. The
 * genuinely per-game part — which seat is active — stays in the board (Container/Can't Stop read an
 * `activePlayerIndex`; a future game might not), passed in as `activePlayerId`.
 */
export interface SeatIdentityInput {
  readonly players: readonly { readonly id: string; readonly name: string }[];
  /** The active seat's id, or `null`/`undefined` when no one is on the clock (e.g. a finished game). */
  readonly activePlayerId: string | null | undefined;
  /** Seats an AI holds — never drivable by a human client. */
  readonly bots: readonly string[];
  /** The seats this client controls, or `null` for hotseat (drives every seat). */
  readonly controlledIds: readonly string[] | null;
}

export interface SeatIdentity {
  /**
   * May this client submit a move right now? True when the active seat is one it controls (or it's
   * hotseat) and that seat isn't a bot. Gate every action affordance on this.
   */
  readonly canDrive: boolean;
  /** This client's own seat name(s), or `null` for hotseat (no single identity to show). */
  readonly myNames: string[] | null;
}

export function seatIdentity({ players, activePlayerId, bots, controlledIds }: SeatIdentityInput): SeatIdentity {
  const activeIsBot = activePlayerId != null && bots.includes(activePlayerId);
  const canDrive =
    !activeIsBot && (!controlledIds || (activePlayerId != null && controlledIds.includes(activePlayerId)));
  const myNames = controlledIds ? players.filter((p) => controlledIds.includes(p.id)).map((p) => p.name) : null;
  return { canDrive, myNames };
}
