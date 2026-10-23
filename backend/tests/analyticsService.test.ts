
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
    queryMock: vi.fn()
}));

vi.mock("../src/db/postgres", () => ({
    postgresPool: {
        query: queryMock
    }
}));

import {
    getProjectAnalytics,
    getEndpointAnalytics,
    getLatencyHistory,
    getRecentApiEvents
} from "../src/services/analyticsService";

describe("Analytics service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getProjectAnalytics", () => {
        it("calculates request counts, error rate and latency metrics", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    total_requests: "20",
                    successful_requests: "15",
                    failed_requests: "5",
                    average_latency: "250",
                    max_latency: "900",
                    p95_latency: "800"
                }]
            });

            const result = await getProjectAnalytics("project-1");

            expect(result).toEqual({
                totalRequests: 20,
                successfulRequests: 15,
                failedRequests: 5,
                errorRate: 25,
                averageLatency: 250,
                maxLatency: 900,
                p95Latency: 800
            });

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][1]).toEqual(["project-1"]);
        });

        it("returns zero error rate when there are no requests", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    total_requests: "0",
                    successful_requests: "0",
                    failed_requests: "0",
                    average_latency: "0",
                    max_latency: "0",
                    p95_latency: "0"
                }]
            });

            const result = await getProjectAnalytics("project-1");

            expect(result.errorRate).toBe(0);
            expect(result.totalRequests).toBe(0);
        });

        it("builds parameterized conditions for all filters", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    total_requests: 1,
                    successful_requests: 1,
                    failed_requests: 0,
                    average_latency: 100,
                    max_latency: 100,
                    p95_latency: 100
                }]
            });

            await getProjectAnalytics("project-1", {
                minutes: 15,
                endpoint: " /api/orders ",
                method: "get",
                status: "success"
            });

            const [sql, values] = queryMock.mock.calls[0];

            expect(sql).toContain("created_at >= NOW()");
            expect(sql).toContain("endpoint = $3");
            expect(sql).toContain("method = $4");
            expect(sql).toContain("error = false");
            expect(values).toEqual([
                "project-1",
                15,
                "/api/orders",
                "GET"
            ]);
        });

        it("applies the failed status filter", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    total_requests: 1,
                    successful_requests: 0,
                    failed_requests: 1,
                    average_latency: 300,
                    max_latency: 300,
                    p95_latency: 300
                }]
            });

            await getProjectAnalytics("project-1", {
                status: "failed"
            });

            const [sql, values] = queryMock.mock.calls[0];

            expect(sql).toContain("error = true");
            expect(values).toEqual(["project-1"]);
        });
    });

    describe("getEndpointAnalytics", () => {
        it("maps endpoint metrics and calculates each error rate", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [
                    {
                        endpoint: "/api/orders",
                        method: "GET",
                        total_requests: "10",
                        successful_requests: "9",
                        failed_requests: "1",
                        average_latency: "120",
                        max_latency: "300",
                        p95_latency: "250"
                    },
                    {
                        endpoint: "/api/users",
                        method: "POST",
                        total_requests: "4",
                        successful_requests: "1",
                        failed_requests: "3",
                        average_latency: "500",
                        max_latency: "700",
                        p95_latency: "650"
                    }
                ]
            });

            const result = await getEndpointAnalytics("project-1");

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                endpoint: "/api/orders",
                method: "GET",
                totalRequests: 10,
                successfulRequests: 9,
                failedRequests: 1,
                errorRate: 10,
                averageLatency: 120,
                maxLatency: 300,
                p95Latency: 250
            });
            expect(result[1].errorRate).toBe(75);
        });

        it("returns an empty array when no endpoints match", async () => {
            queryMock.mockResolvedValueOnce({ rows: [] });

            const result = await getEndpointAnalytics("project-1");

            expect(result).toEqual([]);
        });
    });

    describe("getLatencyHistory", () => {
        it("converts latency and status values to numbers", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    created_at: new Date("2026-01-01T10:00:00.000Z"),
                    latency_ms: "175",
                    status_code: "200",
                    error: false
                }]
            });

            const result = await getLatencyHistory("project-1");

            expect(result).toEqual([{
                timestamp: new Date("2026-01-01T10:00:00.000Z"),
                latency: 175,
                statusCode: 200,
                error: false
            }]);

            const [sql, values] = queryMock.mock.calls[0];

            expect(sql).toContain("ORDER BY created_at ASC");
            expect(sql).toContain("LIMIT 100");
            expect(values).toEqual(["project-1"]);
        });
    });

    describe("getRecentApiEvents", () => {
        it("maps persisted requests into dashboard event objects", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: 42,
                    endpoint: "/api/orders",
                    method: "GET",
                    status_code: "200",
                    latency_ms: "145",
                    error: false,
                    created_at: new Date("2026-01-01T10:00:00.000Z")
                }]
            });

            const result = await getRecentApiEvents("project-1");

            expect(result).toEqual([{
                requestId: "42",
                type: "api_request",
                projectId: "project-1",
                endpoint: "/api/orders",
                method: "GET",
                statusCode: 200,
                latency: 145,
                success: true,
                chaos: false,
                timestamp: "2026-01-01T10:00:00.000Z"
            }]);

            expect(queryMock.mock.calls[0][1]).toEqual([
                "project-1",
                20
            ]);
        });

        it("uses the supplied event limit", async () => {
            queryMock.mockResolvedValueOnce({ rows: [] });

            await getRecentApiEvents("project-1", 5);

            expect(queryMock.mock.calls[0][1]).toEqual([
                "project-1",
                5
            ]);
        });

        it("converts string timestamps to strings without changing them", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: "event-7",
                    endpoint: "/health",
                    method: "GET",
                    status_code: 200,
                    latency_ms: 20,
                    error: true,
                    created_at: "2026-01-01T10:00:00.000Z"
                }]
            });

            const result = await getRecentApiEvents("project-1");

            expect(result[0].timestamp).toBe(
                "2026-01-01T10:00:00.000Z"
            );
            expect(result[0].success).toBe(false);
        });
    });
});
