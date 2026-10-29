
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../src/middleware/authMiddleware";

const {
    findOneMock,
    getProjectAnalyticsMock,
    getLatencyHistoryMock,
    getEndpointAnalyticsMock,
    getRecentApiEventsMock,
} = vi.hoisted(() => ({
    findOneMock: vi.fn(),
    getProjectAnalyticsMock: vi.fn(),
    getLatencyHistoryMock: vi.fn(),
    getEndpointAnalyticsMock: vi.fn(),
    getRecentApiEventsMock: vi.fn(),
}));

vi.mock("../src/models/Project", () => ({
    Project: {
        findOne: findOneMock,
    },
}));

vi.mock("../src/services/analyticsService", () => ({
    getProjectAnalytics: getProjectAnalyticsMock,
    getLatencyHistory: getLatencyHistoryMock,
    getEndpointAnalytics: getEndpointAnalyticsMock,
    getRecentApiEvents: getRecentApiEventsMock,
}));

import {
    getAnalytics,
    getLatencyHistoryData,
    getEndpointAnalyticsData,
    getRecentApiEventsData,
} from "../src/controllers/analyticsController";

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
        params: { projectId: PROJECT_ID },
        query: {},
        ...overrides,
    } as AuthRequest;
}

const handlers = [
    ["getAnalytics", getAnalytics, getProjectAnalyticsMock],
    ["getLatencyHistoryData", getLatencyHistoryData, getLatencyHistoryMock],
    ["getEndpointAnalyticsData", getEndpointAnalyticsData, getEndpointAnalyticsMock],
    ["getRecentApiEventsData", getRecentApiEventsData, getRecentApiEventsMock],
] as const;

describe("analyticsController", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        findOneMock.mockResolvedValue({
            _id: PROJECT_ID,
            userId: "user-123",
        });

        getProjectAnalyticsMock.mockResolvedValue({});
        getLatencyHistoryMock.mockResolvedValue([]);
        getEndpointAnalyticsMock.mockResolvedValue([]);
        getRecentApiEventsMock.mockResolvedValue([]);
    });

    describe.each(handlers)("%s", (_name, handler, serviceMock) => {
        it("rejects a malformed project ID before database access", async () => {
            const req = makeRequest({
                params: { projectId: "not-a-valid-object-id" },
            });
            const res = makeResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project ID",
            });
            expect(findOneMock).not.toHaveBeenCalled();
            expect(serviceMock).not.toHaveBeenCalled();
        });

        it("rejects an unauthenticated request", async () => {
            const req = makeRequest({ userId: undefined });
            const res = makeResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(findOneMock).not.toHaveBeenCalled();
            expect(serviceMock).not.toHaveBeenCalled();
        });

        it("returns 404 when the project is not owned by the user", async () => {
            findOneMock.mockResolvedValue(null);

            const req = makeRequest();
            const res = makeResponse();

            await handler(req, res);

            expect(findOneMock).toHaveBeenCalledWith({
                _id: PROJECT_ID,
                userId: "user-123",
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(serviceMock).not.toHaveBeenCalled();
        });
    });

    it("ignores a non-finite minutes filter", async () => {
        const req = makeRequest({
            query: { minutes: "Infinity" },
        });
        const res = makeResponse();

        await getAnalytics(req, res);

        expect(getProjectAnalyticsMock).toHaveBeenCalledWith(
            PROJECT_ID,
            {},
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("passes valid analytics filters to the service", async () => {
        const req = makeRequest({
            query: {
                minutes: "15",
                endpoint: " /api/orders ",
                method: "get",
                status: "success",
            },
        });
        const res = makeResponse();

        await getAnalytics(req, res);

        expect(getProjectAnalyticsMock).toHaveBeenCalledWith(
            PROJECT_ID,
            {
                minutes: 15,
                endpoint: "/api/orders",
                method: "GET",
                status: "success",
            },
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
