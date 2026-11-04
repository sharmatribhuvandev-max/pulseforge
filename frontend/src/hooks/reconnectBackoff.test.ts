import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";

import {
    getReconnectDelay,
    RECONNECT_MAX_DELAY_MS,
    shouldSlowDown,
    shouldStopReconnecting,
    SLOW_DOWN_ATTEMPT,
} from "./reconnectBackoff";

const lowest = () => 0;
const highest = () => 0.999999;

function httpError(status: number): AxiosError {
    return new AxiosError(
        `Request failed with status code ${status}`,
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
            status,
            statusText: "",
            headers: {},
            config: { headers: new AxiosHeaders() },
            data: {},
        } as AxiosResponse,
    );
}

describe("getReconnectDelay", () => {
    it("waits between 0.5 and 1 second before the first retry", () => {
        expect(getReconnectDelay(0, lowest)).toBe(500);
        expect(getReconnectDelay(0, highest)).toBe(1_000);
    });

    it("doubles the delay range after each failed attempt", () => {
        expect([1, 2, 3, 4].map((attempt) => getReconnectDelay(attempt, lowest)))
            .toEqual([1_000, 2_000, 4_000, 8_000]);
        expect([1, 2, 3, 4].map((attempt) => getReconnectDelay(attempt, highest)))
            .toEqual([2_000, 4_000, 8_000, 16_000]);
    });

    it("caps the delay at 30 seconds", () => {
        for (const attempt of [5, 10, 100, 10_000]) {
            expect(getReconnectDelay(attempt, lowest)).toBe(15_000);
            expect(getReconnectDelay(attempt, highest)).toBe(RECONNECT_MAX_DELAY_MS);
        }
    });

    it("treats a negative attempt as the first attempt", () => {
        expect(getReconnectDelay(-1, lowest)).toBe(500);
    });
});

describe("shouldStopReconnecting", () => {
    it("stops only when the ticket request is rejected with 401", () => {
        expect(shouldStopReconnecting(httpError(401))).toBe(true);

        expect(shouldStopReconnecting(httpError(429))).toBe(false);
        expect(shouldStopReconnecting(httpError(500))).toBe(false);
        expect(shouldStopReconnecting(httpError(503))).toBe(false);
        expect(
            shouldStopReconnecting(new AxiosError("Network Error", "ERR_NETWORK")),
        ).toBe(false);
        expect(
            shouldStopReconnecting(new Error("Invalid WebSocket ticket response")),
        ).toBe(false);
    });
});

describe("shouldSlowDown", () => {
    it("slows down only on 429 or 503 from the ticket request", () => {
        expect(shouldSlowDown(httpError(429))).toBe(true);
        expect(shouldSlowDown(httpError(503))).toBe(true);

        expect(shouldSlowDown(httpError(401))).toBe(false);
        expect(shouldSlowDown(httpError(500))).toBe(false);
        expect(
            shouldSlowDown(new AxiosError("Network Error", "ERR_NETWORK")),
        ).toBe(false);
        expect(shouldSlowDown(new Error("boom"))).toBe(false);
    });

    it("jumps straight to the 15-30 second cap", () => {
        expect(getReconnectDelay(SLOW_DOWN_ATTEMPT, lowest)).toBe(15_000);
        expect(getReconnectDelay(SLOW_DOWN_ATTEMPT, highest)).toBe(RECONNECT_MAX_DELAY_MS);
    });
});