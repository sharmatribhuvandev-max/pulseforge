import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({
    default: { config: vi.fn() },
}));

async function loadEnv() {
    vi.resetModules();
    const module = await import("../src/config/env");
    return module.env;
}

describe("Environment configuration: TRUST_PROXY_HOPS", () => {
    beforeEach(() => {
        vi.stubEnv("MONGO_URI", "mongodb://placeholder");
        vi.stubEnv("JWT_SECRET", "placeholder-secret-for-tests-0123456789");
        vi.stubEnv("POSTGRES_PASSWORD", "placeholder");
        vi.stubEnv("FRONTEND_URL", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults to 0 hops when unset", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", "");

        const env = await loadEnv();

        expect(env.trustProxyHops).toBe(0);
    });

    it("accepts an explicit 0", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", "0");

        const env = await loadEnv();

        expect(env.trustProxyHops).toBe(0);
    });

    it("accepts 1", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", "1");

        const env = await loadEnv();

        expect(env.trustProxyHops).toBe(1);
    });

    it("accepts the upper bound of 10", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", "10");

        const env = await loadEnv();

        expect(env.trustProxyHops).toBe(10);
    });

    it.each(["-1", "1.5", "abc", "11", "true", "1e1"])(
        "rejects the invalid value %s",
        async (value) => {
            vi.stubEnv("TRUST_PROXY_HOPS", value);

            await expect(loadEnv()).rejects.toThrow("TRUST_PROXY_HOPS");
        },
    );
});