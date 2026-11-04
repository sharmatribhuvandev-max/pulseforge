// Must match the backend recovery policy (backend/src/services/incidentService.ts):
// a request is slow at or above LATENCY_THRESHOLD_MS, and a latency incident
// resolves after REQUIRED_HEALTHY_CHECKS consecutive 2xx responses below it.
export const LATENCY_THRESHOLD_MS = 1000;
export const REQUIRED_HEALTHY_CHECKS = 3;

// Same rule as the backend: a request at or above the threshold is slow.
export function isLatencyHealthy(latency: number | null): boolean {
    return latency !== null && latency < LATENCY_THRESHOLD_MS;
}
