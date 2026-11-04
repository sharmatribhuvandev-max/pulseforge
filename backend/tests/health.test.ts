import { afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import request from "supertest";

vi.mock("../src/db/postgres", () => ({
    connectPostgres: vi.fn(),
    postgresPool: {
        query: vi.fn(),
        connect: vi.fn(),
        end: vi.fn(),
    },
}));

vi.mock("../src/services/websocketService", () => ({
    initWebSocket: vi.fn(),
}));

async function loadApp(nodeEnv: string) {
    vi.resetModules();
    // Models compile into the shared mongoose instance, which resetModules
    // does not reset. Drop them so the app's model files can load again.
    mongoose.deleteModel(/.+/);
    vi.stubEnv("MONGO_URI", "mongodb://placeholder");
    vi.stubEnv("JWT_SECRET", "placeholder-secret-for-tests-0123456789");
    vi.stubEnv("POSTGRES_PASSWORD", "placeholder");
    vi.stubEnv("FRONTEND_URL", "");
    vi.stubEnv("NODE_ENV", nodeEnv);

    const { default: app } = await import("../src/app");
    const { postgresPool } = await import("../src/db/postgres");

    return { app, postgresPool };
}

describe("GET /healthz", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    for (const nodeEnv of ["production", "development"]) {
        it(`returns 200 with only {"status":"ok"} when NODE_ENV=${nodeEnv}`, async () => {
            const { app } = await loadApp(nodeEnv);

            const response = await request(app).get("/healthz");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: "ok" });
        });
    }

    it("tells clients and proxies not to cache the response", async () => {
        const { app } = await loadApp("production");

        const response = await request(app).get("/healthz");

        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("answers without touching PostgreSQL", async () => {
        const { app, postgresPool } = await loadApp("production");

        const response = await request(app).get("/healthz");

        expect(response.status).toBe(200);
        expect(postgresPool.query).not.toHaveBeenCalled();
        expect(postgresPool.connect).not.toHaveBeenCalled();
    });
});
