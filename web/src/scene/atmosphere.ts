/**
 * Shared time-of-day state, written once per frame by the Scene and read by
 * every material that cares (windows, lamps, car lights, beams). A plain
 * object, not React state: it changes every frame while the timeline moves.
 *   night: 0 at full day, 1 at dusk
 *   rain:  0 dry, 1 pouring
 */
export const atmosphere = { night: 1, rain: 0 }
