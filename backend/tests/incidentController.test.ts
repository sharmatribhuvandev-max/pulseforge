
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../src/middleware/authMiddleware";

const { findOneMock, queryMock } = vi.hoisted(() => ({
    findOneMock: vi.fn(),
    queryMock: vi.fn(),
}));

vi.mock("../src/models/Project", () => ({
    Project: {
        findOne: findOneMock,
    },
}));

vi.mock("../src/db/postgres", () => ({
    postgresPool: {
        query: queryMock,
    },
}));

import { getProjectIncidents } from "../src/controllers/incidentController";

const PROJECT_ID = "507f1f77bcf86cd799439011";

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

function makeRequest(
    overrides: Record<string, unknown> = {},
) {
    return {
        userId: "user-123",
        params: { id: PROJECT_ID },
        ...overrides,
    } as AuthRequest;
}

describe("incidentController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects a malformed project ID before database lookup", async () => {
        const req = makeRequest({
            params: { id: "not-a-valid-object-id" },
        });
        const res = makeResponse();

        await getProjectIncidents(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Invalid project ID",
        });
        expect(findOneMock).not.toHaveBeenCalled();
        expect(queryMock).not.toHaveBeenCalled();
    });

    it("rejects an unauthenticated request", async () => {
        const req = makeRequest({ userId: undefined });
        const res = makeResponse();

        await getProjectIncidents(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(findOneMock).not.toHaveBeenCalled();
        expect(queryMock).not.toHaveBeenCalled();
    });

    it("returns 404 when the project is not owned by the user", async () => {
        findOneMock.mockResolvedValue(null);

        const req = makeRequest();
        const res = makeResponse();

        await getProjectIncidents(req, res);

        expect(findOneMock).toHaveBeenCalledWith({
            _id: PROJECT_ID,
            userId: "user-123",
        });
        expect(res.status).toHaveBeenCalledWith(404);
        expect(queryMock).not.toHaveBeenCalled();
    });

    it("separates active and resolved incidents", async () => {
        const activeIncident = {
            id: 1,
            resolved_at: null,
        };
        const resolvedIncident = {
            id: 2,
            resolved_at: new Date("2026-01-01T00:00:00Z"),
        };

        findOneMock.mockResolvedValue({
            _id: PROJECT_ID,
            userId: "user-123",
        });
        queryMock.mockResolvedValue({
            rows: [activeIncident, resolvedIncident],
        });

        const req = makeRequest();
        const res = makeResponse();

        await getProjectIncidents(req, res);

        expect(queryMock).toHaveBeenCalledWith(
            expect.stringContaining("WHERE project_id = $1"),
            [PROJECT_ID],
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            active: [activeIncident],
            resolved: [resolvedIncident],
        });
    });

    it("returns a generic error when PostgreSQL fails", async () => {
        const errorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        findOneMock.mockResolvedValue({
            _id: PROJECT_ID,
            userId: "user-123",
        });
        queryMock.mockRejectedValue(
            new Error("Database failure"),
        );

        const req = makeRequest();
        const res = makeResponse();

        try {
            await getProjectIncidents(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                message: "Failed to get incidents",
            });
        } finally {
            errorSpy.mockRestore();
        }
    });
});
