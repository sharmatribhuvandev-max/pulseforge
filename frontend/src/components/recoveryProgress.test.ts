import { describe, expect, it } from "vitest";
import { formatRecoveryProgress } from "./recoveryProgress";

describe("formatRecoveryProgress", () => {
    it("shows progress for an active latency incident", () => {
        expect(formatRecoveryProgress({ type: "HIGH_LATENCY", healthy_checks: 1 }))
            .toBe("Recovery: 1 of 3 healthy checks");
    });

    it("shows zero progress after a reset", () => {
        expect(formatRecoveryProgress({ type: "HIGH_LATENCY", healthy_checks: 0 }))
            .toBe("Recovery: 0 of 3 healthy checks");
    });

    it("never shows more than the required count", () => {
        expect(formatRecoveryProgress({ type: "HIGH_LATENCY", healthy_checks: 7 }))
            .toBe("Recovery: 3 of 3 healthy checks");
    });

    it("shows nothing for an error-rate incident", () => {
        expect(formatRecoveryProgress({ type: "HIGH_ERROR_RATE", healthy_checks: 2 }))
            .toBeNull();
    });

    it("shows nothing when the count is missing or invalid", () => {
        expect(formatRecoveryProgress({ type: "HIGH_LATENCY" })).toBeNull();
        expect(formatRecoveryProgress({ type: "HIGH_LATENCY", healthy_checks: null })).toBeNull();
        expect(formatRecoveryProgress({ type: "HIGH_LATENCY", healthy_checks: -1 })).toBeNull();
        expect(formatRecoveryProgress({ type: "HIGH_LATENCY", healthy_checks: 1.5 })).toBeNull();
    });
});
