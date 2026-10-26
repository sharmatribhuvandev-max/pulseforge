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
    getChaosRules,
    updateChaosRule
} from "../src/controllers/chaosController";

const ENDPOINT_ID = "64b000000000000000000001";
const PROJECT_ID = "64b000000000000000000002";
const RULE_ID = "64b000000000000000000003";
const SECOND_RULE_ID = "64b000000000000000000004";
const NEW_RULE_ID = "64b000000000000000000005";
const MISSING_ENDPOINT_ID = "64b000000000000000000006";
const MISSING_RULE_ID = "64b000000000000000000007";

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
    userId?: string,
    params: Record<string, string | undefined> = {}
) {
    // Only use the default user when the second argument is omitted.
    // Passing undefined explicitly must represent an unauthenticated request.
    const resolvedUserId = arguments.length >= 2 ? userId : "user-1";

    return {
        body,
        userId: resolvedUserId,
        params
    } as unknown as AuthRequest;
}

function mockOwnedEndpoint() {
    vi.mocked(Endpoint.findById).mockResolvedValue({
        _id: ENDPOINT_ID,
        projectId: PROJECT_ID
    } as never);

    vi.mocked(Project.findOne).mockResolvedValue({
        _id: PROJECT_ID,
        userId: "user-1"
    } as never);
}

function mockRule() {
    return {
        _id: RULE_ID,
        endpointId: ENDPOINT_ID,
        enabled: false,
        latency: 100,
        errorRate: 0,
        statusCode: 500,
        save: vi.fn().mockResolvedValue(undefined)
    };
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
        it("returns 404 when the endpoint does not exist", async () => {
            vi.mocked(Endpoint.findById).mockResolvedValue(null);

            const req = mockRequest({
                endpointId: ENDPOINT_ID
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND"
            });
            expect(ChaosRule.create).not.toHaveBeenCalled();
        });

        it("rejects an unauthenticated request", async () => {
            const req = mockRequest({
                endpointId: ENDPOINT_ID
            }, undefined);
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(ChaosRule.create).not.toHaveBeenCalled();
            expect(Endpoint.findById).not.toHaveBeenCalled();
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

        it("rejects a malformed endpoint ID before querying MongoDB", async () => {
            const req = mockRequest({
                endpointId: "not-a-valid-object-id"
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid endpoint ID",
                error: "INVALID_ENDPOINT_ID"
            });
            expect(Endpoint.findById).not.toHaveBeenCalled();
            expect(ChaosRule.create).not.toHaveBeenCalled();
        });

        it("rejects latency above the configured maximum", async () => {
            const req = mockRequest({
                endpointId: ENDPOINT_ID,
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
                endpointId: ENDPOINT_ID,
                errorRate: 101
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Error rate must be between 0 and 100",
                error: "INVALID_ERROR_RATE"
            });
            expect(Endpoint.findById).not.toHaveBeenCalled();
        });

        it("rejects a non-integer HTTP status code", async () => {
            const req = mockRequest({
                endpointId: ENDPOINT_ID,
                statusCode: 200.5
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Status code must be an integer between 100 and 599",
                error: "INVALID_STATUS_CODE"
            });
            expect(Endpoint.findById).not.toHaveBeenCalled();
        });

        it("rejects endpoints not owned by the authenticated user", async () => {
            vi.mocked(Endpoint.findById).mockResolvedValue({
                _id: ENDPOINT_ID,
                projectId: PROJECT_ID
            } as never);
            vi.mocked(Project.findOne).mockResolvedValue(null);

            const req = mockRequest({
                endpointId: ENDPOINT_ID
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(Project.findOne).toHaveBeenCalledWith({
                _id: PROJECT_ID,
                userId: "user-1"
            });
            expect(res.status).toHaveBeenCalledWith(404);
            expect(ChaosRule.create).not.toHaveBeenCalled();
        });

        it("disables existing active rules before creating an enabled rule", async () => {
            mockOwnedEndpoint();

            vi.mocked(ChaosRule.create).mockResolvedValue({
                _id: NEW_RULE_ID,
                endpointId: ENDPOINT_ID,
                enabled: true,
                latency: 500,
                errorRate: 0,
                statusCode: 500
            } as never);

            const req = mockRequest({
                endpointId: ENDPOINT_ID,
                enabled: true,
                latency: 500
            });
            const res = mockResponse();

            await createChaosRule(req, res);

            expect(ChaosRule.updateMany).toHaveBeenCalledWith(
                {
                    endpointId: ENDPOINT_ID,
                    enabled: true
                },
                {
                    $set: { enabled: false }
                }
            );

            expect(ChaosRule.create).toHaveBeenCalledWith({
                endpointId: ENDPOINT_ID,
                enabled: true,
                latency: 500,
                errorRate: 0,
                statusCode: 500
            });

            expect(res.status).toHaveBeenCalledWith(201);
        });
    });

    describe("getChaosRules", () => {
        it("rejects a malformed endpoint ID before querying MongoDB", async () => {
            const req = mockRequest({}, "user-1", {
                endpointId: "not-a-valid-object-id"
            });
            const res = mockResponse();

            await getChaosRules(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid endpoint ID",
                error: "INVALID_ENDPOINT_ID"
            });
            expect(Endpoint.findById).not.toHaveBeenCalled();
            expect(ChaosRule.find).not.toHaveBeenCalled();
        });

        it("returns 404 when the endpoint does not exist", async () => {
            vi.mocked(Endpoint.findById).mockResolvedValue(null);

            const req = mockRequest({}, "user-1", {
                endpointId: MISSING_ENDPOINT_ID
            });
            const res = mockResponse();

            await getChaosRules(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND"
            });
            expect(ChaosRule.find).not.toHaveBeenCalled();
        });

        it("returns chaos rules for an endpoint owned by the user", async () => {
            mockOwnedEndpoint();

            const rules = [
                { _id: RULE_ID, endpointId: ENDPOINT_ID },
                { _id: SECOND_RULE_ID, endpointId: ENDPOINT_ID }
            ];

            const sort = vi.fn().mockResolvedValue(rules);
            vi.mocked(ChaosRule.find).mockReturnValue({
                sort
            } as never);

            const req = mockRequest({}, "user-1", {
                endpointId: ENDPOINT_ID
            });
            const res = mockResponse();

            await getChaosRules(req, res);

            expect(ChaosRule.find).toHaveBeenCalledWith({
                endpointId: ENDPOINT_ID
            });
            expect(sort).toHaveBeenCalledWith({
                createdAt: -1
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                chaosRules: rules
            });
        });
    });

    describe("updateChaosRule", () => {
        it("rejects a malformed rule ID before querying MongoDB", async () => {
            const req = mockRequest({}, "user-1", {
                ruleId: "not-a-valid-object-id"
            });
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid rule ID",
                error: "INVALID_RULE_ID"
            });
            expect(ChaosRule.findById).not.toHaveBeenCalled();
        });

        it("returns 404 when the rule does not exist", async () => {
            vi.mocked(ChaosRule.findById).mockResolvedValue(null);

            const req = mockRequest({
                enabled: true
            }, "user-1", {
                ruleId: MISSING_RULE_ID
            });
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(ChaosRule.findById).toHaveBeenCalledWith(
                MISSING_RULE_ID
            );
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Chaos rule not found",
                error: "CHAOS_RULE_NOT_FOUND"
            });
            expect(Endpoint.findById).not.toHaveBeenCalled();
        });

        it("rejects an unauthenticated request", async () => {
            const req = mockRequest({}, undefined, {
                ruleId: RULE_ID
            });
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(ChaosRule.findById).not.toHaveBeenCalled();
        });

        it("disables other active rules before enabling the selected rule", async () => {
            const rule = {
                ...mockRule(),
                _id: SECOND_RULE_ID
            };

            vi.mocked(ChaosRule.findById).mockResolvedValue(
                rule as never
            );
            mockOwnedEndpoint();

            const req = mockRequest({
                enabled: true
            }, "user-1", {
                ruleId: SECOND_RULE_ID
            });
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(ChaosRule.updateMany).toHaveBeenCalledWith(
                {
                    endpointId: ENDPOINT_ID,
                    _id: { $ne: SECOND_RULE_ID },
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

        it("rejects an invalid update value without saving", async () => {
            const rule = mockRule();

            vi.mocked(ChaosRule.findById).mockResolvedValue(
                rule as never
            );
            mockOwnedEndpoint();

            const req = mockRequest({
                errorRate: 101
            }, "user-1", {
                ruleId: RULE_ID
            });
            const res = mockResponse();

            await updateChaosRule(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Error rate must be between 0 and 100",
                error: "INVALID_ERROR_RATE"
            });
            expect(rule.save).not.toHaveBeenCalled();
        });
    });
});