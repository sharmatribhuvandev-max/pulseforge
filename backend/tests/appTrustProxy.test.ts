import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("App wiring: trust proxy", () => {
    beforeEach(() => {
        vi.stubEnv("MONGO_URI", "mongodb://placeholder");
        vi.stubEnv("JWT_SECRET", "placeholder-secret-for-tests-0123456789");
        vi.stubEnv("POSTGRES_PASSWORD", "placeholder");
        vi.stubEnv("FRONTEND_URL", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("[characterization, passes before the fix] trusts no proxy when TRUST_PROXY_HOPS is unset", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", "");

        const app = await loadApp();

        expect(app.get("trust proxy")).toBe(false);
    });

    it("trusts 1 proxy hop when TRUST_PROXY_HOPS is 1", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", "1");

        const app = await loadApp();

        expect(app.get("trust proxy")).toBe(1);
    });

    it("trusts 2 proxy hops when TRUST_PROXY_HOPS is 2", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", "2");

        const app = await loadApp();

        expect(app.get("trust proxy")).toBe(2);
    });
});