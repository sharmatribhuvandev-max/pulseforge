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

        /*
         * ==========================================
         * START REQUEST TIMER
         * ==========================================
         */

        const requestStart = Date.now();


        /*
         * ==========================================
         * VALIDATE ENDPOINT ID
         * ==========================================
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
         * ==========================================
         * AUTH CHECK
         * ==========================================
         */

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }


        /*
         * ==========================================
         * FIND ENDPOINT
         * ==========================================
         */

        const endpoint =
            await Endpoint.findById(endpointId);

        if (!endpoint) {
            return res.status(404).json({
                message: "Endpoint not found"
            });
        }


        /*
         * ==========================================
         * VERIFY PROJECT OWNERSHIP
         * ==========================================
         */

        const project =
            await Project.findOne({
                _id: endpoint.projectId,
                userId: req.userId
            });

        if (!project) {
            return res.status(404).json({
                message: "Endpoint not found"
            });
        }


        /*
         * ==========================================
         * FIND ACTIVE CHAOS RULE
         * ==========================================
         */

        const chaosRule =
            await getActiveChaosRule(
                endpoint._id.toString()
            );


        /*
         * ==========================================
         * APPLY CHAOS
         * ==========================================
         */

        if (chaosRule) {

            /*
             * Artificial latency
             */
            if (chaosRule.latency > 0) {

                await applyLatency(
                    chaosRule.latency
                );
            }


            /*
             * Error injection
             */
            if (
                shouldInjectError(
                    chaosRule.errorRate
                )
            ) {

                const totalLatency =
                    Date.now() - requestStart;


                /*
                 * Save failed request
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
                        project._id.toString(),
                        endpoint.url,
                        endpoint.method,
                        chaosRule.statusCode,
                        totalLatency,
                        true
                    ]
                );


                /*
                 * Check incidents
                 */
                await checkErrorRate(
                    project._id.toString()
                );

                await checkLatency(
                    project._id.toString(),
                    totalLatency
                );


                /*
                 * Broadcast chaos event
                 */
                broadcast({
                    type: "chaos_event",
                    projectId:
                        project._id.toString(),
                    endpointId:
                        endpoint._id.toString(),
                    endpoint:
                        endpoint.url,
                    method:
                        endpoint.method,
                    statusCode:
                        chaosRule.statusCode,
                    latency:
                        totalLatency,
                    success: false,
                    chaos: true
                });


                /*
                 * Return chaos response
                 */
                return res
                    .status(chaosRule.statusCode)
                    .json({
                        message:
                            "Chaos error injected",

                        chaos: true,

                        statusCode:
                            chaosRule.statusCode,

                        latency:
                            totalLatency
                    });
            }
        }


        /*
         * ==========================================
         * MONITOR REAL API
         * ==========================================
         */

        const chaosLatency =
            chaosRule?.latency || 0;


        const monitorResult =
            await monitorApi(
                project._id.toString(),
                endpoint.url,
                endpoint.method,
                chaosLatency
            );


        /*
         * ==========================================
         * TOTAL LATENCY
         * ==========================================
         */

        const totalLatency =
            Date.now() - requestStart;


        /*
         * ==========================================
         * CHECK INCIDENT STATE
         * ==========================================
         */

        await checkErrorRate(
            project._id.toString()
        );

        await checkLatency(
            project._id.toString(),
            totalLatency
        );


        /*
         * ==========================================
         * RETURN RESULT
         * ==========================================
         */

        return res.status(200).json({

            message:
                "API checked successfully",

            result: {

                ...monitorResult,

                latency:
                    totalLatency
            }
        });

    } catch (error) {

        console.error(
            "Check API error:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to check API",

            error:
                "INTERNAL_SERVER_ERROR"
        });
    }
};