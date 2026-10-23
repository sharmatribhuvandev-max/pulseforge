import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

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

import app from "../src/app";

describe("Express app HTTP integration", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the API running message from GET /", async () => {
        const response = await request(app).get("/");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            message: "PulseForge API is running",
        });
    });

    it("returns success from GET /test-success", async () => {
        const response = await request(app).get("/test-success");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            message: "Test API successful",
        });
    });

    it("returns JSON for an unknown route", async () => {
        const response = await request(app).get("/route-that-does-not-exist");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            message: "Route not found: GET /route-that-does-not-exist",
        });
    });

    it("accepts a JSON request body", async () => {
        const response = await request(app)
            .post("/route-that-does-not-exist")
            .send({ test: true });

        expect(response.status).toBe(404);
        expect(response.body.message).toBe(
            "Route not found: POST /route-that-does-not-exist",
        );
    });

    it("sets the configured CORS origin", async () => {
        const response = await request(app)
            .get("/")
            .set("Origin", "http://localhost:5173");

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBe(
            "http://localhost:5173",
        );
    });
});
