import { postgresPool } from "./postgres";

export async function initPostgres() {
    await postgresPool.query(`
        CREATE TABLE IF NOT EXISTS api_requests (
            id BIGSERIAL PRIMARY KEY,
            project_id VARCHAR(100) NOT NULL,
            endpoint VARCHAR(500) NOT NULL,
            method VARCHAR(10) NOT NULL,
            status_code INT NOT NULL,
            latency_ms INT NOT NULL,
            request_size INT,
            response_size INT,
            error BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await postgresPool.query(`
        CREATE TABLE IF NOT EXISTS incidents (
            id BIGSERIAL PRIMARY KEY,
            project_id VARCHAR(100) NOT NULL,
            type VARCHAR(100) NOT NULL,
            threshold NUMERIC,
            actual_value NUMERIC,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP
        );
    `);

    // Add the recovery counter to existing databases without losing incidents.
    await postgresPool.query(`
        ALTER TABLE incidents
        ADD COLUMN IF NOT EXISTS healthy_checks INTEGER NOT NULL DEFAULT 0;
    `);
    // Requests and incidents are tracked per endpoint (MongoDB Endpoint _id).
    // Rows recorded before per-endpoint tracking keep a NULL endpoint_id.
    await postgresPool.query(`
        ALTER TABLE api_requests
        ADD COLUMN IF NOT EXISTS endpoint_id VARCHAR(100);
    `);

    await postgresPool.query(`
        ALTER TABLE incidents
        ADD COLUMN IF NOT EXISTS endpoint_id VARCHAR(100);
    `);

    // Per-endpoint checks can never match or resolve a project-wide incident,
    // so close any that are still active. With no active NULL-endpoint rows,
    // the unique index below can always be built.
    const closedProjectWide = await postgresPool.query(`
        UPDATE incidents
        SET resolved_at = NOW()
        WHERE endpoint_id IS NULL
          AND resolved_at IS NULL;
    `);

    if (closedProjectWide.rowCount) {
        console.log(
            `Closed ${closedProjectWide.rowCount} active project-wide incident(s) from before per-endpoint tracking`
        );
    }

    // Only one active incident per project, endpoint and incident type.
    await postgresPool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_one_active_per_endpoint_type
        ON incidents (project_id, endpoint_id, type)
        NULLS NOT DISTINCT
        WHERE resolved_at IS NULL;
    `);

    // Replaced by the per-endpoint index above. Dropped only after it exists.
    await postgresPool.query(`
        DROP INDEX IF EXISTS idx_incidents_one_active_per_project_type;
    `);

    // Supports the per-endpoint "most recent requests" error-rate window.
    await postgresPool.query(`
        CREATE INDEX IF NOT EXISTS idx_api_requests_project_endpoint_recent
        ON api_requests (project_id, endpoint_id, created_at DESC, id DESC);
    `);
    console.log("PostgreSQL tables initialized");
}