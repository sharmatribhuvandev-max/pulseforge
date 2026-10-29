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

async function getRecentRequestStats(projectId: string) {
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
            ORDER BY created_at DESC
            LIMIT $2
        ) recent_requests
        `,
        [projectId, RECENT_REQUEST_LIMIT]
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

export async function checkErrorRate(projectId: string) {
    const { total, failed } = await getRecentRequestStats(projectId);

    if (total === 0) {
        return;
    }

    const errorRate = (failed / total) * 100;

    if (errorRate >= ERROR_RATE_THRESHOLD) {
        const existing = await postgresPool.query(
            `
            SELECT id
            FROM incidents
            WHERE project_id = $1
              AND type = 'HIGH_ERROR_RATE'
              AND resolved_at IS NULL
            LIMIT 1
            `,
            [projectId]
        );

        if (existing.rows.length === 0) {
            const incident = await postgresPool.query(
                `
                INSERT INTO incidents
                (
                    project_id,
                    type,
                    threshold,
                    actual_value
                )
                VALUES ($1, $2, $3, $4)
                RETURNING *
                `,
                [
                    projectId,
                    "HIGH_ERROR_RATE",
                    ERROR_RATE_THRESHOLD,
                    errorRate
                ]
            );

            broadcast({
                type: "incident_created",
                projectId,
                incident: incident.rows[0]
            });

            console.log(
                "High error rate incident created:",
                incident.rows[0]
            );
        }

        return;
    }

    await resolveErrorRateIncident(projectId, errorRate);
}

/*
 * ==========================================
 * CHECK LATENCY
 * ==========================================
 */

export async function checkLatency(
    projectId: string,
    latency: number,
    requestSucceeded: boolean
) {
    if (latency >= LATENCY_THRESHOLD) {
        const existing = await postgresPool.query(
            `
            UPDATE incidents
            SET
                actual_value = $2,
                healthy_checks = 0
            WHERE id = (
                SELECT id
                FROM incidents
                WHERE project_id = $1
                  AND type = 'HIGH_LATENCY'
                  AND resolved_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            )
              AND resolved_at IS NULL
            RETURNING *
            `,
            [projectId, latency]
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
                type,
                threshold,
                actual_value,
                healthy_checks
            )
            SELECT
                $1::VARCHAR(100),
                $2::VARCHAR(100),
                $3::NUMERIC,
                $4::NUMERIC,
                0
            WHERE NOT EXISTS (
                SELECT 1
                FROM incidents
                WHERE project_id = $1::VARCHAR(100)
                  AND type = 'HIGH_LATENCY'
                  AND resolved_at IS NULL
            )
            RETURNING *
            `,
            [
                projectId,
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

    await resolveLatencyIncident(projectId, latency, requestSucceeded);
}

/*
 * ==========================================
 * RESOLVE ERROR RATE INCIDENT
 * ==========================================
 */

export async function resolveErrorRateIncident(
    projectId: string,
    errorRate?: number
) {
    if (errorRate === undefined) {
        const stats = await getRecentRequestStats(projectId);

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
          AND type = 'HIGH_ERROR_RATE'
          AND resolved_at IS NULL
        LIMIT 1
        `,
        [projectId]
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
    latency: number,
    requestSucceeded: boolean = true
) {
    if (latency >= LATENCY_THRESHOLD) {
        return;
    }

    const healthyIncrement = requestSucceeded ? 1 : 0;

    const result = await postgresPool.query(
        `
        UPDATE incidents
        SET
            healthy_checks = CASE
                WHEN $2 = 1 THEN healthy_checks + 1
                ELSE 0
            END,
            actual_value = $3,
            resolved_at = CASE
                WHEN $2 = 1 AND healthy_checks + 1 >= 3
                    THEN NOW()
                ELSE resolved_at
            END
        WHERE id = (
            SELECT id
            FROM incidents
            WHERE project_id = $1
              AND type = 'HIGH_LATENCY'
              AND resolved_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1
        )
          AND resolved_at IS NULL
        RETURNING *
        `,
        [projectId, healthyIncrement, latency]
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
