import { postgresPool } from "../db/postgres";

interface AnalyticsFilters {
    minutes?: number;
    endpoint?: string;
    method?: string;
    status?: "success" | "failed";
}

/*
 * Build common analytics WHERE conditions
 */
function buildAnalyticsQuery(
    projectId: string,
    filters: AnalyticsFilters
) {
    const conditions: string[] = ["project_id = $1"];
    const values: (string | number)[] = [projectId];

    let parameterIndex = 2;

    /*
     * Time range
     */
    if (
        filters.minutes !== undefined &&
        filters.minutes > 0
    ) {
        conditions.push(
            `created_at >= NOW() - ($${parameterIndex} * INTERVAL '1 minute')`
        );

        values.push(filters.minutes);
        parameterIndex++;
    }

    /*
     * Endpoint filter
     */
    if (filters.endpoint && filters.endpoint.trim() !== "") {
        conditions.push(`endpoint = $${parameterIndex}`);
        values.push(filters.endpoint.trim());
        parameterIndex++;
    }

    /*
     * Method filter
     */
    if (filters.method && filters.method.trim() !== "") {
        conditions.push(`method = $${parameterIndex}`);
        values.push(filters.method.trim().toUpperCase());
        parameterIndex++;
    }

    /*
     * Status filter
     */
    if (filters.status === "success") {
        conditions.push("error = false");
    }

    if (filters.status === "failed") {
        conditions.push("error = true");
    }

    return {
        whereClause: conditions.join(" AND "),
        values,
    };
}

/*
 * Project Analytics
 */
export async function getProjectAnalytics(
    projectId: string,
    filters: AnalyticsFilters = {}
) {
    const { whereClause, values } = buildAnalyticsQuery(
        projectId,
        filters
    );

    const result = await postgresPool.query(
        `
        SELECT
            COUNT(*)::int AS total_requests,
            COUNT(*) FILTER (
                WHERE error = false
            )::int AS successful_requests,
            COUNT(*) FILTER (
                WHERE error = true
            )::int AS failed_requests,
            COALESCE(ROUND(AVG(latency_ms)), 0)::int
                AS average_latency,
            COALESCE(MAX(latency_ms), 0)::int
                AS max_latency,
            COALESCE(
                ROUND(
                    PERCENTILE_CONT(0.95)
                    WITHIN GROUP (ORDER BY latency_ms)
                ),
                0
            )::int AS p95_latency
        FROM api_requests
        WHERE ${whereClause}
        `,
        values
    );

    const analytics = result.rows[0];

    const totalRequests = Number(analytics.total_requests);
    const successfulRequests = Number(analytics.successful_requests);
    const failedRequests = Number(analytics.failed_requests);

    const errorRate =
        totalRequests === 0
            ? 0
            : Number(
                  ((failedRequests / totalRequests) * 100).toFixed(2)
              );

    return {
        totalRequests,
        successfulRequests,
        failedRequests,
        errorRate,
        averageLatency: Number(analytics.average_latency),
        maxLatency: Number(analytics.max_latency),
        p95Latency: Number(analytics.p95_latency),
    };
}

/*
 * Endpoint Analytics
 */
export async function getEndpointAnalytics(
    projectId: string,
    filters: AnalyticsFilters = {}
) {
    const { whereClause, values } = buildAnalyticsQuery(
        projectId,
        filters
    );

    const result = await postgresPool.query(
        `
        SELECT
            endpoint,
            method,
            COUNT(*)::int AS total_requests,
            COUNT(*) FILTER (
                WHERE error = false
            )::int AS successful_requests,
            COUNT(*) FILTER (
                WHERE error = true
            )::int AS failed_requests,
            COALESCE(ROUND(AVG(latency_ms)), 0)::int
                AS average_latency,
            COALESCE(MAX(latency_ms), 0)::int
                AS max_latency,
            COALESCE(
                ROUND(
                    PERCENTILE_CONT(0.95)
                    WITHIN GROUP (ORDER BY latency_ms)
                ),
                0
            )::int AS p95_latency
        FROM api_requests
        WHERE ${whereClause}
        GROUP BY endpoint, method
        ORDER BY total_requests DESC
        `,
        values
    );

    return result.rows.map((row) => {
        const totalRequests = Number(row.total_requests);
        const successfulRequests = Number(row.successful_requests);
        const failedRequests = Number(row.failed_requests);

        const errorRate =
            totalRequests === 0
                ? 0
                : Number(
                      ((failedRequests / totalRequests) * 100).toFixed(2)
                  );

        return {
            endpoint: row.endpoint,
            method: row.method,
            totalRequests,
            successfulRequests,
            failedRequests,
            errorRate,
            averageLatency: Number(row.average_latency),
            maxLatency: Number(row.max_latency),
            p95Latency: Number(row.p95_latency),
        };
    });
}

/*
 * Latency History
 */
export async function getLatencyHistory(
    projectId: string,
    filters: AnalyticsFilters = {}
) {
    const { whereClause, values } = buildAnalyticsQuery(
        projectId,
        filters
    );

    const result = await postgresPool.query(
        `
        SELECT
            created_at,
            latency_ms,
            status_code,
            error
        FROM api_requests
        WHERE ${whereClause}
        ORDER BY created_at ASC
        LIMIT 100
        `,
        values
    );

    return result.rows.map((row) => ({
        timestamp: row.created_at,
        latency: Number(row.latency_ms),
        statusCode: Number(row.status_code),
        error: row.error,
    }));
}

/*
 * Recent API Events
 * Loads persisted requests so the dashboard can restore history after refresh.
 */
export async function getRecentApiEvents(
    projectId: string,
    limit: number = 20
) {
    const result = await postgresPool.query(
        `
        SELECT
            id,
            endpoint,
            method,
            status_code,
            latency_ms,
            error,
            created_at
        FROM api_requests
        WHERE project_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
        `,
        [projectId, limit]
    );

    return result.rows.map((row) => ({
        requestId: String(row.id),
        type: "api_request" as const,
        projectId,
        endpoint: row.endpoint,
        method: row.method,
        statusCode: Number(row.status_code),
        latency: Number(row.latency_ms),
        success: !row.error,
        chaos: false,
        timestamp:
            row.created_at instanceof Date
                ? row.created_at.toISOString()
                : String(row.created_at),
    }));
}