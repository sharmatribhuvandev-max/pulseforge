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

describe("WebSocket ticket route: per-user cap", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("[characterization, passes before the fix] issues 5 tickets to one user", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 5; i++) {
            const response = await requestTicket(app, "token-user-1");
            expect(response.status).toBe(200);
        }
    });

    it("returns 429 without a ticket when a user exceeds the cap", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 5; i++) {
            await requestTicket(app, "token-user-1");
        }

        const response = await requestTicket(app, "token-user-1");

        expect(response.status).toBe(429);
        expect(response.body.ticket).toBeUndefined();
        expect(typeof response.body.message).toBe("string");
    });

    it("does not log a cap hit as an unhandled error", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 5; i++) {
            await requestTicket(app, "token-user-1");
        }

        await requestTicket(app, "token-user-1");

        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("[characterization, passes before the fix] still issues a ticket to another user while one user is capped", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 6; i++) {
            await requestTicket(app, "token-user-1");
        }

        const response = await requestTicket(app, "token-user-2");

        expect(response.status).toBe(200);
        expect(response.body.ticket).toMatch(/^[a-f0-9]{64}$/);
    });
});