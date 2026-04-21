// In-memory per-user throttle for slot spins.
// Caveat: this state is process-local. It resets on server restart and is
// not shared across multiple Node instances. For a ~60-user guild on a
// single Railway instance this is adequate. If the app is ever scaled
// horizontally, replace with a `lastSpinAt` column on User or Redis.

const lastSpinByUser = new Map<string, number>();
const MIN_MS = 500;

/**
 * Returns null if the spin is allowed, or the number of ms the caller
 * must wait before spinning again.
 */
export function checkSlotThrottle(userId: string): number | null {
  const now = Date.now();
  const last = lastSpinByUser.get(userId) ?? 0;
  const wait = MIN_MS - (now - last);
  if (wait > 0) return wait;
  lastSpinByUser.set(userId, now);
  return null;
}
