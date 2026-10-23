
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../src/middleware/authMiddleware";

vi.mock("../src/models/ChaosRule", () => ({
    ChaosRule: {
        create: vi.fn(),
        find: vi.fn(),
        findById: vi.fn(),
        updateMany: vi.fn()
    }
}));

vi.mock("../src/models/Endpoint", () => ({
    Endpoint: {
        findById: vi.fn()
    }
}));

vi.mock("../src/models/Project", () => ({
    Project: {
        findOne: vi.fn()
    }
}));

import { ChaosRule } from "../src/models/ChaosRule";
import { Endpoint } from "../src/models/Endpoint";
import { Project } from "../src/models/Project";
import {
    createChaosRule,
    updateChaosRule
} from "../src/controllers/chaosController";

function mockResponse() {
    const res = {
        status: vi.fn(),
        json: vi.fn()
    } as unknown as Response;

    vi.mocked(res.status).mockReturnValue(res);
    vi.mocked(res.json).mockReturnValue(res);

    return res;
}

function mockRequest(
    body: Record<string, unknown>,
    userId: string | undefined = "user-1",
    params: Record<string, string | undefined> = {}
) {
    return {
        body,
        userId,
        params
    } as unknown as AuthRequest;
}

describe("Chaos controller", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(ChaosRule.updateMany).mockResolvedValue({
            acknowledged: true,
            matchedCount: 1,
            modifiedCount: 1,
            upsertedCount: 0,
            upsertedId: null
        } as never);
    });

    describe("createChaosRule", () => {
        it("returns 404 when the endpoint is missing", async () => {
            vi.mocked(Endpoint.findById).mockResolvedValue(null);

            const req = mockRequest(
                { endpointId: "endpoint-1" },
                undefined
            );
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(ChaosRule.create).not.toHaveBeenCalled();
        });

        it("rejects a missing endpoint ID", async () => {
            const req = mockRequest({});
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "endpointId is required",
                error: "MISSING_ENDPOINT_ID"
            });
        });

        it("rejects latency above the configured maximum", async () => {
            const req = mockRequest({
                endpointId: "endpoint-1",
                latency: 30001
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Latency must be between 0 and 30000 ms",
                error: "INVALID_LATENCY"
            });
            expect(Endpoint.findById).not.toHaveBeenCalled();
        });

        it("rejects an error rate outside 0–100", async () => {
            const req = mockRequest({
                endpointId: "endpoint-1",
                errorRate: 101
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Error rate must be between 0 and 100",
                error: "INVALID_ERROR_RATE"
            });
        });

        it("rejects a non-integer HTTP status code", async () => {
            const req = mockRequest({
                endpointId: "endpoint-1",
                statusCode: 200.5
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Status code must be an integer between 100 and 599",
                error: "INVALID_STATUS_CODE"
            });
        });

        it("returns 404 when the endpoint does not exist", async () => {
            vi.mocked(Endpoint.findById).mockResolvedValue(null);

            const req = mockRequest({
                endpointId: "missing-endpoint"
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(ChaosRule.create).not.toHaveBeenCalled();
        });

        it("rejects endpoints not owned by the authenticated user", async () => {
            vi.mocked(Endpoint.findById).mockResolvedValue({
                _id: "endpoint-1",
                projectId: "project-1"
            } as never);
            vi.mocked(Project.findOne).mockResolvedValue(null);

            const req = mockRequest({
                endpointId: "endpoint-1"
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(Project.findOne).toHaveBeenCalledWith({
                _id: "project-1",
                userId: "user-1"
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(ChaosRule.create).not.toHaveBeenCalled();
        });

        it("disables existing active rules before creating an enabled rule", async () => {
            vi.mocked(Endpoint.findById).mockResolvedValue({
                _id: "endpoint-1",
                projectId: "project-1"
            } as never);
            vi.mocked(Project.findOne).mockResolvedValue({
                _id: "project-1",
                userId: "user-1"
            } as never);
            vi.mocked(ChaosRule.create).mockResolvedValue({
                _id: "rule-new",
                endpointId: "endpoint-1",
                enabled: true,
                latency: 500,
                errorRate: 0,
                statusCode: 500
            } as never);

            const req = mockRequest({
                endpointId: "endpoint-1",
                enabled: true,
                latency: 500
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(ChaosRule.updateMany).toHaveBeenCalledWith(
                {
                    endpointId: "endpoint-1",
                    enabled: true
                },
                {
                    $set: { enabled: false }
                }
            );

            expect(ChaosRule.create).toHaveBeenCalledWith({
                endpointId: "endpoint-1",
                enabled: true,
                latency: 500,
                errorRate: 0,
                statusCode: 500
            });

            expect(res.status).toHaveBeenCalledWith(201);
        });
    });

    describe("updateChaosRule", () => {
        it("returns 404 when the rule is missing", async () => {
            vi.mocked(ChaosRule.findById).mockResolvedValue(null);

            const req = mockRequest(
                { enabled: true },
                undefined,
                { ruleId: "rule-1" }
            );
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(Endpoint.findById).not.toHaveBeenCalled();
        });

        it("returns 404 for a rule that does not exist", async () => {
            vi.mocked(ChaosRule.findById).mockResolvedValue(null);

            const req = mockRequest(
                { enabled: true },
                "user-1",
                { ruleId: "missing-rule" }
            );
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Chaos rule not found",
                error: "CHAOS_RULE_NOT_FOUND"
            });
        });

        it("disables other active rules before enabling the selected rule", async () => {
            const rule = {
                _id: "rule-2",
                endpointId: "endpoint-1",
                enabled: false,
                latency: 100,
                errorRate: 0,
                statusCode: 500,
                save: vi.fn().mockResolvedValue(undefined)
            };

            vi.mocked(ChaosRule.findById).mockResolvedValue(rule as never);
            vi.mocked(Endpoint.findById).mockResolvedValue({
                _id: "endpoint-1",
                projectId: "project-1"
            } as never);
            vi.mocked(Project.findOne).mockResolvedValue({
                _id: "project-1",
                userId: "user-1"
            } as never);

            const req = mockRequest(
                { enabled: true },
                "user-1",
                { ruleId: "rule-2" }
            );
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(ChaosRule.updateMany).toHaveBeenCalledWith(
                {
                    endpointId: "endpoint-1",
                    _id: { $ne: "rule-2" },
                    enabled: true
                },
                {
                    $set: { enabled: false }
                }
            );

            expect(rule.enabled).toBe(true);
            expect(rule.save).toHaveBeenCalledOnce();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("rejects an invalid update value", async () => {
            const rule = {
                _id: "rule-1",
                endpointId: "endpoint-1",
                enabled: false,
                save: vi.fn()
            };

            vi.mocked(ChaosRule.findById).mockResolvedValue(rule as never);
            vi.mocked(Endpoint.findById).mockResolvedValue({
                _id: "endpoint-1",
                projectId: "project-1"
            } as never);
            vi.mocked(Project.findOne).mockResolvedValue({
                _id: "project-1",
                userId: "user-1"
            } as never);

            const req = mockRequest(
                { errorRate: 101 },
                "user-1",
                { ruleId: "rule-1" }
            );
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(rule.save).not.toHaveBeenCalled();
        });
    });
});
