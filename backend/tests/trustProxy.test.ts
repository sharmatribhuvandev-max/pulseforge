import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { applyTrustProxy } from "../src/config/trustProxy";

async function createApp(hops: number) {
    vi.resetModules();

    const { authRateLimit } = await import("../src/middleware/authRateLimit");

    const app = express();
    applyTrustProxy(app, hops);

    app.post("/auth/signin", authRateLimit, (_req, res) => {
        res.status(200).json({ message: "Login handler reached" });
    });

    return app;
}

function signinFrom(app: express.Express, forwardedFor: string) {
    return request(app)
        .post("/auth/signin")
        .set("X-Forwarded-For", forwardedFor);
}

describe("Trust proxy and the authentication rate limiter", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("[characterization, passes before the fix] with 0 hops a spoofed X-Forwarded-For cannot bypass the limit", async () => {
        const app = await createApp(0);

        for (let i = 1; i <= 10; i++) {
            const response = await signinFrom(app, `198.51.100.${i}`);
            expect(response.status).toBe(200);
        }

        const limited = await signinFrom(app, "198.51.100.200");

        expect(limited.status).toBe(429);

        const codes = errorSpy.mock.calls.map(
            (args) => (args[0] as { code?: string } | undefined)?.code,
        );
        expect(codes).toContain("ERR_ERL_UNEXPECTED_X_FORWARDED_FOR");
    });

    it("with 1 hop, clients behind the proxy get separate buckets", async () => {
        const app = await createApp(1);

        for (let i = 0; i < 10; i++) {
            const response = await signinFrom(app, "203.0.113.10");
            expect(response.status).toBe(200);
        }

        const limited = await signinFrom(app, "203.0.113.10");
        expect(limited.status).toBe(429);

        const otherClient = await signinFrom(app, "203.0.113.20");
        expect(otherClient.status).toBe(200);
    });

    it("with 1 hop, a spoofed leftmost X-Forwarded-For entry does not change the bucket", async () => {
        const app = await createApp(1);

        for (let i = 1; i <= 10; i++) {
            const response = await signinFrom(
                app,
                `198.51.100.${i}, 203.0.113.10`,
            );
            expect(response.status).toBe(200);
        }

        const limited = await signinFrom(
            app,
            "198.51.100.200, 203.0.113.10",
        );
        expect(limited.status).toBe(429);

        const otherClient = await signinFrom(
            app,
            "198.51.100.1, 203.0.113.20",
        );
        expect(otherClient.status).toBe(200);
    });

    it("[characterization, passes before the fix] with 0 hops trust proxy stays false", () => {
        const app = express();

        applyTrustProxy(app, 0);

        expect(app.get("trust proxy")).toBe(false);
    });

    it("with 1 hop, trust proxy is the number 1", () => {
        const app = express();

        applyTrustProxy(app, 1);

        expect(app.get("trust proxy")).toBe(1);
    });
});