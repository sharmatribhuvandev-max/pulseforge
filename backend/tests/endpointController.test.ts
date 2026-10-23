import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../src/middleware/authMiddleware";

const PROJECT_ID = "507f1f77bcf86cd799439011";
const ENDPOINT_ID = "507f1f77bcf86cd799439012";
const OTHER_PROJECT_ID = "507f1f77bcf86cd799439013";

const {
    endpointCreateMock,
    endpointFindMock,
    endpointFindByIdMock,
    endpointDeleteOneMock,
    projectFindOneMock,
} = vi.hoisted(() => ({
    endpointCreateMock: vi.fn(),
    endpointFindMock: vi.fn(),
    endpointFindByIdMock: vi.fn(),
    endpointDeleteOneMock: vi.fn(),
    projectFindOneMock: vi.fn(),
}));

vi.mock("../src/models/Endpoint", () => ({
    Endpoint: {
        create: endpointCreateMock,
        find: endpointFindMock,
        findById: endpointFindByIdMock,
        deleteOne: endpointDeleteOneMock,
    },
}));

vi.mock("../src/models/Project", () => ({
    Project: {
        findOne: projectFindOneMock,
    },
}));

import {
    createEndpoint,
    getEndpoints,
    deleteEndpoint,
} from "../src/controllers/endpointController";

function makeResponse() {
    const res = {
        status: vi.fn(),
        json: vi.fn(),
    };

    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);

    return res as unknown as Response & {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
        userId: "user-123",
        body: {},
        params: {},
        ...overrides,
    } as AuthRequest;
}

describe("endpointController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("createEndpoint", () => {
        it("returns 401 when the user is unauthenticated", async () => {
            const req = makeRequest({
                userId: undefined,
                body: {
                    projectId: PROJECT_ID,
                    name: "Test endpoint",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(endpointCreateMock).not.toHaveBeenCalled();
            expect(projectFindOneMock).not.toHaveBeenCalled();
        });

        it("rejects missing required fields", async () => {
            const req = makeRequest({ body: {} });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "projectId, name, url and method are required",
                error: "MISSING_ENDPOINT_FIELDS",
            });
            expect(projectFindOneMock).not.toHaveBeenCalled();
        });

        it("rejects a malformed project ID", async () => {
            const req = makeRequest({
                body: {
                    projectId: "not-a-valid-object-id",
                    name: "Test endpoint",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project ID",
                error: "INVALID_PROJECT_ID",
            });
            expect(projectFindOneMock).not.toHaveBeenCalled();
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it("rejects a blank endpoint name", async () => {
            const req = makeRequest({
                body: {
                    projectId: PROJECT_ID,
                    name: "   ",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint name is required",
                error: "INVALID_ENDPOINT_NAME",
            });
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it("rejects an endpoint name longer than 200 characters", async () => {
            const req = makeRequest({
                body: {
                    projectId: PROJECT_ID,
                    name: "A".repeat(201),
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint name must be 200 characters or less",
                error: "INVALID_ENDPOINT_NAME",
            });
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it.each([
            "not-a-url",
            "ftp://example.com/file",
            "javascript:alert(1)",
        ])("rejects an invalid URL: %s", async (url) => {
            const req = makeRequest({
                body: {
                    projectId: PROJECT_ID,
                    name: "Test endpoint",
                    url,
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid endpoint URL",
                error: "INVALID_ENDPOINT_URL",
            });
            expect(projectFindOneMock).not.toHaveBeenCalled();
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it.each(["HEAD", "OPTIONS", "TRACE", "INVALID"])(
            "rejects unsupported HTTP method: %s",
            async (method) => {
                const req = makeRequest({
                    body: {
                        projectId: PROJECT_ID,
                        name: "Test endpoint",
                        url: "https://example.com",
                        method,
                    },
                });
                const res = makeResponse();

                await createEndpoint(req, res);

                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({
                    message: "Invalid HTTP method",
                    error: "INVALID_HTTP_METHOD",
                });
                expect(projectFindOneMock).not.toHaveBeenCalled();
                expect(endpointCreateMock).not.toHaveBeenCalled();
            },
        );

        it("returns 404 when the project is not owned by the user", async () => {
            projectFindOneMock.mockResolvedValue(null);

            const req = makeRequest({
                body: {
                    projectId: PROJECT_ID,
                    name: "Test endpoint",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: PROJECT_ID,
                userId: "user-123",
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Project not found",
                error: "PROJECT_NOT_FOUND",
            });
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it("creates an endpoint with trimmed name, URL, and normalized method", async () => {
            projectFindOneMock.mockResolvedValue({
                _id: { toString: () => PROJECT_ID },
            });

            const endpoint = { _id: ENDPOINT_ID };
            endpointCreateMock.mockResolvedValue(endpoint);

            const req = makeRequest({
                body: {
                    projectId: PROJECT_ID,
                    name: "  Health check  ",
                    url: "  https://example.com/health  ",
                    method: " get ",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: PROJECT_ID,
                userId: "user-123",
            });
            expect(endpointCreateMock).toHaveBeenCalledWith({
                projectId: PROJECT_ID,
                name: "Health check",
                url: "https://example.com/health",
                method: "GET",
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint created successfully",
                endpoint,
            });
        });

        it("returns 500 when endpoint creation fails", async () => {
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => { });

            projectFindOneMock.mockResolvedValue({
                _id: { toString: () => PROJECT_ID },
            });
            endpointCreateMock.mockRejectedValue(
                new Error("Database failure"),
            );

            const req = makeRequest({
                body: {
                    projectId: PROJECT_ID,
                    name: "Health check",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            try {
                await createEndpoint(req, res);

                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith({
                    message: "Internal server error",
                    error: "INTERNAL_SERVER_ERROR",
                });
            } finally {
                errorSpy.mockRestore();
            }
        });
    });

    describe("getEndpoints", () => {
        it("rejects a missing project ID", async () => {
            const req = makeRequest({ params: {} });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(projectFindOneMock).not.toHaveBeenCalled();
            expect(endpointFindMock).not.toHaveBeenCalled();
        });

        it("rejects a malformed project ID", async () => {
            const req = makeRequest({
                params: { projectId: "not-a-valid-object-id" },
            });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project ID",
                error: "INVALID_PROJECT_ID",
            });
            expect(projectFindOneMock).not.toHaveBeenCalled();
            expect(endpointFindMock).not.toHaveBeenCalled();
        });

        it("returns 401 when the user is unauthenticated", async () => {
            const req = makeRequest({
                userId: undefined,
                params: { projectId: PROJECT_ID },
            });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Unauthorized",
                error: "UNAUTHORIZED",
            });
            expect(projectFindOneMock).not.toHaveBeenCalled();
            expect(endpointFindMock).not.toHaveBeenCalled();
        });

        it("returns 404 when the project is not owned by the user", async () => {
            projectFindOneMock.mockResolvedValue(null);

            const req = makeRequest({
                params: { projectId: PROJECT_ID },
            });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: PROJECT_ID,
                userId: "user-123",
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Project not found",
                error: "PROJECT_NOT_FOUND",
            });
            expect(endpointFindMock).not.toHaveBeenCalled();
        });

        it("returns endpoints for an owned project, newest first", async () => {
            const project = { _id: PROJECT_ID };
            const endpoints = [{ _id: ENDPOINT_ID }];
            const sortMock = vi.fn().mockResolvedValue(endpoints);

            projectFindOneMock.mockResolvedValue(project);
            endpointFindMock.mockReturnValue({ sort: sortMock });

            const req = makeRequest({
                params: { projectId: PROJECT_ID },
            });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: PROJECT_ID,
                userId: "user-123",
            });
            expect(endpointFindMock).toHaveBeenCalledWith({
                projectId: project._id,
            });
            expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ endpoints });
        });
    });

    describe("deleteEndpoint", () => {
        it("rejects a missing endpoint ID", async () => {
            const req = makeRequest({ params: {} });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(endpointFindByIdMock).not.toHaveBeenCalled();
        });

        it("rejects a malformed endpoint ID", async () => {
            const req = makeRequest({
                params: { endpointId: "not-a-valid-object-id" },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid endpoint ID",
                error: "INVALID_ENDPOINT_ID",
            });
            expect(endpointFindByIdMock).not.toHaveBeenCalled();
            expect(endpointDeleteOneMock).not.toHaveBeenCalled();
        });

        it("returns 401 when the user is unauthenticated", async () => {
            const req = makeRequest({
                userId: undefined,
                params: { endpointId: ENDPOINT_ID },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Unauthorized",
                error: "UNAUTHORIZED",
            });
            expect(endpointFindByIdMock).not.toHaveBeenCalled();
        });

        it("returns 404 when the endpoint does not exist", async () => {
            endpointFindByIdMock.mockResolvedValue(null);

            const req = makeRequest({
                params: { endpointId: ENDPOINT_ID },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(endpointFindByIdMock).toHaveBeenCalledWith(ENDPOINT_ID);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND",
            });
            expect(endpointDeleteOneMock).not.toHaveBeenCalled();
        });

        it("does not delete an endpoint belonging to another user's project", async () => {
            endpointFindByIdMock.mockResolvedValue({
                _id: ENDPOINT_ID,
                projectId: OTHER_PROJECT_ID,
            });
            projectFindOneMock.mockResolvedValue(null);

            const req = makeRequest({
                params: { endpointId: ENDPOINT_ID },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: OTHER_PROJECT_ID,
                userId: "user-123",
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND",
            });
            expect(endpointDeleteOneMock).not.toHaveBeenCalled();
        });

        it("deletes an endpoint belonging to the authenticated user's project", async () => {
            endpointFindByIdMock.mockResolvedValue({
                _id: ENDPOINT_ID,
                projectId: PROJECT_ID,
            });
            projectFindOneMock.mockResolvedValue({
                _id: PROJECT_ID,
            });
            endpointDeleteOneMock.mockResolvedValue({ deletedCount: 1 });

            const req = makeRequest({
                params: { endpointId: ENDPOINT_ID },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(endpointFindByIdMock).toHaveBeenCalledWith(ENDPOINT_ID);
            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: PROJECT_ID,
                userId: "user-123",
            });
            expect(endpointDeleteOneMock).toHaveBeenCalledWith({
                _id: ENDPOINT_ID,
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint deleted successfully",
                endpointId: ENDPOINT_ID,
            });
        });
    });
});
