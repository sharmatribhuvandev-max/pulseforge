import { afterEach, describe, expect, it, vi } from "vitest";

async function loadService() {
    vi.resetModules();

    return await import("../src/services/webSocketTicketService");
}

function captureError(action: () => unknown): Error {
    try {
        action();
    } catch (error) {
        return error as Error;
    }

    throw new Error("Expected the action to throw, but it did not");
}

describe("WebSocket ticket service: per-user cap", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("[characterization, passes before the fix] lets one user hold 5 pending tickets", async () => {
        const service = await loadService();
        const tickets = new Set<string>();

        for (let i = 0; i < 5; i++) {
            tickets.add(service.issueWebSocketTicket("user-1"));
        }

        expect(tickets.size).toBe(5);
    });

    it("rejects a 6th pending ticket for the same user", async () => {
        const service = await loadService();

        for (let i = 0; i < 5; i++) {
            service.issueWebSocketTicket("user-1");
        }

        const error = captureError(() =>
            service.issueWebSocketTicket("user-1"),
        );

        expect(error).toBeInstanceOf(service.WebSocketTicketLimitError);
    });

    it("does not leak the user ID or a ticket in the limit error message", async () => {
        const service = await loadService();
        const userId = "user-secret-id-789";

        for (let i = 0; i < 5; i++) {
            service.issueWebSocketTicket(userId);
        }

        const error = captureError(() =>
            service.issueWebSocketTicket(userId),
        );

        expect(error.message).not.toContain(userId);
        expect(error.message).not.toMatch(/[a-f0-9]{64}/);
    });

    it("[characterization, passes before the fix] lets another user get a ticket while one user holds 5", async () => {
        const service = await loadService();

        for (let i = 0; i < 5; i++) {
            service.issueWebSocketTicket("user-1");
        }

        expect(service.issueWebSocketTicket("user-2")).toMatch(
            /^[a-f0-9]{64}$/,
        );
    });

    it("frees a slot when a ticket is consumed", async () => {
        const service = await loadService();
        const tickets: string[] = [];

        for (let i = 0; i < 5; i++) {
            tickets.push(service.issueWebSocketTicket("user-1"));
        }

        expect(() => service.issueWebSocketTicket("user-1")).toThrow();

        expect(service.consumeWebSocketTicket(tickets[0])).toBe("user-1");
        expect(service.issueWebSocketTicket("user-1")).toMatch(
            /^[a-f0-9]{64}$/,
        );
    });

    it("stops counting expired tickets toward the cap", async () => {
        const service = await loadService();

        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

        for (let i = 0; i < 5; i++) {
            service.issueWebSocketTicket("user-1");
        }

        expect(() => service.issueWebSocketTicket("user-1")).toThrow();

        vi.advanceTimersByTime(30_001);

        expect(service.issueWebSocketTicket("user-1")).toMatch(
            /^[a-f0-9]{64}$/,
        );
    });
});