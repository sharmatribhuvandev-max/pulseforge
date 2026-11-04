import { describe, expect, it } from "vitest";
import {
    getRefreshDelay,
    REFRESH_DEBOUNCE_MS,
    REFRESH_MAX_WAIT_MS,
} from "./refreshSchedule";

const T0 = 1_000_000;

describe("getRefreshDelay", () => {
    it("uses the approved timings", () => {
        expect(REFRESH_DEBOUNCE_MS).toBe(300);
        expect(REFRESH_MAX_WAIT_MS).toBe(2000);
    });

    it("waits the full debounce for the first pending event", () => {
        expect(getRefreshDelay(T0, T0)).toBe(300);
    });

    it("keeps debouncing while the max wait is far away", () => {
        expect(getRefreshDelay(T0 + 1000, T0)).toBe(300);
    });

    it("shortens the delay so the refresh lands at the max wait", () => {
        expect(getRefreshDelay(T0 + 1800, T0)).toBe(200);
    });

    it("refreshes immediately once the max wait has passed", () => {
        expect(getRefreshDelay(T0 + 2000, T0)).toBe(0);
        expect(getRefreshDelay(T0 + 2500, T0)).toBe(0);
    });

    it("never waits longer than the debounce if the clock goes backwards", () => {
        expect(getRefreshDelay(T0 - 5000, T0)).toBe(300);
    });

    it("refreshes within the max wait under constant traffic", () => {
        // An event every 100 ms, each one restarting the timer.
        const firstPendingAt = T0;
        let fireAt = Infinity;

        for (let now = T0; now < T0 + 10_000 && now < fireAt; now += 100) {
            fireAt = now + getRefreshDelay(now, firstPendingAt);
        }

        expect(fireAt).toBeLessThanOrEqual(T0 + REFRESH_MAX_WAIT_MS);
    });
});
