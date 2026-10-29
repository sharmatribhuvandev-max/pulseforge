import axios from "axios";

import { requestOutbound } from "./outboundRequest";

import { postgresPool } from "../db/postgres";

import { broadcast } from "./websocketService";

import {
    checkErrorRate,
    checkLatency,
    resolveErrorRateIncident,
} from "./incidentService";

type OutboundResponse = Awaited<ReturnType<typeof requestOutbound>>;

/*
 * Raised internally when the outbound request resolved with a
 * non-2xx HTTP status. Lets it reuse the failed-request path.
 */
class UnexpectedHttpStatusError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(`Outbound API returned HTTP ${status}`);
        this.name = "UnexpectedHttpStatusError";
        this.status = status;
    }
}

/*
 * ==========================================
 * RECORD FAILED OUTBOUND REQUEST
 * ==========================================
 *
 * Called only when the outbound request itself failed.
 */

const recordFailedRequest = async (
    projectId: string,
    url: string,
    method: string,
    additionalLatency: number,
    startTime: number,
    error: unknown
) => {
    if (axios.isAxiosError(error)) {
        console.error("Outbound API request failed:", {
            code: error.code,
            message: error.message,
            responseStatus: error.response?.status,
        });
    } else {
        console.error(
            "Outbound API request failed:",
            error instanceof Error ? error.message : "Unknown error"
        );
    }

    const apiLatency = Date.now() - startTime;
    const latency = apiLatency + additionalLatency;

    /*
     * Actual HTTP errors keep their real status.
     * Network failures: 502. Timeouts: 504.
     */

    let statusCode = 502;
    let errorType = "NETWORK_ERROR";

    if (error instanceof UnexpectedHttpStatusError) {
        statusCode = error.status;
        errorType = "HTTP_ERROR";
    } else if (axios.isAxiosError(error)) {
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
        [projectId, url, method, statusCode, latency, true]
    );

    const requestId = savedRequest.rows[0].id;

    await checkErrorRate(projectId);

    // A failed request breaks the consecutive-healthy streak.
    // High latency also resets recovery, regardless of success.
    await checkLatency(projectId, latency, false);

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

    return {
        requestId,
        statusCode,
        latency,
        success: false,
    };
};

export const monitorApi = async (
    projectId: string,
    url: string,
    method: string,
    additionalLatency: number = 0
) => {
    const startTime = Date.now();

    /*
     * ==========================================
     * SEND REQUEST TO MONITORED API
     * ==========================================
     *
     * Only the outbound request is classified as an
     * outbound failure. Later database, incident, or
     * broadcast errors must not be recorded as a 502.
     */

    let response: OutboundResponse;

    try {
        response = await requestOutbound(url, method);
    } catch (error: unknown) {
        return recordFailedRequest(
            projectId,
            url,
            method,
            additionalLatency,
            startTime,
            error
        );
    }

    // A resolved non-2xx response is still a failed request.
    if (response.status < 200 || response.status >= 300) {
        return recordFailedRequest(
            projectId,
            url,
            method,
            additionalLatency,
            startTime,
            new UnexpectedHttpStatusError(response.status)
        );
    }

    const apiLatency = Date.now() - startTime;
    const latency = apiLatency + additionalLatency;

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
        [projectId, url, method, response.status, latency, false]
    );

    const requestId = savedRequest.rows[0].id;

    await resolveErrorRateIncident(projectId);

    // Only a successful request below the threshold advances recovery.
    await checkLatency(projectId, latency, true);

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

    return {
        requestId,
        statusCode: response.status,
        latency,
        success: true,
    };
};