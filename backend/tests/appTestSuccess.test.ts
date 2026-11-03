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

describe("App: /test-success is hidden in production", () => {
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

    it("[characterization, passes before the fix] serves /test-success when NODE_ENV is development", async () => {
        vi.stubEnv("NODE_ENV", "development");

        const app = await loadApp();
        const response = await request(app).get("/test-success");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ message: "Test API successful" });
    });

    it("[characterization, passes before the fix] serves /test-success when NODE_ENV is empty", async () => {
        vi.stubEnv("NODE_ENV", "");

        const app = await loadApp();
        const response = await request(app).get("/test-success");

        expect(response.status).toBe(200);
    });

    it("returns 404 for /test-success when NODE_ENV is production", async () => {
        vi.stubEnv("NODE_ENV", "production");

        const app = await loadApp();
        const response = await request(app).get("/test-success");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            message: "Route not found: GET /test-success",
        });
    });

    it("treats a padded production value as production", async () => {
        vi.stubEnv("NODE_ENV", " production ");

        const app = await loadApp();
        const response = await request(app).get("/test-success");

        expect(response.status).toBe(404);
    });

    it("[characterization, passes before the fix] still serves GET / in production", async () => {
        vi.stubEnv("NODE_ENV", "production");

        const app = await loadApp();
        const response = await request(app).get("/");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            message: "PulseForge API is running",
        });
    });
});