
import { Response } from "express";
import { ChaosRule } from "../models/ChaosRule";
import { Endpoint } from "../models/Endpoint";
import { Project } from "../models/Project";
import { AuthRequest } from "../middleware/authMiddleware";

const MAX_LATENCY = 30000;
const MIN_STATUS_CODE = 100;
const MAX_STATUS_CODE = 599;

function validateChaosValues(
    latency: unknown,
    errorRate: unknown,
    statusCode: unknown
) {
    if (
        latency !== undefined &&
        (
            typeof latency !== "number" ||
            !Number.isFinite(latency) ||
            latency < 0 ||
            latency > MAX_LATENCY
        )
    ) {
        return {
            message: `Latency must be between 0 and ${MAX_LATENCY} ms`,
            error: "INVALID_LATENCY"
        };
    }

    if (
        errorRate !== undefined &&
        (
            typeof errorRate !== "number" ||
            !Number.isFinite(errorRate) ||
            errorRate < 0 ||
            errorRate > 100
        )
    ) {
        return {
            message: "Error rate must be between 0 and 100",
            error: "INVALID_ERROR_RATE"
        };
    }

    if (
        statusCode !== undefined &&
        (
            typeof statusCode !== "number" ||
            !Number.isInteger(statusCode) ||
            statusCode < MIN_STATUS_CODE ||
            statusCode > MAX_STATUS_CODE
        )
    ) {
        return {
            message: "Status code must be an integer between 100 and 599",
            error: "INVALID_STATUS_CODE"
        };
    }

    return null;
}

export async function createChaosRule(
    req: AuthRequest,
    res: Response
) {
    try {
        const {
            endpointId,
            enabled,
            latency,
            errorRate,
            statusCode
        } = req.body;

        // AUTH
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized",
                error: "UNAUTHORIZED"
            });
        }

        // REQUIRED ENDPOINT
        if (!endpointId) {
            return res.status(400).json({
                message: "endpointId is required",
                error: "MISSING_ENDPOINT_ID"
            });
        }

        // ENABLED VALIDATION
        if (
            enabled !== undefined &&
            typeof enabled !== "boolean"
        ) {
            return res.status(400).json({
                message: "enabled must be a boolean",
                error: "INVALID_ENABLED"
            });
        }

        // VALIDATE CHAOS VALUES
        const validationError = validateChaosValues(
            latency,
            errorRate,
            statusCode
        );

        if (validationError) {
            return res.status(400).json(validationError);
        }

        // FIND ENDPOINT
        const endpoint = await Endpoint.findById(endpointId);

        if (!endpoint) {
            return res.status(404).json({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND"
            });
        }

        // VERIFY PROJECT OWNERSHIP
        const project = await Project.findOne({
            _id: endpoint.projectId,
            userId: req.userId
        });

        if (!project) {
            return res.status(404).json({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND"
            });
        }

        // ENSURE ONLY ONE ENABLED RULE PER ENDPOINT
        if (enabled === true) {
            await ChaosRule.updateMany(
                {
                    endpointId: endpoint._id,
                    enabled: true
                },
                {
                    $set: { enabled: false }
                }
            );
        }

        // CREATE RULE
        const chaosRule = await ChaosRule.create({
            endpointId: endpoint._id,
            enabled: enabled ?? false,
            latency: latency ?? 0,
            errorRate: errorRate ?? 0,
            statusCode: statusCode ?? 500
        });

        return res.status(201).json({
            message: "Chaos rule created successfully",
            chaosRule
        });
    } catch (error) {
        console.error("Create chaos rule error:", error);

        return res.status(500).json({
            message: "Internal server error",
            error: "INTERNAL_SERVER_ERROR"
        });
    }
}

export async function getChaosRules(
    req: AuthRequest,
    res: Response
) {
    try {
        const endpointId = req.params.endpointId;

        // VALIDATE ENDPOINT ID
        if (!endpointId || Array.isArray(endpointId)) {
            return res.status(400).json({
                message: "Invalid endpoint ID",
                error: "INVALID_ENDPOINT_ID"
            });
        }

        // AUTH
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized",
                error: "UNAUTHORIZED"
            });
        }

        // FIND ENDPOINT
        const endpoint = await Endpoint.findById(endpointId);

        if (!endpoint) {
            return res.status(404).json({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND"
            });
        }

        // VERIFY OWNERSHIP
        const project = await Project.findOne({
            _id: endpoint.projectId,
            userId: req.userId
        });

        if (!project) {
            return res.status(404).json({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND"
            });
        }

        // GET RULES
        const chaosRules = await ChaosRule.find({
            endpointId: endpoint._id
        }).sort({
            createdAt: -1
        });

        return res.status(200).json({
            chaosRules
        });
    } catch (error) {
        console.error("Get chaos rules error:", error);

        return res.status(500).json({
            message: "Internal server error",
            error: "INTERNAL_SERVER_ERROR"
        });
    }
}

export async function updateChaosRule(
    req: AuthRequest,
    res: Response
) {
    try {
        const ruleId = req.params.ruleId;

        // VALIDATE RULE ID
        if (!ruleId || Array.isArray(ruleId)) {
            return res.status(400).json({
                message: "Invalid rule ID",
                error: "INVALID_RULE_ID"
            });
        }

        // AUTH
        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized",
                error: "UNAUTHORIZED"
            });
        }

        // FIND RULE
        const rule = await ChaosRule.findById(ruleId);

        if (!rule) {
            return res.status(404).json({
                message: "Chaos rule not found",
                error: "CHAOS_RULE_NOT_FOUND"
            });
        }

        // FIND ENDPOINT
        const endpoint = await Endpoint.findById(rule.endpointId);

        if (!endpoint) {
            return res.status(404).json({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND"
            });
        }

        // VERIFY OWNERSHIP
        const project = await Project.findOne({
            _id: endpoint.projectId,
            userId: req.userId
        });

        if (!project) {
            return res.status(404).json({
                message: "Chaos rule not found",
                error: "CHAOS_RULE_NOT_FOUND"
            });
        }

        const {
            enabled,
            latency,
            errorRate,
            statusCode
        } = req.body;

        // ENABLED VALIDATION
        if (
            enabled !== undefined &&
            typeof enabled !== "boolean"
        ) {
            return res.status(400).json({
                message: "enabled must be a boolean",
                error: "INVALID_ENABLED"
            });
        }

        // VALIDATE VALUES
        const validationError = validateChaosValues(
            latency,
            errorRate,
            statusCode
        );

        if (validationError) {
            return res.status(400).json(validationError);
        }

        /*
         * If this rule is being enabled, disable other enabled
         * rules belonging to the same endpoint first.
         *
         * Keep this rule excluded so it can be enabled below.
         */
        if (enabled === true) {
            await ChaosRule.updateMany(
                {
                    endpointId: rule.endpointId,
                    _id: { $ne: rule._id },
                    enabled: true
                },
                {
                    $set: { enabled: false }
                }
            );
        }

        // UPDATE VALUES
        if (enabled !== undefined) {
            rule.enabled = enabled;
        }

        if (latency !== undefined) {
            rule.latency = latency;
        }

        if (errorRate !== undefined) {
            rule.errorRate = errorRate;
        }

        if (statusCode !== undefined) {
            rule.statusCode = statusCode;
        }

        await rule.save();

        return res.status(200).json({
            message: "Chaos rule updated successfully",
            chaosRule: rule
        });
    } catch (error) {
        console.error("Update chaos rule error:", error);

        return res.status(500).json({
            message: "Internal server error",
            error: "INTERNAL_SERVER_ERROR"
        });
    }
}
