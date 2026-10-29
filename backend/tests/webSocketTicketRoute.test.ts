import { afterEach, describe, expect, it, vi } from "vitest";
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
        if (token === "valid-test-token") {
            return { userId: "test-user" };
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

describe("WebSocket ticket route", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("rejects requests without an authorization header", async () => {
        const app = await createTestApp();

        const response = await request(app).post("/auth/ws-ticket");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Authorization header is required",
        );
    });

    it("rejects invalid JWTs", async () => {
        const app = await createTestApp();

        const response = await request(app)
            .post("/auth/ws-ticket")
            .set("Authorization", "Bearer invalid-test-token");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid or expired token");
    });

    it("issues a short-lived ticket to an authenticated user", async () => {
        const app = await createTestApp();

        const response = await request(app)
            .post("/auth/ws-ticket")
            .set("Authorization", "Bearer valid-test-token");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ expiresIn: 30 });
        expect(response.body.ticket).toMatch(/^[a-f0-9]{64}$/);
    });
});
