import axios from "axios";

import { postgresPool } from "../db/postgres";

import { broadcast } from "./websocketService";

import {
    checkErrorRate,
    checkLatency,
    resolveErrorRateIncident,
} from "./incidentService";

export const monitorApi = async (
    projectId: string,
    url: string,
    method: string,
    additionalLatency: number = 0
) => {
    const startTime = Date.now();

    try {
        /*
         * ==========================================
         * SEND REQUEST TO MONITORED API
         * ==========================================
         */

        const response = await axios({
            method,
            url,
            timeout: 10000,
        });

        /*
         * ==========================================
         * CALCULATE LATENCY
         * ==========================================
         */

        const apiLatency = Date.now() - startTime;
        const latency = apiLatency + additionalLatency;

        /*
         * ==========================================
         * SAVE SUCCESSFUL REQUEST
         * ==========================================
         */

        const savedRequest = await postgresPool.query(
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
            RETURNING id
            `,
            [
                projectId,
                url,
                method,
                response.status,
                latency,
                false,
            ]
        );

        const requestId = savedRequest.rows[0].id;

        /*
         * ==========================================
         * INCIDENT CHECKS
         * ==========================================
         */

        await resolveErrorRateIncident(projectId);

        await checkLatency(projectId, latency);

        /*
         * ==========================================
         * BROADCAST SUCCESS EVENT
         * ==========================================
         */

        broadcast({
            type: "api_request",
            requestId,
            projectId,
            endpoint: url,
            method,
            statusCode: response.status,
            latency,
            success: true,
            chaos: false,
            timestamp: new Date().toISOString(),
        });

        /*
         * ==========================================
         * RETURN SUCCESS RESULT
         * ==========================================
         */

        return {
            requestId,
            statusCode: response.status,
            latency,
            success: true,
        };
    } catch (error: unknown) {
        /*
         * ==========================================
         * CALCULATE LATENCY
         * ==========================================
         */

        const apiLatency = Date.now() - startTime;
        const latency = apiLatency + additionalLatency;

        /*
         * ==========================================
         * DETERMINE FAILURE STATUS
         * ==========================================
         *
         * Actual HTTP errors:
         * 400 / 401 / 403 / 404 / etc.
         *
         * Network failures:
         * 502
         *
         * Timeout:
         * 504
         */

        let statusCode = 502;
        let errorType = "NETWORK_ERROR";

        if (axios.isAxiosError(error)) {
            if (error.response) {
                statusCode = error.response.status;
                errorType = "HTTP_ERROR";
            } else if (
                error.code === "ECONNABORTED" ||
                error.code === "ETIMEDOUT"
            ) {
                statusCode = 504;
                errorType = "TIMEOUT";
            }
        }

        /*
         * ==========================================
         * SAVE FAILED REQUEST
         * ==========================================
         */

        const savedRequest = await postgresPool.query(
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
            RETURNING id
            `,
            [
                projectId,
                url,
                method,
                statusCode,
                latency,
                true,
            ]
        );

        const requestId = savedRequest.rows[0].id;

        /*
         * ==========================================
         * INCIDENT CHECKS
         * ==========================================
         */

        await checkErrorRate(projectId);

        await checkLatency(projectId, latency);

        /*
         * ==========================================
         * BROADCAST FAILURE EVENT
         * ==========================================
         */

        broadcast({
            type: "api_request",
            requestId,
            projectId,
            endpoint: url,
            method,
            statusCode,
            latency,
            success: false,
            chaos: false,
            errorType,
            timestamp: new Date().toISOString(),
        });

        /*
         * ==========================================
         * RETURN FAILURE RESULT
         * ==========================================
         */

        return {
            requestId,
            statusCode,
            latency,
            success: false,
        };
    }
};