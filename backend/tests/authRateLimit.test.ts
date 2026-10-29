
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { authRateLimit } from "../src/middleware/authRateLimit";

describe("Authentication rate limiter", () => {
    it("allows 10 requests and rejects the 11th within the window", async () => {
        const app = express();

        app.post("/auth/signin", authRateLimit, (_req, res) => {
            res.status(200).json({ message: "Login handler reached" });
        });

        for (let i = 0; i < 10; i++) {
            const response = await request(app).post("/auth/signin");
            expect(response.status).toBe(200);
        }

        const limitedResponse = await request(app).post("/auth/signin");

        expect(limitedResponse.status).toBe(429);
        expect(limitedResponse.body).toEqual({
            message: "Too many authentication attempts. Please try again later.",
        });
    });
});
