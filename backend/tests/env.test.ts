import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({
    default: { config: vi.fn() },
}));

async function loadEnv() {
    vi.resetModules();
    const module = await import("../src/config/env");
    return module.env;
}

describe("Environment configuration: FRONTEND_URL", () => {
    beforeEach(() => {
        vi.stubEnv("MONGO_URI", "mongodb://placeholder");
        vi.stubEnv("JWT_SECRET", "placeholder-secret-for-tests");
        vi.stubEnv("POSTGRES_PASSWORD", "placeholder");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults to the local Vite origin when unset", async () => {
        vi.stubEnv("FRONTEND_URL", "");

        const env = await loadEnv();

        expect(env.frontendUrl).toBe("http://localhost:5173");
    });

    it("keeps a clean origin unchanged", async () => {
        vi.stubEnv("FRONTEND_URL", "https://app.example.com");

        const env = await loadEnv();

        expect(env.frontendUrl).toBe("https://app.example.com");
    });

    it("removes a bare trailing slash so it matches the browser Origin header", async () => {
        vi.stubEnv("FRONTEND_URL", "https://app.example.com/");

        const env = await loadEnv();

        expect(env.frontendUrl).toBe("https://app.example.com");
    });

    it("keeps an explicit port and drops the trailing slash", async () => {
        vi.stubEnv("FRONTEND_URL", "http://localhost:5173/");

        const env = await loadEnv();

        expect(env.frontendUrl).toBe("http://localhost:5173");
    });

    it("rejects a URL that includes a path", async () => {
        vi.stubEnv("FRONTEND_URL", "https://app.example.com/dashboard");

        await expect(loadEnv()).rejects.toThrow("FRONTEND_URL");
    });

    it("rejects a URL that includes a query string or fragment", async () => {
        vi.stubEnv("FRONTEND_URL", "https://app.example.com/?a=1");
        await expect(loadEnv()).rejects.toThrow("FRONTEND_URL");

        vi.stubEnv("FRONTEND_URL", "https://app.example.com/#top");
        await expect(loadEnv()).rejects.toThrow("FRONTEND_URL");
    });

    it("still rejects credentials and non-HTTP protocols", async () => {
        vi.stubEnv("FRONTEND_URL", "https://user:pass@app.example.com");
        await expect(loadEnv()).rejects.toThrow("FRONTEND_URL");

        vi.stubEnv("FRONTEND_URL", "ftp://app.example.com");
        await expect(loadEnv()).rejects.toThrow("FRONTEND_URL");
    });
});