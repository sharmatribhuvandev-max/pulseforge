import { afterEach, describe, expect, it, vi } from "vitest";
import {
    consumeWebSocketTicket,
    issueWebSocketTicket,
} from "../src/services/webSocketTicketService";

describe("WebSocket ticket service", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("issues a unique, high-entropy ticket", () => {
        const first = issueWebSocketTicket("user-1");
        const second = issueWebSocketTicket("user-1");

        expect(first).toMatch(/^[a-f0-9]{64}$/);
        expect(second).toMatch(/^[a-f0-9]{64}$/);
        expect(first).not.toBe(second);
    });

    it("consumes a ticket only once", () => {
        const ticket = issueWebSocketTicket("user-1");

        expect(consumeWebSocketTicket(ticket)).toBe("user-1");
        expect(consumeWebSocketTicket(ticket)).toBeNull();
    });

    it("rejects unknown tickets", () => {
        expect(consumeWebSocketTicket("not-a-valid-ticket")).toBeNull();
    });

    it("rejects expired tickets", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

        const ticket = issueWebSocketTicket("user-1");

        vi.advanceTimersByTime(30_001);

        expect(consumeWebSocketTicket(ticket)).toBeNull();
    });

    it("rejects empty user IDs", () => {
        expect(() => issueWebSocketTicket("")).toThrow(
            "A user ID is required",
        );
        expect(() => issueWebSocketTicket("   ")).toThrow(
            "A user ID is required",
        );
    });
});
