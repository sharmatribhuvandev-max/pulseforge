
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, broadcastMock } = vi.hoisted(() => ({
    queryMock: vi.fn(),
    broadcastMock: vi.fn()
}));

vi.mock("../src/db/postgres", () => ({
    postgresPool: {
        query: queryMock
    }
}));

vi.mock("../src/services/websocketService", () => ({
    broadcast: broadcastMock
}));

import {
    checkErrorRate,
    checkLatency,
    resolveErrorRateIncident,
    resolveLatencyIncident
} from "../src/services/incidentService";

describe("Incident service", () => {
    beforeEach(() => {
        queryMock.mockReset();
        broadcastMock.mockReset();
        vi.spyOn(console, "log").mockImplementation(() => { });
    });

    describe("checkErrorRate", () => {
        it("does nothing when there are no recent requests", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{ total: 0, failed: 0 }]
            });

            await checkErrorRate("project-1");

            expect(queryMock).toHaveBeenCalledOnce();
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("creates an incident when error rate reaches 50%", async () => {
            queryMock
                .mockResolvedValueOnce({
                    rows: [{ total: 20, failed: 10 }]
                })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{ id: "incident-1", type: "HIGH_ERROR_RATE" }]
                });

            await checkErrorRate("project-1");

            expect(queryMock).toHaveBeenCalledTimes(3);
            expect(queryMock.mock.calls[2][1]).toEqual([
                "project-1",
                "HIGH_ERROR_RATE",
                50,
                50
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_created",
                projectId: "project-1",
                incident: {
                    id: "incident-1",
                    type: "HIGH_ERROR_RATE"
                }
            });
        });

        it("does not create a duplicate active error-rate incident", async () => {
            queryMock
                .mockResolvedValueOnce({
                    rows: [{ total: 20, failed: 12 }]
                })
                .mockResolvedValueOnce({
                    rows: [{ id: "existing-incident" }]
                });

            await checkErrorRate("project-1");

            expect(queryMock).toHaveBeenCalledTimes(2);
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("resolves an active incident when error rate falls below 50%", async () => {
            queryMock
                .mockResolvedValueOnce({
                    rows: [{ total: 20, failed: 2 }]
                })
                .mockResolvedValueOnce({
                    rows: [{ id: "incident-1" }]
                })
                .mockResolvedValueOnce({
                    rows: [{ id: "incident-1", resolved_at: "now" }]
                });

            await checkErrorRate("project-1");

            expect(queryMock).toHaveBeenCalledTimes(3);
            expect(queryMock.mock.calls[2][1]).toEqual([
                "incident-1",
                10
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_resolved",
                projectId: "project-1",
                incident: {
                    id: "incident-1",
                    resolved_at: "now"
                }
            });
        });
    });

    describe("checkLatency", () => {
        it("creates an incident when latency reaches 1000 ms", async () => {
            queryMock
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{ id: "incident-2", type: "HIGH_LATENCY" }]
                });

            await checkLatency("project-1", 1000, true);

            expect(queryMock).toHaveBeenCalledTimes(2);
            expect(queryMock.mock.calls[1][1]).toEqual([
                "project-1",
                "HIGH_LATENCY",
                1000,
                1000
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_created",
                projectId: "project-1",
                incident: {
                    id: "incident-2",
                    type: "HIGH_LATENCY"
                }
            });
        });

        it("updates an existing active latency incident without creating a duplicate", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: "existing-incident",
                    type: "HIGH_LATENCY",
                    actual_value: 1500,
                    healthy_checks: 0
                }]
            });

            await checkLatency("project-1", 1500, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain("UPDATE incidents");
            expect(queryMock.mock.calls[0][0]).toContain("healthy_checks = 0");
            expect(queryMock.mock.calls[0][1]).toEqual([
                "project-1",
                1500
            ]);
            expect(queryMock.mock.calls[0][0]).not.toContain(
                "INSERT INTO incidents"
            );

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: "project-1",
                incident: {
                    id: "existing-incident",
                    type: "HIGH_LATENCY",
                    actual_value: 1500,
                    healthy_checks: 0
                }
            });
        });

        it("updates the actual value of an existing incident when latency remains high", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: "existing-incident",
                    type: "HIGH_LATENCY",
                    actual_value: 1314,
                    healthy_checks: 0
                }]
            });

            await checkLatency("project-1", 1314, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][1]).toEqual([
                "project-1",
                1314
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: "project-1",
                incident: {
                    id: "existing-incident",
                    type: "HIGH_LATENCY",
                    actual_value: 1314,
                    healthy_checks: 0
                }
            });
        });

        it("does not resolve an active incident after only one healthy latency measurement", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 1,
                    actual_value: 500
                }]
            });

            await checkLatency("project-1", 500, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain(
                "healthy_checks + 1 >= 3"
            );
            expect(queryMock.mock.calls[0][1]).toEqual([
                "project-1",
                1,
                500
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: "project-1",
                incident: {
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 1,
                    actual_value: 500
                }
            });

            expect(broadcastMock).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "incident_resolved"
                })
            );
        });

        it("resolves an active incident after three consecutive healthy latency measurements", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 3,
                    actual_value: 500,
                    resolved_at: "now"
                }]
            });

            await checkLatency("project-1", 500, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain(
                "healthy_checks + 1 >= 3"
            );
            expect(queryMock.mock.calls[0][1]).toEqual([
                "project-1",
                1,
                500
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_resolved",
                projectId: "project-1",
                incident: {
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 3,
                    actual_value: 500,
                    resolved_at: "now"
                }
            });
        });

        it("resets the healthy check counter when latency rises above the threshold", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 0,
                    actual_value: 1200
                }]
            });

            await checkLatency("project-1", 1200, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain(
                "healthy_checks = 0"
            );
            expect(queryMock.mock.calls[0][1]).toEqual([
                "project-1",
                1200
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: "project-1",
                incident: {
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 0,
                    actual_value: 1200
                }
            });
        });

        it("resets recovery progress when a request fails despite healthy latency", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 0,
                    actual_value: 500
                }]
            });

            await checkLatency("project-1", 500, false);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][1]).toEqual([
                "project-1",
                0,
                500
            ]);
            expect(queryMock.mock.calls[0][0]).toContain(
                "healthy_checks = CASE"
            );

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: "project-1",
                incident: {
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 0,
                    actual_value: 500
                }
            });

            expect(broadcastMock).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "incident_resolved"
                })
            );
        });
    });

    describe("resolveErrorRateIncident", () => {
        it("does not resolve an incident while error rate remains high", async () => {
            await resolveErrorRateIncident("project-1", 50);

            expect(queryMock).not.toHaveBeenCalled();
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("does not resolve an incident when no active incident exists", async () => {
            queryMock.mockResolvedValueOnce({ rows: [] });

            await resolveErrorRateIncident("project-1", 10);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(broadcastMock).not.toHaveBeenCalled();
        });
    });

    describe("resolveLatencyIncident", () => {
        it("does not resolve an incident while latency remains high", async () => {
            await resolveLatencyIncident("project-1", 1000);

            expect(queryMock).not.toHaveBeenCalled();
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("does not resolve an incident when no active incident exists", async () => {
            queryMock.mockResolvedValueOnce({ rows: [] });

            await resolveLatencyIncident("project-1", 500);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(broadcastMock).not.toHaveBeenCalled();
        });
    });
});
