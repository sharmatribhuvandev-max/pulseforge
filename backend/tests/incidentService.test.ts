
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
    resolveEndpointIncidents,
    resolveErrorRateIncident,
    resolveLatencyIncident
} from "../src/services/incidentService";

const PROJECT_ID = "project-1";
const ENDPOINT_ID = "endpoint-a";
const OTHER_ENDPOINT_ID = "endpoint-b";

describe("Incident service", () => {
    beforeEach(() => {
        queryMock.mockReset();
        broadcastMock.mockReset();
        vi.spyOn(console, "log").mockImplementation(() => { });
    });

    describe("checkErrorRate", () => {
        it("does nothing when the endpoint has no recent requests", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{ total: 0, failed: 0 }]
            });

            await checkErrorRate(PROJECT_ID, ENDPOINT_ID);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("limits the recent-request window to the 20 latest requests of the endpoint", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{ total: 0, failed: 0 }]
            });

            await checkErrorRate(PROJECT_ID, ENDPOINT_ID);

            const sql = queryMock.mock.calls[0][0];

            expect(sql).toContain("WHERE project_id = $1");
            expect(sql).toContain("AND endpoint_id = $2");
            expect(sql).toContain("ORDER BY created_at DESC, id DESC");
            expect(sql).toContain("LIMIT $3");
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                20
            ]);
        });

        it("creates an incident for the endpoint when its error rate reaches 50%", async () => {
            queryMock
                .mockResolvedValueOnce({
                    rows: [{ total: 20, failed: 10 }]
                })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{ id: "incident-1", type: "HIGH_ERROR_RATE" }]
                });

            await checkErrorRate(PROJECT_ID, ENDPOINT_ID);

            expect(queryMock).toHaveBeenCalledTimes(3);
            expect(queryMock.mock.calls[2][0]).toContain("endpoint_id");
            expect(queryMock.mock.calls[2][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                "HIGH_ERROR_RATE",
                50,
                50
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_created",
                projectId: PROJECT_ID,
                incident: {
                    id: "incident-1",
                    type: "HIGH_ERROR_RATE"
                }
            });
        });

        it("updates the endpoint's active error-rate incident instead of creating a duplicate", async () => {
            queryMock
                .mockResolvedValueOnce({
                    rows: [{ total: 20, failed: 16 }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: "existing-incident",
                        type: "HIGH_ERROR_RATE",
                        actual_value: 80,
                        started_at: "2026-10-30T10:00:00.000Z"
                    }]
                });

            await checkErrorRate(PROJECT_ID, ENDPOINT_ID);

            expect(queryMock).toHaveBeenCalledTimes(2);
            expect(queryMock.mock.calls[1][0]).toContain("UPDATE incidents");
            expect(queryMock.mock.calls[1][0]).toContain("SET actual_value = $3");
            expect(queryMock.mock.calls[1][0]).toContain("AND endpoint_id = $2");
            expect(queryMock.mock.calls[1][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                80
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: PROJECT_ID,
                incident: {
                    id: "existing-incident",
                    type: "HIGH_ERROR_RATE",
                    actual_value: 80,
                    started_at: "2026-10-30T10:00:00.000Z"
                }
            });
        });

        it("does not broadcast when concurrent error-rate incident creation conflicts", async () => {
            queryMock
                .mockResolvedValueOnce({
                    rows: [{ total: 20, failed: 12 }]
                })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            await checkErrorRate(PROJECT_ID, ENDPOINT_ID);

            expect(queryMock).toHaveBeenCalledTimes(3);
            expect(queryMock.mock.calls[2][0]).toContain(
                "ON CONFLICT (project_id, endpoint_id, type)"
            );
            expect(queryMock.mock.calls[2][0]).toContain("WHERE resolved_at IS NULL");
            expect(queryMock.mock.calls[2][0]).toContain("DO NOTHING");
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("resolves the endpoint's active incident when its error rate falls below 50%", async () => {
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

            await checkErrorRate(PROJECT_ID, ENDPOINT_ID);

            expect(queryMock).toHaveBeenCalledTimes(3);
            expect(queryMock.mock.calls[1][0]).toContain("AND endpoint_id = $2");
            expect(queryMock.mock.calls[1][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID
            ]);
            expect(queryMock.mock.calls[2][1]).toEqual([
                "incident-1",
                10
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_resolved",
                projectId: PROJECT_ID,
                incident: {
                    id: "incident-1",
                    resolved_at: "now"
                }
            });
        });
    });

    describe("checkLatency", () => {
        it("creates an incident for the endpoint when latency reaches 1000 ms", async () => {
            queryMock
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{ id: "incident-2", type: "HIGH_LATENCY" }]
                });

            await checkLatency(PROJECT_ID, ENDPOINT_ID, 1000, true);

            expect(queryMock).toHaveBeenCalledTimes(2);
            expect(queryMock.mock.calls[1][0]).toContain("endpoint_id");
            expect(queryMock.mock.calls[1][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                "HIGH_LATENCY",
                1000,
                1000
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_created",
                projectId: PROJECT_ID,
                incident: {
                    id: "incident-2",
                    type: "HIGH_LATENCY"
                }
            });
        });

        it("does not broadcast when concurrent latency incident creation conflicts", async () => {
            queryMock
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            await checkLatency(PROJECT_ID, ENDPOINT_ID, 1200, true);

            expect(queryMock).toHaveBeenCalledTimes(2);
            expect(queryMock.mock.calls[1][0]).toContain(
                "ON CONFLICT (project_id, endpoint_id, type)"
            );
            expect(queryMock.mock.calls[1][0]).toContain("WHERE resolved_at IS NULL");
            expect(queryMock.mock.calls[1][0]).toContain("DO NOTHING");
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("updates the endpoint's active latency incident without creating a duplicate", async () => {
            queryMock.mockResolvedValueOnce({
                rows: [{
                    id: "existing-incident",
                    type: "HIGH_LATENCY",
                    actual_value: 1500,
                    healthy_checks: 0
                }]
            });

            await checkLatency(PROJECT_ID, ENDPOINT_ID, 1500, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain("UPDATE incidents");
            expect(queryMock.mock.calls[0][0]).toContain("healthy_checks = 0");
            expect(queryMock.mock.calls[0][0]).toContain("AND endpoint_id = $2");
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                1500
            ]);
            expect(queryMock.mock.calls[0][0]).not.toContain(
                "INSERT INTO incidents"
            );

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: PROJECT_ID,
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

            await checkLatency(PROJECT_ID, ENDPOINT_ID, 1314, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                1314
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: PROJECT_ID,
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

            await checkLatency(PROJECT_ID, ENDPOINT_ID, 500, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain(
                "healthy_checks + 1 >= 3"
            );
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                1,
                500
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: PROJECT_ID,
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

            await checkLatency(PROJECT_ID, ENDPOINT_ID, 500, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain(
                "healthy_checks + 1 >= 3"
            );
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                1,
                500
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_resolved",
                projectId: PROJECT_ID,
                incident: {
                    id: "incident-2",
                    type: "HIGH_LATENCY",
                    healthy_checks: 3,
                    actual_value: 500,
                    resolved_at: "now"
                }
            });
        });

        it("only advances recovery for the endpoint that made the request", async () => {
            queryMock.mockResolvedValueOnce({ rows: [] });

            await checkLatency(PROJECT_ID, OTHER_ENDPOINT_ID, 500, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain("AND endpoint_id = $2");
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                OTHER_ENDPOINT_ID,
                1,
                500
            ]);
            expect(broadcastMock).not.toHaveBeenCalled();
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

            await checkLatency(PROJECT_ID, ENDPOINT_ID, 1200, true);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][0]).toContain(
                "healthy_checks = 0"
            );
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                1200
            ]);

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: PROJECT_ID,
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

            await checkLatency(PROJECT_ID, ENDPOINT_ID, 500, false);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                0,
                500
            ]);
            expect(queryMock.mock.calls[0][0]).toContain(
                "healthy_checks = CASE"
            );

            expect(broadcastMock).toHaveBeenCalledWith({
                type: "incident_updated",
                projectId: PROJECT_ID,
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
            await resolveErrorRateIncident(PROJECT_ID, ENDPOINT_ID, 50);

            expect(queryMock).not.toHaveBeenCalled();
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("does not resolve an incident when the endpoint has no active incident", async () => {
            queryMock.mockResolvedValueOnce({ rows: [] });

            await resolveErrorRateIncident(PROJECT_ID, ENDPOINT_ID, 10);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID
            ]);
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("computes the error rate from the endpoint's recent requests when none is given", async () => {
            queryMock
                .mockResolvedValueOnce({
                    rows: [{ total: 20, failed: 2 }]
                })
                .mockResolvedValueOnce({ rows: [] });

            await resolveErrorRateIncident(PROJECT_ID, ENDPOINT_ID);

            expect(queryMock).toHaveBeenCalledTimes(2);
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                20
            ]);
            expect(queryMock.mock.calls[1][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID
            ]);
        });
    });

    describe("resolveLatencyIncident", () => {
        it("does not resolve an incident while latency remains high", async () => {
            await resolveLatencyIncident(PROJECT_ID, ENDPOINT_ID, 1000);

            expect(queryMock).not.toHaveBeenCalled();
            expect(broadcastMock).not.toHaveBeenCalled();
        });

        it("does not resolve an incident when the endpoint has no active incident", async () => {
            queryMock.mockResolvedValueOnce({ rows: [] });

            await resolveLatencyIncident(PROJECT_ID, ENDPOINT_ID, 500);

            expect(queryMock).toHaveBeenCalledOnce();
            expect(queryMock.mock.calls[0][1]).toEqual([
                PROJECT_ID,
                ENDPOINT_ID,
                1,
                500
            ]);
            expect(broadcastMock).not.toHaveBeenCalled();
        });
    });

    describe("resolveEndpointIncidents", () => {
        it("resolves every active incident of the endpoint and broadcasts each one", async () => {
            const rows = [
                { id: "incident-1", type: "HIGH_LATENCY", resolved_at: "now" },
                { id: "incident-2", type: "HIGH_ERROR_RATE", resolved_at: "now" }
            ];
            queryMock.mockResolvedValueOnce({ rows });

            const resolved = await resolveEndpointIncidents(PROJECT_ID, ENDPOINT_ID);

            expect(queryMock).toHaveBeenCalledOnce();
            const [sql, params] = queryMock.mock.calls[0];
            expect(sql).toContain("UPDATE incidents");
            expect(sql).toContain("SET resolved_at = NOW()");
            expect(sql).toContain("WHERE project_id = $1");
            expect(sql).toContain("AND endpoint_id = $2");
            expect(sql).toContain("AND resolved_at IS NULL");
            expect(sql).toContain("RETURNING *");
            expect(params).toEqual([PROJECT_ID, ENDPOINT_ID]);

            expect(resolved).toEqual(rows);
            expect(broadcastMock).toHaveBeenCalledTimes(2);
            for (const incident of rows) {
                expect(broadcastMock).toHaveBeenCalledWith({
                    type: "incident_resolved",
                    projectId: PROJECT_ID,
                    incident
                });
            }
        });

        it("does not broadcast when the endpoint has no active incidents", async () => {
            queryMock.mockResolvedValueOnce({ rows: [] });

            const resolved = await resolveEndpointIncidents(PROJECT_ID, ENDPOINT_ID);

            expect(resolved).toEqual([]);
            expect(broadcastMock).not.toHaveBeenCalled();
        });
    });
});
