import { describe, expect, it } from "vitest";
import {
    isLatencyHealthy,
    LATENCY_THRESHOLD_MS,
    REQUIRED_HEALTHY_CHECKS,
} from "./incidentPolicy";

describe("incident recovery policy", () => {
    it("matches the backend: three healthy checks under 1,000 ms", () => {
        expect(REQUIRED_HEALTHY_CHECKS).toBe(3);
        expect(LATENCY_THRESHOLD_MS).toBe(1000);
    });
});

describe("isLatencyHealthy", () => {
    it("is healthy below the threshold", () => {
        expect(isLatencyHealthy(999)).toBe(true);
    });

    it("is slow at exactly the threshold, like the backend", () => {
        expect(isLatencyHealthy(1000)).toBe(false);
    });

    it("is not healthy when latency is unknown", () => {
        expect(isLatencyHealthy(null)).toBe(false);
    });
});
