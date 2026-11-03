import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../src/controllers/authController", () => ({
    signup: vi.fn((_req, res) =>
        res.status(200).json({ route: "signup" }),
    ),
    signin: vi.fn((_req, res) =>
        res.status(200).json({ route: "signin" }),
    ),
}));

vi.mock("../src/utils/jwt", () => ({
    verifyToken: vi.fn((token: string) => {
        if (token === "token-user-1") {
            return { userId: "user-1" };
        }
        if (token === "token-user-2") {
            return { userId: "user-2" };
        }
        throw new Error("Invalid token");
    }),
}));

// The per-user ticket cap is covered elsewhere. Mocking the service keeps it
// from answering before the rate limiter does.
vi.mock("../src/services/webSocketTicketService", () => ({
    issueWebSocketTicket: vi.fn(() => "a".repeat(64)),
    WebSocketTicketLimitError: class WebSocketTicketLimitError extends Error {},
}));

async function createTestApp() {
    vi.resetModules();

    const { default: authRoutes } = await import("../src/routes/authRoutes");
    const app = express();
    app.use("/auth", authRoutes);

    return app;
}

function requestTicket(app: express.Express, token: string) {
    return request(app)
        .post("/auth/ws-ticket")
        .set("Authorization", `Bearer ${token}`);
}

describe("WebSocket ticket route: rate limit", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("[characterization, passes before the fix] allows 30 requests per minute from one user", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 30; i++) {
            const response = await requestTicket(app, "token-user-1");
            expect(response.status).toBe(200);
        }
    });

    it("returns 429 on the 31st request from one user", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 30; i++) {
            await requestTicket(app, "token-user-1");
        }

        const response = await requestTicket(app, "token-user-1");

        expect(response.status).toBe(429);
        expect(response.body.ticket).toBeUndefined();
        expect(response.body.message).toBe(
            "Too many WebSocket ticket requests. Please try again later.",
        );
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("[characterization, passes before the fix] still serves another user after one user made 31 requests", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 31; i++) {
            await requestTicket(app, "token-user-1");
        }

        const response = await requestTicket(app, "token-user-2");

        expect(response.status).toBe(200);
    });

    it("gives each user a separate bucket of 30", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 31; i++) {
            await requestTicket(app, "token-user-1");
        }

        for (let i = 0; i < 30; i++) {
            const response = await requestTicket(app, "token-user-2");
            expect(response.status).toBe(200);
        }

        const limited = await requestTicket(app, "token-user-2");

        expect(limited.status).toBe(429);
    });
});