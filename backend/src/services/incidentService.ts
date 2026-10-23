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

async function getRecentRequestStats(
    projectId: string
) {
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
        [
            projectId,
            RECENT_REQUEST_LIMIT
        ]
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

export async function checkErrorRate(
    projectId: string
) {
    const {
        total,
        failed
    } = await getRecentRequestStats(projectId);

    if (total === 0) {
        return;
    }

    const errorRate =
        (failed / total) * 100;


    /*
     * Error rate is HIGH
     */
    if (errorRate >= ERROR_RATE_THRESHOLD) {

        const existing =
            await postgresPool.query(
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


        /*
         * Create incident only if
         * one does not already exist.
         */
        if (existing.rows.length === 0) {

            const incident =
                await postgresPool.query(
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
                "🚨 High error rate incident created:",
                incident.rows[0]
            );
        }

        return;
    }


    /*
     * Error rate is HEALTHY
     *
     * Resolve existing incident.
     */

    await resolveErrorRateIncident(
        projectId,
        errorRate
    );
}


/*
 * ==========================================
 * CHECK LATENCY
 * ==========================================
 */

export async function checkLatency(
    projectId: string,
    latency: number
) {

    /*
     * High latency
     */
    if (latency >= LATENCY_THRESHOLD) {

        const existing =
            await postgresPool.query(
                `
                SELECT id
                FROM incidents
                WHERE project_id = $1
                  AND type = 'HIGH_LATENCY'
                  AND resolved_at IS NULL
                LIMIT 1
                `,
                [projectId]
            );


        if (existing.rows.length === 0) {

            const incident =
                await postgresPool.query(
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
                        "HIGH_LATENCY",
                        LATENCY_THRESHOLD,
                        latency
                    ]
                );


            broadcast({
                type: "incident_created",
                projectId,
                incident: incident.rows[0]
            });


            console.log(
                "🚨 High latency incident created:",
                incident.rows[0]
            );
        }

        return;
    }


    /*
     * Latency is healthy.
     *
     * Resolve existing incident.
     */

    await resolveLatencyIncident(
        projectId,
        latency
    );
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

    /*
     * If errorRate wasn't supplied,
     * calculate it from recent requests.
     */

    if (errorRate === undefined) {

        const stats =
            await getRecentRequestStats(
                projectId
            );

        if (stats.total === 0) {
            return;
        }

        errorRate =
            (stats.failed / stats.total) * 100;
    }


    /*
     * Still unhealthy.
     */
    if (errorRate >= ERROR_RATE_THRESHOLD) {
        return;
    }


    /*
     * Find active incident.
     */

    const activeIncident =
        await postgresPool.query(
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


    /*
     * Resolve incident.
     */

    const incident =
        await postgresPool.query(
            `
            UPDATE incidents
            SET
                resolved_at = NOW(),
                actual_value = $2
            WHERE id = $1
            RETURNING *
            `,
            [
                activeIncident.rows[0].id,
                errorRate
            ]
        );


    broadcast({
        type: "incident_resolved",
        projectId,
        incident: incident.rows[0]
    });


    console.log(
        "✅ High error rate incident resolved:",
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
    latency: number
) {

    /*
     * Still high.
     */
    if (latency >= LATENCY_THRESHOLD) {
        return;
    }


    /*
     * Find active latency incident.
     */

    const activeIncident =
        await postgresPool.query(
            `
            SELECT id
            FROM incidents
            WHERE project_id = $1
              AND type = 'HIGH_LATENCY'
              AND resolved_at IS NULL
            LIMIT 1
            `,
            [projectId]
        );


    if (activeIncident.rows.length === 0) {
        return;
    }


    /*
     * Resolve incident.
     */

    const incident =
        await postgresPool.query(
            `
            UPDATE incidents
            SET
                resolved_at = NOW(),
                actual_value = $2
            WHERE id = $1
            RETURNING *
            `,
            [
                activeIncident.rows[0].id,
                latency
            ]
        );


    broadcast({
        type: "incident_resolved",
        projectId,
        incident: incident.rows[0]
    });


    console.log(
        "✅ High latency incident resolved:",
        incident.rows[0]
    );
}