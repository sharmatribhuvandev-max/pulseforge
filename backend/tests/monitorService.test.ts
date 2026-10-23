
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    axiosMock,
    isAxiosErrorMock,
    queryMock,
    broadcastMock,
    checkErrorRateMock,
    checkLatencyMock,
    resolveErrorRateIncidentMock
} = vi.hoisted(() => ({
    axiosMock: vi.fn(),
    isAxiosErrorMock: vi.fn(),
    queryMock: vi.fn(),
    broadcastMock: vi.fn(),
    checkErrorRateMock: vi.fn(),
    checkLatencyMock: vi.fn(),
    resolveErrorRateIncidentMock: vi.fn()
}));

vi.mock("axios", () => ({
    default: Object.assign(axiosMock, {
        isAxiosError: isAxiosErrorMock
    })
}));

vi.mock("../src/db/postgres", () => ({
    postgresPool: {
        query: queryMock
    }
}));

vi.mock("../src/services/websocketService", () => ({
    broadcast: broadcastMock
}));

vi.mock("../src/services/incidentService", () => ({
    checkErrorRate: checkErrorRateMock,
    checkLatency: checkLatencyMock,
    resolveErrorRateIncident: resolveErrorRateIncidentMock
}));

import { monitorApi } from "../src/services/monitorService";

describe("Monitor service", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        queryMock.mockResolvedValue({
            rows: [{ id: 123 }]
        });

        checkErrorRateMock.mockResolvedValue(undefined);
        checkLatencyMock.mockResolvedValue(undefined);
        resolveErrorRateIncidentMock.mockResolvedValue(undefined);
    });

    it("records and broadcasts a successful API request", async () => {
        axiosMock.mockResolvedValueOnce({ status: 200 });

        const result = await monitorApi(
            "project-1",
            "https://example.com/health",
            "GET"
        );

        expect(axiosMock).toHaveBeenCalledWith({
            method: "GET",
            url: "https://example.com/health",
            timeout: 10000
        });

        expect(queryMock).toHaveBeenCalledOnce();

        const [sql, values] = queryMock.mock.calls[0];

        expect(sql).toContain("INSERT INTO api_requests");
        expect(values[0]).toBe("project-1");
        expect(values[1]).toBe("https://example.com/health");
        expect(values[2]).toBe("GET");
        expect(values[3]).toBe(200);
        expect(values[4]).toEqual(expect.any(Number));
        expect(values[5]).toBe(false);

        expect(result).toEqual({
            requestId: 123,
            statusCode: 200,
            latency: expect.any(Number),
            success: true
        });

        expect(resolveErrorRateIncidentMock).toHaveBeenCalledWith("project-1");
        expect(checkLatencyMock).toHaveBeenCalledWith(
            "project-1",
            expect.any(Number)
        );

        expect(broadcastMock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "api_request",
                requestId: 123,
                projectId: "project-1",
                statusCode: 200,
                success: true,
                chaos: false
            })
        );
    });

    it("includes additional chaos latency in the recorded result", async () => {
        axiosMock.mockResolvedValueOnce({ status: 200 });

        const result = await monitorApi(
            "project-1",
            "https://example.com/health",
            "GET",
            500
        );

        expect(result.success).toBe(true);
        expect(result.latency).toBeGreaterThanOrEqual(500);

        expect(queryMock.mock.calls[0][1][4]).toBe(
            result.latency
        );

        expect(checkLatencyMock).toHaveBeenCalledWith(
            "project-1",
            result.latency
        );
    });

    it("records an HTTP error using the actual response status", async () => {
        const httpError = {
            response: { status: 404 },
            code: undefined
        };

        axiosMock.mockRejectedValueOnce(httpError);
        isAxiosErrorMock.mockReturnValue(true);

        const result = await monitorApi(
            "project-1",
            "https://example.com/missing",
            "GET"
        );

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(404);

        expect(queryMock.mock.calls[0][1][3]).toBe(404);
        expect(queryMock.mock.calls[0][1][5]).toBe(true);

        expect(checkErrorRateMock).toHaveBeenCalledWith("project-1");

        expect(broadcastMock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "api_request",
                statusCode: 404,
                success: false,
                errorType: "HTTP_ERROR"
            })
        );
    });

    it("records network failures as status 502", async () => {
        axiosMock.mockRejectedValueOnce(new Error("Network unavailable"));
        isAxiosErrorMock.mockReturnValue(false);

        const result = await monitorApi(
            "project-1",
            "https://unreachable.example",
            "GET"
        );

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(502);
        expect(queryMock.mock.calls[0][1][3]).toBe(502);
        expect(queryMock.mock.calls[0][1][5]).toBe(true);

        expect(broadcastMock).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 502,
                success: false,
                errorType: "NETWORK_ERROR"
            })
        );
    });

    it("records request timeouts as status 504", async () => {
        axiosMock.mockRejectedValueOnce({
            code: "ECONNABORTED"
        });
        isAxiosErrorMock.mockReturnValue(true);

        const result = await monitorApi(
            "project-1",
            "https://slow.example",
            "GET"
        );

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(504);
        expect(queryMock.mock.calls[0][1][3]).toBe(504);

        expect(broadcastMock).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 504,
                success: false,
                errorType: "TIMEOUT"
            })
        );
    });

    it("checks latency for failed requests too", async () => {
        axiosMock.mockRejectedValueOnce(new Error("Network unavailable"));
        isAxiosErrorMock.mockReturnValue(false);

        await monitorApi(
            "project-1",
            "https://unreachable.example",
            "POST",
            250
        );

        expect(checkLatencyMock).toHaveBeenCalledWith(
            "project-1",
            expect.any(Number)
        );

        expect(queryMock.mock.calls[0][1][4]).toBeGreaterThanOrEqual(250);
    });
});
