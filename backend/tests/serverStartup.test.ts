import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    disconnect: vi.fn(),
    poolEnd: vi.fn(),
    initPostgres: vi.fn(),
}));

vi.mock("mongoose", () => ({
    default: { disconnect: mocks.disconnect },
}));

vi.mock("../src/app", () => ({ default: vi.fn() }));

vi.mock("../src/db/mongodb", () => ({ connectMongoDB: vi.fn() }));

vi.mock("../src/db/postgres", () => ({
    connectPostgres: vi.fn(),
    postgresPool: { end: mocks.poolEnd },
}));

vi.mock("../src/db/initPostgres", () => ({
    initPostgres: mocks.initPostgres,
}));

vi.mock("../src/services/websocketService", () => ({
    initWebSocket: vi.fn(),
    closeWebSocket: vi.fn(),
}));

vi.mock("../src/shutdown", () => ({
    createShutdownHandler: vi.fn(),
    registerShutdownSignals: vi.fn(),
}));

// Importing server.ts runs startServer(). MongoDB and PostgreSQL connect,
// then the migration fails.
async function startWithFailingMigration() {
    vi.resetModules();
    vi.stubEnv("MONGO_URI", "mongodb://placeholder");
    vi.stubEnv("JWT_SECRET", "placeholder-secret-for-tests-0123456789");
    vi.stubEnv("POSTGRES_PASSWORD", "placeholder");
    mocks.initPostgres.mockRejectedValue(new Error("migration failed"));

    await import("../src/server");

    await vi.waitFor(() => {
        expect(process.exitCode).toBe(1);
    });
}

describe("server startup failure", () => {
    beforeEach(() => {
        process.exitCode = undefined;
        mocks.disconnect.mockReset().mockResolvedValue(undefined);
        mocks.poolEnd.mockReset().mockResolvedValue(undefined);
        mocks.initPostgres.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.exitCode = undefined;
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("disconnects MongoDB as well as PostgreSQL so the process can exit", async () => {
        await startWithFailingMigration();

        expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
        expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    });

    // Characterization: passes before the fix. Guards that a failing
    // disconnect still closes PostgreSQL and leaves exit code 1.
    it("still closes PostgreSQL and sets exit code 1 when disconnect fails", async () => {
        mocks.disconnect.mockRejectedValue(new Error("disconnect failed"));

        await startWithFailingMigration();

        expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
    });
});
