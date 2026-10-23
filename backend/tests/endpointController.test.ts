import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../src/middleware/authMiddleware";

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
                    projectId: "project-123",
                    name: "Test endpoint",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(endpointCreateMock).not.toHaveBeenCalled();
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
        });

        it("rejects a blank endpoint name", async () => {
            const req = makeRequest({
                body: {
                    projectId: "project-123",
                    name: "   ",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it("rejects an endpoint name longer than 200 characters", async () => {
            const req = makeRequest({
                body: {
                    projectId: "project-123",
                    name: "A".repeat(201),
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it.each([
            "not-a-url",
            "ftp://example.com/file",
            "javascript:alert(1)",
        ])("rejects an invalid URL: %s", async (url) => {
            const req = makeRequest({
                body: {
                    projectId: "project-123",
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
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it.each(["HEAD", "OPTIONS", "TRACE", "INVALID"])(
            "rejects unsupported HTTP method: %s",
            async (method) => {
                const req = makeRequest({
                    body: {
                        projectId: "project-123",
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
                expect(endpointCreateMock).not.toHaveBeenCalled();
            },
        );

        it("returns 404 when the project is not owned by the user", async () => {
            projectFindOneMock.mockResolvedValue(null);

            const req = makeRequest({
                body: {
                    projectId: "project-123",
                    name: "Test endpoint",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: "project-123",
                userId: "user-123",
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(endpointCreateMock).not.toHaveBeenCalled();
        });

        it("creates an endpoint with trimmed name, URL, and normalized method", async () => {
            projectFindOneMock.mockResolvedValue({
                _id: { toString: () => "project-123" },
            });
            const endpoint = { _id: "endpoint-123" };
            endpointCreateMock.mockResolvedValue(endpoint);

            const req = makeRequest({
                body: {
                    projectId: "project-123",
                    name: "  Health check  ",
                    url: "  https://example.com/health  ",
                    method: " get ",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(endpointCreateMock).toHaveBeenCalledWith({
                projectId: "project-123",
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
                _id: { toString: () => "project-123" },
            });
            endpointCreateMock.mockRejectedValue(
                new Error("Database failure"),
            );

            const req = makeRequest({
                body: {
                    projectId: "project-123",
                    name: "Health check",
                    url: "https://example.com",
                    method: "GET",
                },
            });
            const res = makeResponse();

            await createEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

            errorSpy.mockRestore();
        });
    });

    describe("getEndpoints", () => {
        it("rejects a missing project ID", async () => {
            const req = makeRequest({ params: {} });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(projectFindOneMock).not.toHaveBeenCalled();
        });

        it("returns 401 when the user is unauthenticated", async () => {
            const req = makeRequest({
                userId: undefined,
                params: { projectId: "project-123" },
            });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(endpointFindMock).not.toHaveBeenCalled();
        });

        it("returns 404 when the project is not owned by the user", async () => {
            projectFindOneMock.mockResolvedValue(null);

            const req = makeRequest({
                params: { projectId: "project-123" },
            });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(endpointFindMock).not.toHaveBeenCalled();
        });

        it("returns endpoints for an owned project, newest first", async () => {
            const project = { _id: "project-123" };
            const endpoints = [{ _id: "endpoint-123" }];
            const sortMock = vi.fn().mockResolvedValue(endpoints);

            projectFindOneMock.mockResolvedValue(project);
            endpointFindMock.mockReturnValue({ sort: sortMock });

            const req = makeRequest({
                params: { projectId: "project-123" },
            });
            const res = makeResponse();

            await getEndpoints(req, res);

            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: "project-123",
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
        });

        it("returns 401 when the user is unauthenticated", async () => {
            const req = makeRequest({
                userId: undefined,
                params: { endpointId: "endpoint-123" },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(endpointFindByIdMock).not.toHaveBeenCalled();
        });

        it("returns 404 when the endpoint does not exist", async () => {
            endpointFindByIdMock.mockResolvedValue(null);

            const req = makeRequest({
                params: { endpointId: "endpoint-123" },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(endpointDeleteOneMock).not.toHaveBeenCalled();
        });

        it("does not delete an endpoint belonging to another user's project", async () => {
            endpointFindByIdMock.mockResolvedValue({
                _id: { toString: () => "endpoint-123" },
                projectId: "another-project",
            });
            projectFindOneMock.mockResolvedValue(null);

            const req = makeRequest({
                params: { endpointId: "endpoint-123" },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(projectFindOneMock).toHaveBeenCalledWith({
                _id: "another-project",
                userId: "user-123",
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(endpointDeleteOneMock).not.toHaveBeenCalled();
        });

        it("deletes an endpoint belonging to the authenticated user's project", async () => {
            endpointFindByIdMock.mockResolvedValue({
                _id: "endpoint-123",
                projectId: "project-123",
            });
            projectFindOneMock.mockResolvedValue({
                _id: "project-123",
            });
            endpointDeleteOneMock.mockResolvedValue({ deletedCount: 1 });

            const req = makeRequest({
                params: { endpointId: "endpoint-123" },
            });
            const res = makeResponse();

            await deleteEndpoint(req, res);

            expect(endpointDeleteOneMock).toHaveBeenCalledWith({
                _id: "endpoint-123",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint deleted successfully",
                endpointId: "endpoint-123",
            });
        });
    });
});
