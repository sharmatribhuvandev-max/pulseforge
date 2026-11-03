import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({
    default: { config: vi.fn() },
}));

async function loadEnv() {
    vi.resetModules();
    const module = await import("../src/config/env");
    return module.env;
}

async function loadEnvError(): Promise<Error> {
    try {
        await loadEnv();
    } catch (error) {
        return error as Error;
    }

    throw new Error("Expected env to reject, but it loaded successfully");
}

describe("Environment configuration: JWT_SECRET", () => {
    beforeEach(() => {
        vi.stubEnv("MONGO_URI", "mongodb://placeholder");
        vi.stubEnv("POSTGRES_PASSWORD", "placeholder");
        vi.stubEnv("FRONTEND_URL", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("[characterization, passes before the fix] still rejects a missing JWT_SECRET", async () => {
        vi.stubEnv("JWT_SECRET", "");

        await expect(loadEnv()).rejects.toThrow(
            "Missing required environment variable: JWT_SECRET",
        );
    });

    it("[characterization, passes before the fix] accepts a fake secret of exactly 32 characters", async () => {
        vi.stubEnv("JWT_SECRET", "a".repeat(32));

        const env = await loadEnv();

        expect(env.jwtSecret).toBe("a".repeat(32));
    });

    it("rejects a fake secret of 31 characters", async () => {
        vi.stubEnv("JWT_SECRET", "a".repeat(31));

        await expect(loadEnv()).rejects.toThrow(
            "JWT_SECRET must be at least 32 characters",
        );
    });

    it("measures the length after trimming surrounding whitespace", async () => {
        vi.stubEnv("JWT_SECRET", "  " + "a".repeat(31) + "  ");

        await expect(loadEnv()).rejects.toThrow(
            "JWT_SECRET must be at least 32 characters",
        );
    });

    it("never includes the secret value in the error message", async () => {
        const fakeSecret = "fake-short-secret-abc123";
        vi.stubEnv("JWT_SECRET", fakeSecret);

        const error = await loadEnvError();

        expect(error.message).toContain("JWT_SECRET");
        expect(error.message).not.toContain(fakeSecret);
    });
});