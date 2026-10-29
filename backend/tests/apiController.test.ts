import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../src/middleware/authMiddleware";

vi.mock("../src/models/Endpoint", () => ({
    Endpoint: { findById: vi.fn() },
}));

vi.mock("../src/models/Project", () => ({
    Project: { findOne: vi.fn() },
}));

vi.mock("../src/db/postgres", () => ({
    postgresPool: { query: vi.fn() },
}));

vi.mock("../src/services/monitorService", () => ({
    monitorApi: vi.fn(),
}));

vi.mock("../src/services/chaosService", () => ({
    getActiveChaosRule: vi.fn(),
    applyLatency: vi.fn(),
    shouldInjectError: vi.fn(),
}));

vi.mock("../src/services/websocketService", () => ({
    broadcast: vi.fn(),
}));

vi.mock("../src/services/incidentService", () => ({
    checkErrorRate: vi.fn(),
    checkLatency: vi.fn(),
}));

import { Endpoint } from "../src/models/Endpoint";
import { Project } from "../src/models/Project";
import { postgresPool } from "../src/db/postgres";
import { monitorApi } from "../src/services/monitorService";
import {
    getActiveChaosRule,
    applyLatency,
    shouldInjectError,
} from "../src/services/chaosService";
import { broadcast } from "../src/services/websocketService";
import { checkErrorRate, checkLatency } from "../src/services/incidentService";
import { checkApi } from "../src/controllers/apiController";

const ENDPOINT_ID = "64b000000000000000000001";
const PROJECT_ID = "64b000000000000000000002";
const URL = "https://example.com/health";

function mockResponse() {
    const res = {
        status: vi.fn(),
        json: vi.fn(),
    } as unknown as Response;

    vi.mocked(res.status).mockReturnValue(res);
    vi.mocked(res.json).mockReturnValue(res);

    return res;
}

function mockRequest(id: unknown, userId?: string) {
    return {
        params: { id },
        userId,
    } as unknown as AuthRequest;
}

function foundEndpoint() {
    vi.mocked(Endpoint.findById).mockResolvedValue({
        _id: { toString: () => ENDPOINT_ID },
        projectId: PROJECT_ID,
        url: URL,
        method: "GET",
    } as never);
}

function ownedProject() {
    vi.mocked(Project.findOne).mockResolvedValue({
        _id: { toString: () => PROJECT_ID },
    } as never);
}

describe("checkApi controller", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    it("rejects a missing, array, or malformed endpoint ID before any lookup", async () => {
        for (const badId of [undefined, ["a"], "not-an-object-id"]) {
            const res = mockResponse();

            await checkApi(mockRequest(badId, "user-1"), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: "Invalid endpoint ID" });
        }

        expect(Endpoint.findById).not.toHaveBeenCalled();
        expect(monitorApi).not.toHaveBeenCalled();
    });

    it("rejects an unauthenticated request before any lookup", async () => {
        const res = mockResponse();

        await checkApi(mockRequest(ENDPOINT_ID, undefined), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(Endpoint.findById).not.toHaveBeenCalled();
        expect(monitorApi).not.toHaveBeenCalled();
    });

    it("returns 404 when the endpoint does not exist", async () => {
        vi.mocked(Endpoint.findById).mockResolvedValue(null as never);
        const res = mockResponse();

        await checkApi(mockRequest(ENDPOINT_ID, "user-1"), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(monitorApi).not.toHaveBeenCalled();
    });

    it("returns the same 404 for another user's endpoint and filters the project by user", async () => {
        foundEndpoint();
        vi.mocked(Project.findOne).mockResolvedValue(null as never);
        const res = mockResponse();

        await checkApi(mockRequest(ENDPOINT_ID, "user-2"), res);

        expect(Project.findOne).toHaveBeenCalledWith({
            _id: PROJECT_ID,
            userId: "user-2",
        });
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "Endpoint not found" });
        expect(monitorApi).not.toHaveBeenCalled();
    });

    it("monitors the real API once and leaves incident checks to monitorApi", async () => {
        foundEndpoint();
        ownedProject();
        vi.mocked(getActiveChaosRule).mockResolvedValue(null as never);

        const monitorResult = {
            requestId: 7,
            statusCode: 200,
            latency: 120,
            success: true,
        };
        vi.mocked(monitorApi).mockResolvedValue(monitorResult as never);

        const res = mockResponse();

        await checkApi(mockRequest(ENDPOINT_ID, "user-1"), res);

        expect(monitorApi).toHaveBeenCalledOnce();
        expect(monitorApi).toHaveBeenCalledWith(PROJECT_ID, URL, "GET", 0);

        expect(checkErrorRate).not.toHaveBeenCalled();
        expect(checkLatency).not.toHaveBeenCalled();

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "API checked successfully",
            result: monitorResult,
        });
    });

    it("applies chaos latency and passes it to monitorApi when no error is injected", async () => {
        foundEndpoint();
        ownedProject();
        vi.mocked(getActiveChaosRule).mockResolvedValue({
            latency: 1500,
            errorRate: 0,
            statusCode: 500,
        } as never);
        vi.mocked(shouldInjectError).mockReturnValue(false);
        vi.mocked(monitorApi).mockResolvedValue({
            requestId: 8,
            statusCode: 200,
            latency: 1600,
            success: true,
        } as never);

        const res = mockResponse();

        await checkApi(mockRequest(ENDPOINT_ID, "user-1"), res);

        expect(applyLatency).toHaveBeenCalledWith(1500);
        expect(monitorApi).toHaveBeenCalledWith(PROJECT_ID, URL, "GET", 1500);
        expect(checkErrorRate).not.toHaveBeenCalled();
        expect(checkLatency).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("stores, counts, and broadcasts an injected chaos error without calling the real API", async () => {
        foundEndpoint();
        ownedProject();
        vi.mocked(getActiveChaosRule).mockResolvedValue({
            latency: 0,
            errorRate: 100,
            statusCode: 503,
        } as never);
        vi.mocked(shouldInjectError).mockReturnValue(true);
        vi.mocked(postgresPool.query).mockResolvedValue({ rows: [] } as never);

        const res = mockResponse();

        await checkApi(mockRequest(ENDPOINT_ID, "user-1"), res);

        expect(monitorApi).not.toHaveBeenCalled();
        expect(applyLatency).not.toHaveBeenCalled();

        expect(postgresPool.query).toHaveBeenCalledOnce();
        const [sql, values] = vi.mocked(postgresPool.query).mock.calls[0] as [
            string,
            unknown[],
        ];
        expect(sql).toContain("INSERT INTO api_requests");
        expect(values).toEqual([
            PROJECT_ID,
            URL,
            "GET",
            503,
            expect.any(Number),
            true,
        ]);

        expect(checkErrorRate).toHaveBeenCalledWith(PROJECT_ID);
        expect(checkLatency).toHaveBeenCalledWith(
            PROJECT_ID,
            expect.any(Number),
            false
        );

        expect(broadcast).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "chaos_event",
                projectId: PROJECT_ID,
                endpointId: ENDPOINT_ID,
                statusCode: 503,
                success: false,
                chaos: true,
            })
        );

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Chaos error injected",
                chaos: true,
                statusCode: 503,
            })
        );
    });

    it("applies chaos latency before injecting an error", async () => {
        foundEndpoint();
        ownedProject();
        vi.mocked(getActiveChaosRule).mockResolvedValue({
            latency: 200,
            errorRate: 100,
            statusCode: 500,
        } as never);
        vi.mocked(shouldInjectError).mockReturnValue(true);
        vi.mocked(postgresPool.query).mockResolvedValue({ rows: [] } as never);

        const order: string[] = [];
        vi.mocked(applyLatency).mockImplementation(async () => {
            order.push("latency");
        });
        vi.mocked(postgresPool.query).mockImplementation((async () => {
            order.push("insert");
            return { rows: [] };
        }) as never);

        await checkApi(mockRequest(ENDPOINT_ID, "user-1"), mockResponse());

        expect(order).toEqual(["latency", "insert"]);
    });

    it("returns a generic 500 without leaking the internal error message", async () => {
        foundEndpoint();
        ownedProject();
        vi.mocked(getActiveChaosRule).mockResolvedValue(null as never);
        vi.mocked(monitorApi).mockRejectedValue(
            new Error("connection string leaked: secret-detail")
        );

        const res = mockResponse();

        await checkApi(mockRequest(ENDPOINT_ID, "user-1"), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            message: "Failed to check API",
            error: "INTERNAL_SERVER_ERROR",
        });
        expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain(
            "secret-detail"
        );
    });
});