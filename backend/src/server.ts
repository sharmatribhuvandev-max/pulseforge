import http from "http";

import app from "./app";
import { env } from "./config/env";
import { connectMongoDB } from "./db/mongodb";
import { connectPostgres, postgresPool } from "./db/postgres";
import { initPostgres } from "./db/initPostgres";
import { initWebSocket } from "./services/websocketService";

async function startServer() {
    try {
        await connectMongoDB();
        await connectPostgres();
        await initPostgres();

        const server = http.createServer(app);

        initWebSocket(server);

        server.listen(env.port, () => {
            console.log(`PulseForge server running on port ${env.port}`);
        });
    } catch (error) {
        console.error("PulseForge startup failed:", error);

        await postgresPool.end().catch(() => undefined);
        process.exitCode = 1;
    }
}

void startServer();
