// Timing shared by the browser and the game server, so computer players
// wait for the same animations whether you play offline or online.

export const SHUFFLE_MS = 1700
export const DEAL_STAGGER_MS = 22
export const DEAL_FLIGHT_MS = 420
export const DEAL_MS = 52 * DEAL_STAGGER_MS + DEAL_FLIGHT_MS

/** Pause before a computer player moves. */
export const AI_DELAY_MS = 1500
/** After a deal, wait for the shuffle + deal animation before the first computer move. */
export const FIRST_MOVE_DELAY_MS = SHUFFLE_MS + DEAL_MS + 500
