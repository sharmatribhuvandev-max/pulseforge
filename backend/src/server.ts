import http from "http";
import mongoose from "mongoose";

import app from "./app";
import { env } from "./config/env";
import { connectMongoDB } from "./db/mongodb";
import { connectPostgres, postgresPool } from "./db/postgres";
import { initPostgres } from "./db/initPostgres";
import { closeWebSocket, initWebSocket } from "./services/websocketService";
import { createShutdownHandler, registerShutdownSignals } from "./shutdown";

async function closeDatabases(): Promise<void> {
    const results = await Promise.allSettled([
        mongoose.disconnect(),
        postgresPool.end(),
    ]);

    const failure = results.find(
        (result): result is PromiseRejectedResult =>
            result.status === "rejected",
    );

    if (failure) {
        throw failure.reason;
    }
}

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

        registerShutdownSignals(
            createShutdownHandler({
                server,
                closeWebSocket,
                closeDatabases,
                exit: (code) => process.exit(code),
            }),
        );
    } catch (error) {
        console.error("PulseForge startup failed:", error);

        await postgresPool.end().catch(() => undefined);
        process.exitCode = 1;
    }
}

void startServer();
