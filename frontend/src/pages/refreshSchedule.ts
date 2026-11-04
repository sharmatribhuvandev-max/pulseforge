export const REFRESH_DEBOUNCE_MS = 300;
export const REFRESH_MAX_WAIT_MS = 2000;

// Trailing debounce with a maximum wait: each new event restarts the
// debounce, but the refresh never lands later than REFRESH_MAX_WAIT_MS after
// the first event that has not been loaded yet, so steady traffic cannot
// postpone it forever.
export function getRefreshDelay(
    now: number,
    firstPendingAt: number
): number {
    const untilMaxWait = firstPendingAt + REFRESH_MAX_WAIT_MS - now;

    return Math.max(0, Math.min(REFRESH_DEBOUNCE_MS, untilMaxWait));
}
