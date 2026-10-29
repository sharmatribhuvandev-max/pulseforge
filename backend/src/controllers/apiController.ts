
import { Response } from "express";
import mongoose from "mongoose";

import { Endpoint } from "../models/Endpoint";
import { Project } from "../models/Project";

import { postgresPool } from "../db/postgres";

import { monitorApi } from "../services/monitorService";

import {
    getActiveChaosRule,
    applyLatency,
    shouldInjectError
} from "../services/chaosService";

import { broadcast } from "../services/websocketService";

import {
    checkErrorRate,
    checkLatency
} from "../services/incidentService";

import { AuthRequest } from "../middleware/authMiddleware";

export const checkApi = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const requestStart = Date.now();

        /*
         * VALIDATE ENDPOINT ID
         */

        const endpointId = req.params.id;

        if (
            !endpointId ||
            Array.isArray(endpointId) ||
            !mongoose.isValidObjectId(endpointId)
        ) {
            return res.status(400).json({
                message: "Invalid endpoint ID"
            });
        }

        /*
         * AUTH CHECK
         */

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        /*
         * FIND ENDPOINT
         */

        const endpoint = await Endpoint.findById(endpointId);

        if (!endpoint) {
            return res.status(404).json({
                message: "Endpoint not found"
            });
        }

        /*
         * VERIFY PROJECT OWNERSHIP
         */

        const project = await Project.findOne({
            _id: endpoint.projectId,
            userId: req.userId
        });

        if (!project) {
            return res.status(404).json({
                message: "Endpoint not found"
            });
        }

        const projectId = project._id.toString();

        /*
         * FIND ACTIVE CHAOS RULE
         */

        const chaosRule = await getActiveChaosRule(
            endpoint._id.toString()
        );

        /*
         * APPLY CHAOS
         */

        if (chaosRule) {
            if (chaosRule.latency > 0) {
                await applyLatency(chaosRule.latency);
            }

            /*
             * ERROR INJECTION
             */

            if (shouldInjectError(chaosRule.errorRate)) {
                const totalLatency = Date.now() - requestStart;

                /*
                 * SAVE FAILED REQUEST
                 */

                await postgresPool.query(
                    `
                    INSERT INTO api_requests
                    (
                        project_id,
                        endpoint,
                        method,
                        status_code,
                        latency_ms,
                        error
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    `,
                    [
                        projectId,
                        endpoint.url,
                        endpoint.method,
                        chaosRule.statusCode,
                        totalLatency,
                        true
                    ]
                );

                /*
                 * INCIDENT CHECKS
                 *
                 * Failed chaos requests must not count
                 * toward consecutive healthy latency checks.
                 */

                await checkErrorRate(projectId);
                await checkLatency(projectId, totalLatency, false);

                /*
                 * BROADCAST CHAOS EVENT
                 */

                broadcast({
                    type: "chaos_event",
                    projectId,
                    endpointId: endpoint._id.toString(),
                    endpoint: endpoint.url,
                    method: endpoint.method,
                    statusCode: chaosRule.statusCode,
                    latency: totalLatency,
                    success: false,
                    chaos: true
                });

                /*
                 * RETURN CHAOS RESPONSE
                 */

                return res
                    .status(chaosRule.statusCode)
                    .json({
                        message: "Chaos error injected",
                        chaos: true,
                        statusCode: chaosRule.statusCode,
                        latency: totalLatency
                    });
            }
        }

        /*
         * MONITOR REAL API
         *
         * monitorApi records the outbound request and performs
         * the incident checks. Do not repeat those checks here.
         */

        const chaosLatency = chaosRule?.latency || 0;

        const monitorResult = await monitorApi(
            projectId,
            endpoint.url,
            endpoint.method,
            chaosLatency
        );

        /*
         * RETURN RESULT
         *
         * Use the measured outbound latency from monitorApi.
         * Controller/database overhead is not endpoint latency.
         */

        return res.status(200).json({
            message: "API checked successfully",
            result: monitorResult
        });

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Check API error:", {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        } else {
            console.error("Check API error: Unknown thrown value", error);
        }

        return res.status(500).json({
            message: "Failed to check API",
            error: "INTERNAL_SERVER_ERROR"
        });
    }
};