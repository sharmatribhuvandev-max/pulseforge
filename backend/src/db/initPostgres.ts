
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

    console.log("PostgreSQL tables initialized");
}
