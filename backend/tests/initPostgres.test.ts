import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
    queryMock: vi.fn()
}));

vi.mock("../src/db/postgres", () => ({
    postgresPool: {
        query: queryMock
    }
}));

import { initPostgres } from "../src/db/initPostgres";

const ADD_REQUEST_ENDPOINT =
    /^ALTER TABLE api_requests ADD COLUMN IF NOT EXISTS endpoint_id VARCHAR\(100\);?$/;
const ADD_INCIDENT_ENDPOINT =
    /^ALTER TABLE incidents ADD COLUMN IF NOT EXISTS endpoint_id VARCHAR\(100\);?$/;
const CLOSE_PROJECT_WIDE_INCIDENTS =
    /^UPDATE incidents SET resolved_at = NOW\(\) WHERE endpoint_id IS NULL AND resolved_at IS NULL;?$/;
const CREATE_ENDPOINT_INDEX =
    /^CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_one_active_per_endpoint_type ON incidents \(project_id, endpoint_id, type\) NULLS NOT DISTINCT WHERE resolved_at IS NULL;?$/;
const DROP_PROJECT_INDEX =
    /^DROP INDEX IF EXISTS idx_incidents_one_active_per_project_type;?$/;
const CREATE_RECENT_REQUESTS_INDEX =
    /^CREATE INDEX IF NOT EXISTS idx_api_requests_project_endpoint_recent ON api_requests \(project_id, endpoint_id, created_at DESC, id DESC\);?$/;

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

function statements(): string[] {
    return queryMock.mock.calls.map(([sql]) => normalize(String(sql)));
}

function positionOf(pattern: RegExp): number {
    const position = statements().findIndex((sql) => pattern.test(sql));

    expect(position, `no statement matches ${pattern}`).toBeGreaterThanOrEqual(0);

    return position;
}

function mockClosedProjectWideIncidents(rowCount: number) {
    queryMock.mockImplementation(async (sql: string) =>
        CLOSE_PROJECT_WIDE_INCIDENTS.test(normalize(sql))
            ? { rows: [], rowCount }
            : { rows: [], rowCount: 0 }
    );
}

describe("initPostgres", () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        queryMock.mockReset();
        mockClosedProjectWideIncidents(0);
        logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    });

    it("creates new tables with timestamptz columns", async () => {
        await initPostgres();

        const createRequests = statements()[positionOf(/^CREATE TABLE IF NOT EXISTS api_requests\b/)];
        const createIncidents = statements()[positionOf(/^CREATE TABLE IF NOT EXISTS incidents\b/)];

        expect(createRequests).toContain("created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP");
        expect(createIncidents).toContain("started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP");
        expect(createIncidents).toContain("resolved_at TIMESTAMPTZ");
        expect(createRequests + createIncidents).not.toMatch(/\bTIMESTAMP\b(?!TZ)/);
    });

    it.each([
        ["api_requests", "created_at"],
        ["incidents", "started_at"],
        ["incidents", "resolved_at"],
    ])("converts existing %s.%s to timestamptz only while it is still a plain timestamp", async (table, column) => {
        await initPostgres();

        const conversion = statements()[positionOf(/^DO \$\$/)];

        expect(conversion).toContain(`table_name = '${table}' AND column_name = '${column}'`);
        expect(conversion).toContain("'timestamp without time zone'");
        expect(conversion).toContain(
            `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE TIMESTAMPTZ USING ${column} AT TIME ZONE current_setting('TimeZone')`
        );
    });

    it("converts timestamp columns after the tables exist", async () => {
        await initPostgres();

        expect(positionOf(/^CREATE TABLE IF NOT EXISTS incidents\b/)).toBeLessThan(positionOf(/^DO \$\$/));
    });

    it("adds a nullable endpoint_id column to api_requests and incidents", async () => {
        await initPostgres();

        positionOf(ADD_REQUEST_ENDPOINT);
        positionOf(ADD_INCIDENT_ENDPOINT);
    });

    it("closes active project-wide incidents after adding the column and before creating the per-endpoint index", async () => {
        await initPostgres();

        const addColumn = positionOf(ADD_INCIDENT_ENDPOINT);
        const closeProjectWide = positionOf(CLOSE_PROJECT_WIDE_INCIDENTS);
        const createIndex = positionOf(CREATE_ENDPOINT_INDEX);

        expect(addColumn).toBeLessThan(closeProjectWide);
        expect(closeProjectWide).toBeLessThan(createIndex);
    });

    it("creates the per-endpoint unique index before dropping the per-project index", async () => {
        await initPostgres();

        const createIndex = positionOf(CREATE_ENDPOINT_INDEX);
        const dropOldIndex = positionOf(DROP_PROJECT_INDEX);

        expect(createIndex).toBeLessThan(dropOldIndex);
        expect(
            statements().some((sql) =>
                /CREATE UNIQUE INDEX .*idx_incidents_one_active_per_project_type/.test(sql)
            )
        ).toBe(false);
    });

    it("adds an index for the most recent requests of an endpoint", async () => {
        await initPostgres();

        positionOf(CREATE_RECENT_REQUESTS_INDEX);
    });

    // Characterization: the current schema statements are already idempotent.
    it("uses only schema statements that are safe to run repeatedly", async () => {
        await initPostgres();

        for (const sql of statements()) {
            if (/^(CREATE|ALTER)\b/.test(sql)) {
                expect(sql, sql).toMatch(/IF NOT EXISTS/);
            }

            if (/^DROP\b/.test(sql)) {
                expect(sql, sql).toMatch(/IF EXISTS/);
            }
        }
    });

    it("logs how many project-wide incidents were closed", async () => {
        mockClosedProjectWideIncidents(2);

        await initPostgres();

        expect(logSpy).toHaveBeenCalledWith(
            "Closed 2 active project-wide incident(s) from before per-endpoint tracking"
        );
    });

    it("does not log a closing message when there were no project-wide incidents", async () => {
        await initPostgres();

        expect(
            logSpy.mock.calls.some(([message]) =>
                String(message).startsWith("Closed ")
            )
        ).toBe(false);
    });
});
