import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("dotenv", () => ({
    default: { config: vi.fn() },
}));

vi.mock("../src/db/mongodb", () => ({
    connectMongoDB: vi.fn(),
}));

vi.mock("../src/db/postgres", () => ({
    connectPostgres: vi.fn(),
    postgresPool: {
        query: vi.fn(),
        connect: vi.fn(),
        end: vi.fn(),
    },
}));

vi.mock("../src/db/initPostgres", () => ({
    initPostgres: vi.fn(),
}));

vi.mock("../src/services/websocketService", () => ({
    initWebSocket: vi.fn(),
}));

const FRONTEND_ORIGIN = "http://localhost:5173";

// The first import of the real app is slow, especially when many test files run in parallel.
vi.setConfig({ testTimeout: 30_000 });

async function loadApp() {
    vi.resetModules();

    // Mongoose lives in node_modules and is not reset by vi.resetModules(),
    // so models compiled by an earlier import must be removed first.
    const { default: mongoose } = await import("mongoose");

    for (const name of Object.keys(mongoose.models)) {
        mongoose.deleteModel(name);
    }

    const module = await import("../src/app");
    return module.default;
}

describe("App: security headers", () => {
    beforeEach(() => {
        vi.stubEnv("MONGO_URI", "mongodb://placeholder");
        vi.stubEnv("JWT_SECRET", "placeholder-secret-for-tests-0123456789");
        vi.stubEnv("POSTGRES_PASSWORD", "placeholder");
        vi.stubEnv("FRONTEND_URL", "");
        vi.stubEnv("TRUST_PROXY_HOPS", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("[characterization, passes before the fix] still echoes the configured CORS origin", async () => {
        const app = await loadApp();

        const response = await request(app)
            .get("/")
            .set("Origin", FRONTEND_ORIGIN);

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBe(
            FRONTEND_ORIGIN,
        );
    });

    it("[characterization, passes before the fix] still answers a CORS preflight from the configured origin", async () => {
        const app = await loadApp();

        const response = await request(app)
            .options("/auth/signin")
            .set("Origin", FRONTEND_ORIGIN)
            .set("Access-Control-Request-Method", "POST")
            .set("Access-Control-Request-Headers", "content-type");

        expect([200, 204]).toContain(response.status);
        expect(response.headers["access-control-allow-origin"]).toBe(
            FRONTEND_ORIGIN,
        );
    });

    it("does not advertise Express through X-Powered-By", async () => {
        const app = await loadApp();

        const response = await request(app).get("/");

        expect(response.headers["x-powered-by"]).toBeUndefined();
    });

    it("sends X-Content-Type-Options: nosniff", async () => {
        const app = await loadApp();

        const response = await request(app).get("/");

        expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("sends Strict-Transport-Security", async () => {
        const app = await loadApp();

        const response = await request(app).get("/");

        expect(response.headers["strict-transport-security"]).toBeDefined();
    });

    it("sends X-Content-Type-Options: nosniff on a 404 response too", async () => {
        const app = await loadApp();

        const response = await request(app).get("/route-that-does-not-exist");

        expect(response.status).toBe(404);
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });
});