import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPool() {
    vi.resetModules();
    vi.stubEnv("MONGO_URI", "mongodb://placeholder");
    vi.stubEnv("JWT_SECRET", "placeholder-secret-for-tests-0123456789");
    vi.stubEnv("POSTGRES_PASSWORD", "placeholder");

    const { postgresPool } = await import("../src/db/postgres");

    return postgresPool;
}

// What pg-pool emits when an idle client's connection drops, for example when
// a managed provider suspends compute: the error carries the client object.
function idleClientError() {
    return Object.assign(
        new Error("terminating connection due to administrator command"),
        { code: "57P01", client: { password: "must-not-be-logged" } },
    );
}

describe("PostgreSQL pool idle-client errors", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("does not crash the process when an idle client errors", async () => {
        const pool = await loadPool();
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        expect(() => pool.emit("error", idleClientError(), {})).not.toThrow();

        await pool.end();
    });

    it("logs only the error name, code and message, never the client", async () => {
        const pool = await loadPool();
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        pool.emit("error", idleClientError(), {});

        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith(
            "PostgreSQL idle client error:",
            {
                name: "Error",
                code: "57P01",
                message: "terminating connection due to administrator command",
            },
        );

        await pool.end();
    });
});

describe("PostgreSQL pool connection timeout", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("gives up on a connection attempt after 10 seconds", async () => {
        const pool = await loadPool();

        expect(pool.options.connectionTimeoutMillis).toBe(10_000);

        await pool.end();
    });
});
