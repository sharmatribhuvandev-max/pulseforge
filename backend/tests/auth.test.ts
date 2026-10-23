
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";

vi.mock("../src/models/User", () => ({
    User: {
        findOne: vi.fn(),
        create: vi.fn()
    }
}));

vi.mock("../src/utils/password", () => ({
    hashPassword: vi.fn(),
    comparePassword: vi.fn()
}));

import { User } from "../src/models/User";
import {
    hashPassword,
    comparePassword
} from "../src/utils/password";
import {
    signup,
    signin
} from "../src/controllers/authController";
import { generateToken } from "../src/utils/jwt";
import { authMiddleware, AuthRequest } from "../src/middleware/authMiddleware";

function createResponse() {
    const res = {
        status: vi.fn(),
        json: vi.fn()
    } as unknown as Response;

    (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
    (res.json as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);

    return res;
}

function createRequest(body: unknown = {}): Request {
    return {
        body,
        headers: {}
    } as Request;
}

describe("PulseForge authentication", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Signup", () => {
        it("rejects missing required fields", async () => {
            const req = createRequest({
                name: "",
                email: "",
                password: ""
            });
            const res = createResponse();

            await signup(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Name, email and password are required"
            });
            expect(User.create).not.toHaveBeenCalled();
        });

        it("rejects an invalid email address", async () => {
            const req = createRequest({
                name: "Test User",
                email: "invalid-email",
                password: "password123"
            });
            const res = createResponse();

            await signup(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Please provide a valid email address"
            });
        });

        it("rejects passwords shorter than six characters", async () => {
            const req = createRequest({
                name: "Test User",
                email: "test@example.com",
                password: "12345"
            });
            const res = createResponse();

            await signup(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Password must be at least 6 characters"
            });
        });

        it("rejects an existing user", async () => {
            vi.mocked(User.findOne).mockResolvedValue({
                email: "test@example.com"
            } as never);

            const req = createRequest({
                name: "Test User",
                email: "test@example.com",
                password: "password123"
            });
            const res = createResponse();

            await signup(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({
                message: "User already exists"
            });
            expect(User.create).not.toHaveBeenCalled();
        });

        it("creates a user and returns a token", async () => {
            vi.mocked(User.findOne).mockResolvedValue(null as never);
            vi.mocked(hashPassword).mockResolvedValue("hashed-password");

            vi.mocked(User.create).mockResolvedValue({
                _id: { toString: () => "user-123" },
                name: "Test User",
                email: "test@example.com"
            } as never);

            const req = createRequest({
                name: " Test User ",
                email: " TEST@EXAMPLE.COM ",
                password: "password123"
            });
            const res = createResponse();

            await signup(req, res);

            expect(User.findOne).toHaveBeenCalledWith({
                email: "test@example.com"
            });
            expect(hashPassword).toHaveBeenCalledWith("password123");
            expect(User.create).toHaveBeenCalledWith({
                name: "Test User",
                email: "test@example.com",
                passwordHash: "hashed-password"
            });
            expect(res.status).toHaveBeenCalledWith(201);

            const responseBody = vi.mocked(res.json).mock.calls[0][0] as {
                token: string;
                user: { id: unknown; name: string; email: string };
            };

            expect(responseBody.token).toBeTruthy();
            expect(responseBody.user).toEqual({
                id: { toString: expect.any(Function) },
                name: "Test User",
                email: "test@example.com"
            });
        });
    });

    describe("Signin", () => {
        it("rejects missing credentials", async () => {
            const req = createRequest({});
            const res = createResponse();

            await signin(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Email and password are required"
            });
        });

        it("rejects an invalid email address", async () => {
            const req = createRequest({
                email: "invalid-email",
                password: "password123"
            });
            const res = createResponse();

            await signin(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Please provide a valid email address"
            });
        });

        it("rejects an unknown user", async () => {
            vi.mocked(User.findOne).mockResolvedValue(null as never);

            const req = createRequest({
                email: "unknown@example.com",
                password: "password123"
            });
            const res = createResponse();

            await signin(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid email or password"
            });
        });

        it("rejects an incorrect password", async () => {
            vi.mocked(User.findOne).mockResolvedValue({
                _id: { toString: () => "user-123" },
                name: "Test User",
                email: "test@example.com",
                passwordHash: "hashed-password"
            } as never);

            vi.mocked(comparePassword).mockResolvedValue(false);

            const req = createRequest({
                email: "test@example.com",
                password: "wrong-password"
            });
            const res = createResponse();

            await signin(req, res);

            expect(comparePassword).toHaveBeenCalledWith(
                "wrong-password",
                "hashed-password"
            );
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid email or password"
            });
        });

        it("signs in a user with valid credentials", async () => {
            vi.mocked(User.findOne).mockResolvedValue({
                _id: { toString: () => "user-123" },
                name: "Test User",
                email: "test@example.com",
                passwordHash: "hashed-password"
            } as never);

            vi.mocked(comparePassword).mockResolvedValue(true);

            const req = createRequest({
                email: " TEST@EXAMPLE.COM ",
                password: "password123"
            });
            const res = createResponse();

            await signin(req, res);

            expect(User.findOne).toHaveBeenCalledWith({
                email: "test@example.com"
            });
            expect(res.status).toHaveBeenCalledWith(200);

            const responseBody = vi.mocked(res.json).mock.calls[0][0] as {
                token: string;
                user: { name: string; email: string };
            };

            expect(responseBody.token).toBeTruthy();
            expect(responseBody.user).toEqual({
                id: { toString: expect.any(Function) },
                name: "Test User",
                email: "test@example.com"
            });
        });
    });

    describe("JWT authentication middleware", () => {
        it("rejects a missing authorization header", () => {
            const req = createRequest() as AuthRequest;
            const res = createResponse();
            const next = vi.fn();

            authMiddleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Authorization header is required"
            });
            expect(next).not.toHaveBeenCalled();
        });

        it("rejects an invalid authorization format", () => {
            const req = createRequest() as AuthRequest;
            req.headers.authorization = "Invalid token";

            const res = createResponse();
            const next = vi.fn();

            authMiddleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid authorization format"
            });
            expect(next).not.toHaveBeenCalled();
        });

        it("accepts a valid bearer token", () => {
            const token = generateToken("user-123");
            const req = createRequest() as AuthRequest;
            req.headers.authorization = `Bearer ${token}`;

            const res = createResponse();
            const next = vi.fn();

            authMiddleware(req, res, next);

            expect(req.userId).toBe("user-123");
            expect(next).toHaveBeenCalledOnce();
        });

        it("rejects an invalid token", () => {
            const req = createRequest() as AuthRequest;
            req.headers.authorization = "Bearer invalid-token";

            const res = createResponse();
            const next = vi.fn();

            authMiddleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid or expired token"
            });
            expect(next).not.toHaveBeenCalled();
        });
    });
});
