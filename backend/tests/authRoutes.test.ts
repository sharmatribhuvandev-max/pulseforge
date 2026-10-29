
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
    verifyToken: vi.fn(() => ({ userId: "test-user" })),
}));

async function createTestApp() {
    vi.resetModules();

    const { default: authRoutes } = await import("../src/routes/authRoutes");

    const app = express();
    app.use("/auth", authRoutes);

    return app;
}

describe("Authentication route rate limiting", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("limits signup requests", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 10; i++) {
            const response = await request(app).post("/auth/signup");
            expect(response.status).toBe(200);
        }

        const response = await request(app).post("/auth/signup");

        expect(response.status).toBe(429);
        expect(response.body.message).toBe(
            "Too many authentication attempts. Please try again later.",
        );
    });

    it("limits signin requests", async () => {
        const app = await createTestApp();

        for (let i = 0; i < 10; i++) {
            const response = await request(app).post("/auth/signin");
            expect(response.status).toBe(200);
        }

        const response = await request(app).post("/auth/signin");

        expect(response.status).toBe(429);
    });
});
