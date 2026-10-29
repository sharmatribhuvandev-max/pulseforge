import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../src/middleware/authMiddleware";

const { createMock, authorizeProjectForUserMock } = vi.hoisted(() => ({
    createMock: vi.fn(),
    authorizeProjectForUserMock: vi.fn(),
}));

vi.mock("../src/models/Project", () => ({
    Project: {
        create: createMock,
    },
}));

vi.mock("../src/services/websocketService", () => ({
    authorizeProjectForUser: authorizeProjectForUserMock,
}));

import { createProject } from "../src/controllers/projectController";

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

function makeRequest(body: Record<string, unknown>) {
    return {
        userId: "user-123",
        body,
        params: {},
    } as unknown as AuthRequest;
}

describe("createProject live event authorization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    it("authorizes the new project for the creating user's open connections", async () => {
        createMock.mockResolvedValue({ _id: "project-new", name: "New" });
        const res = makeResponse();

        await createProject(makeRequest({ name: "New" }), res);

        expect(authorizeProjectForUserMock).toHaveBeenCalledOnce();
        expect(authorizeProjectForUserMock).toHaveBeenCalledWith(
            "user-123",
            "project-new"
        );
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it("does not authorize anything when validation fails", async () => {
        const res = makeResponse();

        await createProject(makeRequest({ name: "   " }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(createMock).not.toHaveBeenCalled();
        expect(authorizeProjectForUserMock).not.toHaveBeenCalled();
    });

    it("does not authorize anything when the project cannot be created", async () => {
        createMock.mockRejectedValue(new Error("database unavailable"));
        const res = makeResponse();

        await createProject(makeRequest({ name: "New" }), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(authorizeProjectForUserMock).not.toHaveBeenCalled();
    });
});