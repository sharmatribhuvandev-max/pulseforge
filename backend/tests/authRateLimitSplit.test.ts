import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// The controllers answer with whatever status the test asks for through the
// x-test-status header, so failures (401) and successes (200/201) can be mixed.
vi.mock("../src/controllers/authController", () => ({
    signup: vi.fn((req, res) =>
        res
            .status(Number(req.headers["x-test-status"] ?? 200))
            .json({ route: "signup" }),
    ),
    signin: vi.fn((req, res) =>
        res
            .status(Number(req.headers["x-test-status"] ?? 200))
            .json({ route: "signin" }),
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

function post(app: express.Express, path: string, status: number) {
    return request(app).post(path).set("x-test-status", String(status));
}

async function expectStatuses(
    app: express.Express,
    path: string,
    handlerStatus: number,
    expected: number,
    times: number,
) {
    for (let i = 0; i < times; i++) {
        const response = await post(app, path, handlerStatus);
        expect(response.status).toBe(expected);
    }
}

describe("Authentication rate limits: separate counters", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        errorSpy.mockRestore();
        vi.clearAllMocks();
    });

    it("exhausting the signup limit does not block signin", async () => {
        const app = await createTestApp();

        await expectStatuses(app, "/auth/signup", 201, 201, 10);

        const limitedSignup = await post(app, "/auth/signup", 201);
        expect(limitedSignup.status).toBe(429);

        const signin = await post(app, "/auth/signin", 401);
        expect(signin.status).toBe(401);
    });

    it("exhausting failed signins does not block signup", async () => {
        const app = await createTestApp();

        await expectStatuses(app, "/auth/signin", 401, 401, 10);

        const limitedSignin = await post(app, "/auth/signin", 401);
        expect(limitedSignin.status).toBe(429);

        const signup = await post(app, "/auth/signup", 201);
        expect(signup.status).toBe(201);
    });

    it("[characterization, passes before the fix] signin counts failed attempts", async () => {
        const app = await createTestApp();

        await expectStatuses(app, "/auth/signin", 401, 401, 10);

        const limited = await post(app, "/auth/signin", 401);
        expect(limited.status).toBe(429);
    });

    it("signin does not count successful logins", async () => {
        const app = await createTestApp();

        await expectStatuses(app, "/auth/signin", 200, 200, 15);
    });

    it("signin counts only the failures when failures and successes are mixed", async () => {
        const app = await createTestApp();

        await expectStatuses(app, "/auth/signin", 401, 401, 5);
        await expectStatuses(app, "/auth/signin", 200, 200, 20);
        await expectStatuses(app, "/auth/signin", 401, 401, 5);

        const limited = await post(app, "/auth/signin", 401);
        expect(limited.status).toBe(429);
    });

    it("[characterization, passes before the fix] signup counts successful requests", async () => {
        const app = await createTestApp();

        await expectStatuses(app, "/auth/signup", 201, 201, 10);

        const limited = await post(app, "/auth/signup", 201);
        expect(limited.status).toBe(429);
    });
});