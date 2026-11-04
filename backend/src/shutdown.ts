import type { Server } from "http";

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownDependencies {
    server: Server;
    closeWebSocket: () => void;
    closeDatabases: () => Promise<void>;
    exit: (code: number) => void;
    timeoutMs?: number;
    log?: (message: string, error?: unknown) => void;
}

export interface SignalSource {
    once(event: "SIGTERM" | "SIGINT", listener: () => void): unknown;
}

function defaultLog(message: string, error?: unknown): void {
    if (error === undefined) {
        console.log(message);
    } else {
        console.error(message, error);
    }
}

const IDLE_SWEEP_INTERVAL_MS = 100;

function closeHttpServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        // server.close() closes idle connections only once. A keep-alive
        // connection whose response finishes later would stay open until its
        // keep-alive timeout, so keep closing idle connections until done.
        const idleSweep = setInterval(() => {
            server.closeIdleConnections();
        }, IDLE_SWEEP_INTERVAL_MS);

        server.close((error) => {
            clearInterval(idleSweep);

            if (
                error &&
                (error as NodeJS.ErrnoException).code !==
                    "ERR_SERVER_NOT_RUNNING"
            ) {
                reject(error);
                return;
            }

            resolve();
        });

        server.closeIdleConnections();
    });
}

// Order: stop WebSockets, stop accepting HTTP connections and wait for
// in-flight requests, close the databases, then exit. A deadline forces
// exit(1) if any step hangs. Later signals reuse the running shutdown.
export function createShutdownHandler(
    deps: ShutdownDependencies,
): (signal: string) => Promise<void> {
    const log = deps.log ?? defaultLog;
    const timeoutMs = deps.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    let running: Promise<void> | undefined;

    async function run(signal: string): Promise<void> {
        log(`Received ${signal}, shutting down gracefully`);

        let exited = false;

        const deadline = setTimeout(() => {
            if (exited) return;

            exited = true;
            log(`Graceful shutdown exceeded ${timeoutMs} ms, forcing exit`);
            deps.exit(1);
        }, timeoutMs);

        let exitCode = 0;

        try {
            deps.closeWebSocket();
            await closeHttpServer(deps.server);
            await deps.closeDatabases();
            log("Graceful shutdown complete");
        } catch (error) {
            exitCode = 1;
            log("Graceful shutdown failed:", error);
        }

        clearTimeout(deadline);

        if (exited) return;

        exited = true;
        deps.exit(exitCode);
    }

    return (signal: string): Promise<void> => {
        running ??= run(signal);

        return running;
    };
}

export function registerShutdownSignals(
    handler: (signal: string) => Promise<void>,
    source: SignalSource = process,
): void {
    source.once("SIGTERM", () => {
        void handler("SIGTERM");
    });
    source.once("SIGINT", () => {
        void handler("SIGINT");
    });
}