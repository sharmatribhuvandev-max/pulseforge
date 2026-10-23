import { Pool } from "pg";
import { env } from "../config/env";

export const postgresPool = new Pool({
    host: env.postgres.host,
    port: env.postgres.port,
    user: env.postgres.user,
    password: env.postgres.password,
    database: env.postgres.database
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