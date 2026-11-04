import { postgresPool } from "../db/postgres";
import { broadcast } from "./websocketService";

const ERROR_RATE_THRESHOLD = 50;
const LATENCY_THRESHOLD = 1000;
const RECENT_REQUEST_LIMIT = 20;

/*
 * ==========================================
 * GET RECENT REQUEST STATISTICS
 * ==========================================
 */

async function getRecentRequestStats(projectId: string, endpointId: string) {
    const result = await postgresPool.query(
        `
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
                WHERE error = true
            )::int AS failed
        FROM (
            SELECT error
            FROM api_requests
            WHERE project_id = $1
              AND endpoint_id = $2
            ORDER BY created_at DESC, id DESC
            LIMIT $3
        ) recent_requests
        `,
        [projectId, endpointId, RECENT_REQUEST_LIMIT]
    );

    return {
        total: result.rows[0].total as number,
        failed: result.rows[0].failed as number
    };
}

/*
 * ==========================================
 * CHECK ERROR RATE
 * ==========================================
 */

export async function checkErrorRate(projectId: string, endpointId: string) {
    const { total, failed } = await getRecentRequestStats(projectId, endpointId);

    if (total === 0) {
        return;
    }

    const errorRate = (failed / total) * 100;

    if (errorRate >= ERROR_RATE_THRESHOLD) {
        const existing = await postgresPool.query(
            `
            UPDATE incidents
            SET actual_value = $3
            WHERE project_id = $1
              AND endpoint_id = $2
              AND type = 'HIGH_ERROR_RATE'
              AND resolved_at IS NULL
            RETURNING *
            `,
            [projectId, endpointId, errorRate]
        );

        if (existing.rows.length > 0) {
            broadcast({
                type: "incident_updated",
                projectId,
                incident: existing.rows[0]
            });

            return;
        }

        const incident = await postgresPool.query(
            `
            INSERT INTO incidents
            (
                project_id,
                endpoint_id,
                type,
                threshold,
                actual_value
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (project_id, endpoint_id, type)
            WHERE resolved_at IS NULL
            DO NOTHING
            RETURNING *
            `,
            [
                projectId,
                endpointId,
                "HIGH_ERROR_RATE",
                ERROR_RATE_THRESHOLD,
                errorRate
            ]
        );

        if (incident.rows.length === 0) {
            return;
        }

        broadcast({
            type: "incident_created",
            projectId,
            incident: incident.rows[0]
        });

        console.log(
            "High error rate incident created:",
            incident.rows[0]
        );

        return;
    }

    await resolveErrorRateIncident(projectId, endpointId, errorRate);
}

/*
 * ==========================================
 * CHECK LATENCY
 * ==========================================
 */

export async function checkLatency(
    projectId: string,
    endpointId: string,
    latency: number,
    requestSucceeded: boolean
) {
    if (latency >= LATENCY_THRESHOLD) {
        const existing = await postgresPool.query(
            `
            UPDATE incidents
            SET
                actual_value = $3,
                healthy_checks = 0
            WHERE id = (
                SELECT id
                FROM incidents
                WHERE project_id = $1
                  AND endpoint_id = $2
                  AND type = 'HIGH_LATENCY'
                  AND resolved_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            )
              AND resolved_at IS NULL
            RETURNING *
            `,
            [projectId, endpointId, latency]
        );

        if (existing.rows.length > 0) {
            broadcast({
                type: "incident_updated",
                projectId,
                incident: existing.rows[0]
            });

            return;
        }

        const incident = await postgresPool.query(
            `
            INSERT INTO incidents
            (
                project_id,
                endpoint_id,
                type,
                threshold,
                actual_value,
                healthy_checks
            )
            VALUES ($1, $2, $3, $4, $5, 0)
            ON CONFLICT (project_id, endpoint_id, type)
            WHERE resolved_at IS NULL
            DO NOTHING
            RETURNING *
            `,
            [
                projectId,
                endpointId,
                "HIGH_LATENCY",
                LATENCY_THRESHOLD,
                latency
            ]
        );

        if (incident.rows.length > 0) {
            broadcast({
                type: "incident_created",
                projectId,
                incident: incident.rows[0]
            });

            console.log(
                "High latency incident created:",
                incident.rows[0]
            );
        }

        return;
    }

    await resolveLatencyIncident(projectId, endpointId, latency, requestSucceeded);
}

/*
 * ==========================================
 * RESOLVE ERROR RATE INCIDENT
 * ==========================================
 */

export async function resolveErrorRateIncident(
    projectId: string,
    endpointId: string,
    errorRate?: number
) {
    if (errorRate === undefined) {
        const stats = await getRecentRequestStats(projectId, endpointId);

        if (stats.total === 0) {
            return;
        }

        errorRate = (stats.failed / stats.total) * 100;
    }

    if (errorRate >= ERROR_RATE_THRESHOLD) {
        return;
    }

    const activeIncident = await postgresPool.query(
        `
        SELECT id
        FROM incidents
        WHERE project_id = $1
          AND endpoint_id = $2
          AND type = 'HIGH_ERROR_RATE'
          AND resolved_at IS NULL
        LIMIT 1
        `,
        [projectId, endpointId]
    );

    if (activeIncident.rows.length === 0) {
        return;
    }

    const incident = await postgresPool.query(
        `
        UPDATE incidents
        SET
            resolved_at = NOW(),
            actual_value = $2
        WHERE id = $1
          AND resolved_at IS NULL
        RETURNING *
        `,
        [activeIncident.rows[0].id, errorRate]
    );

    if (incident.rows.length === 0) {
        return;
    }

    broadcast({
        type: "incident_resolved",
        projectId,
        incident: incident.rows[0]
    });

    console.log(
        "High error rate incident resolved:",
        incident.rows[0]
    );
}

/*
 * ==========================================
 * RESOLVE LATENCY INCIDENT
 * ==========================================
 */

export async function resolveLatencyIncident(
    projectId: string,
    endpointId: string,
    latency: number,
    requestSucceeded: boolean = true
) {
    if (latency >= LATENCY_THRESHOLD) {
        return;
    }

    const healthyIncrement = requestSucceeded ? 1 : 0;

    // A failed request still resets recovery, but its latency (for example a
    // fast connection refusal) is not a response-time measurement, so it
    // does not replace the recorded actual_value.
    const result = await postgresPool.query(
        `
        UPDATE incidents
        SET
            healthy_checks = CASE
                WHEN $3 = 1 THEN healthy_checks + 1
                ELSE 0
            END,
            actual_value = CASE
                WHEN $3 = 1 THEN $4
                ELSE actual_value
            END,
            resolved_at = CASE
                WHEN $3 = 1 AND healthy_checks + 1 >= 3
                    THEN NOW()
                ELSE resolved_at
            END
        WHERE id = (
            SELECT id
            FROM incidents
            WHERE project_id = $1
              AND endpoint_id = $2
              AND type = 'HIGH_LATENCY'
              AND resolved_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1
        )
          AND resolved_at IS NULL
        RETURNING *
        `,
        [projectId, endpointId, healthyIncrement, latency]
    );

    if (result.rows.length === 0) {
        return;
    }

    const incident = result.rows[0];

    if (incident.resolved_at) {
        broadcast({
            type: "incident_resolved",
            projectId,
            incident
        });

        console.log(
            "High latency incident resolved:",
            incident
        );

        return;
    }

    broadcast({
        type: "incident_updated",
        projectId,
        incident
    });
}

/*
 * ==========================================
 * RESOLVE ALL INCIDENTS OF AN ENDPOINT
 * ==========================================
 *
 * Used when an endpoint is deleted. It receives no more checks,
 * so its active incidents could otherwise never resolve.
 */

export async function resolveEndpointIncidents(
    projectId: string,
    endpointId: string
) {
    const result = await postgresPool.query(
        `
        UPDATE incidents
        SET resolved_at = NOW()
        WHERE project_id = $1
          AND endpoint_id = $2
          AND resolved_at IS NULL
        RETURNING *
        `,
        [projectId, endpointId]
    );

    for (const incident of result.rows) {
        broadcast({
            type: "incident_resolved",
            projectId,
            incident
        });
    }

    return result.rows;
}
