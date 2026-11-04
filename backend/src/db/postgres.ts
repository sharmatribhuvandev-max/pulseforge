import { Pool } from "pg";
import { env } from "../config/env";

export const postgresPool = new Pool({
    host: env.postgres.host,
    port: env.postgres.port,
    user: env.postgres.user,
    password: env.postgres.password,
    database: env.postgres.database
});

// An idle client can lose its connection, for example when Neon suspends
// compute. pg-pool removes that client and emits "error" on the pool; with
// no listener, Node throws and the process crashes. pg attaches the client
// to the error, so log selected fields only.
postgresPool.on("error", (error: Error & { code?: string }) => {
    console.error("PostgreSQL idle client error:", {
        name: error.name,
        code: error.code,
        message: error.message,
    });
});

export async function connectPostgres() {
    try {
        const client = await postgresPool.connect();

        console.log("PostgreSQL connected");

        client.release();
    } catch (error) {
        console.error("PostgreSQL connection failed:", error);
        process.exit(1);
    }
}