import axios from "axios";

export const RECONNECT_BASE_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 30_000;

// Exponential backoff with "equal jitter": the ceiling doubles per failed
// attempt (1 s, 2 s, 4 s ... capped at 30 s) and the delay is a random value
// between half the ceiling and the ceiling, so tabs that lost the connection
// at the same moment do not all retry together, and the delay never drops
// to near zero. `attempt` is 0 for the first retry after a failure.
export function getReconnectDelay(
    attempt: number,
    random: () => number = Math.random,
): number {
    const exponent = Math.min(Math.max(attempt, 0), 30);
    const ceiling = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** exponent,
    );
    const half = ceiling / 2;

    return Math.round(half + random() * half);
}

// A 401 from the ticket request means the login token is missing, invalid
// or expired. Retrying cannot succeed and only uses up the ticket rate limit.
export function shouldStopReconnecting(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 401;
}