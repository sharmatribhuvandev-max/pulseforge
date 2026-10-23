import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../src/middleware/authMiddleware";

const { createMock, findMock, findOneAndDeleteMock } = vi.hoisted(() => ({
    createMock: vi.fn(),
    findMock: vi.fn(),
    findOneAndDeleteMock: vi.fn(),
}));

vi.mock("../src/models/Project", () => ({
    Project: {
        create: createMock,
        find: findMock,
        findOneAndDelete: findOneAndDeleteMock,
    },
}));

import {
    createProject,
    getProjects,
    deleteProject,
} from "../src/controllers/projectController";

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

describe("projectController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("createProject", () => {
        it("returns 401 when the user is unauthenticated", async () => {
            const req = makeRequest({ userId: undefined });
            const res = makeResponse();

            await createProject(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Unauthorized",
            });
            expect(createMock).not.toHaveBeenCalled();
        });

        it("rejects a missing project name", async () => {
            const req = makeRequest({ body: {} });
            const res = makeResponse();

            await createProject(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(createMock).not.toHaveBeenCalled();
        });

        it("rejects a project name longer than 100 characters", async () => {
            const req = makeRequest({
                body: { name: "A".repeat(101) },
            });
            const res = makeResponse();

            await createProject(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(createMock).not.toHaveBeenCalled();
        });

        it("rejects a non-string description", async () => {
            const req = makeRequest({
                body: { name: "Test Project", description: 123 },
            });
            const res = makeResponse();

            await createProject(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(createMock).not.toHaveBeenCalled();
        });

        it("rejects a description longer than 500 characters", async () => {
            const req = makeRequest({
                body: {
                    name: "Test Project",
                    description: "A".repeat(501),
                },
            });
            const res = makeResponse();

            await createProject(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(createMock).not.toHaveBeenCalled();
        });

        it("creates a project with trimmed values", async () => {
            const project = {
                _id: "project-123",
                name: "Test Project",
                description: "API monitoring",
                userId: "user-123",
            };

            createMock.mockResolvedValue(project);

            const req = makeRequest({
                body: {
                    name: "  Test Project  ",
                    description: "  API monitoring  ",
                },
            });
            const res = makeResponse();

            await createProject(req, res);

            expect(createMock).toHaveBeenCalledWith({
                name: "Test Project",
                userId: "user-123",
                description: "API monitoring",
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: "Project created successfully",
                project,
            });
        });

        it("omits an empty description", async () => {
            createMock.mockResolvedValue({ name: "Test Project" });

            const req = makeRequest({
                body: {
                    name: "Test Project",
                    description: "   ",
                },
            });
            const res = makeResponse();

            await createProject(req, res);

            expect(createMock).toHaveBeenCalledWith({
                name: "Test Project",
                userId: "user-123",
            });
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it("returns 500 when project creation fails", async () => {
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => { });

            createMock.mockRejectedValue(new Error("Database failure"));

            const req = makeRequest({
                body: { name: "Test Project" },
            });
            const res = makeResponse();

            await createProject(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

            errorSpy.mockRestore();
        });
    });

    describe("getProjects", () => {
        it("returns 401 when the user is unauthenticated", async () => {
            const req = makeRequest({ userId: undefined });
            const res = makeResponse();

            await getProjects(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(findMock).not.toHaveBeenCalled();
        });

        it("returns only the authenticated user's projects", async () => {
            const projects = [{ _id: "project-123", name: "Test Project" }];
            const sortMock = vi.fn().mockResolvedValue(projects);

            findMock.mockReturnValue({ sort: sortMock });

            const req = makeRequest();
            const res = makeResponse();

            await getProjects(req, res);

            expect(findMock).toHaveBeenCalledWith({
                userId: "user-123",
            });
            expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ projects });
        });

        it("returns 500 when fetching projects fails", async () => {
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => { });

            findMock.mockImplementation(() => {
                throw new Error("Database failure");
            });

            const req = makeRequest();
            const res = makeResponse();

            await getProjects(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

            errorSpy.mockRestore();
        });
    });

    describe("deleteProject", () => {
        it("returns 401 when the user is unauthenticated", async () => {
            const req = makeRequest({ userId: undefined });
            const res = makeResponse();

            await deleteProject(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(findOneAndDeleteMock).not.toHaveBeenCalled();
        });

        it("rejects a missing project ID", async () => {
            const req = makeRequest({ params: {} });
            const res = makeResponse();

            await deleteProject(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });


        it("rejects a malformed project ID before database lookup", async () => {
            const req = makeRequest({
                params: { id: "not-a-valid-object-id" },
            });
            const res = makeResponse();

            await deleteProject(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project ID",
            });
            expect(findOneAndDeleteMock).not.toHaveBeenCalled();
        });

        it("returns 404 when the user's project does not exist", async () => {
            findOneAndDeleteMock.mockResolvedValue(null);

            const req = makeRequest({
                params: { id: "507f1f77bcf86cd799439011" },
            });
            const res = makeResponse();

            await deleteProject(req, res);

            expect(findOneAndDeleteMock).toHaveBeenCalledWith({
                _id: "507f1f77bcf86cd799439011",
                userId: "user-123",
            });

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("deletes the authenticated user's project", async () => {
            findOneAndDeleteMock.mockResolvedValue({
                _id: "project-123",
            });

            const req = makeRequest({
                params: { id: "507f1f77bcf86cd799439012" },
            });
            const res = makeResponse();

            await deleteProject(req, res);

            expect(findOneAndDeleteMock).toHaveBeenCalledWith({
                _id: "507f1f77bcf86cd799439012",
                userId: "user-123",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Project deleted successfully",
            });
        });
    });
});
