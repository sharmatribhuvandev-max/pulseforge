import http, { Server } from "http";
import { AddressInfo } from "net";
import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    createShutdownHandler,
    registerShutdownSignals,
} from "../src/shutdown";

const openServers: Server[] = [];
const openAgents: http.Agent[] = [];

async function startServer(handler?: http.RequestListener): Promise<Server> {
    const server = http.createServer(
        handler ??
            ((_req, res) => {
                res.end("ok");
            }),
    );

    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    openServers.push(server);

    return server;
}

function portOf(server: Server): number {
    return (server.address() as AddressInfo).port;
}

function get(
    port: number,
    agent: http.Agent | false = false,
): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.get(
            { host: "127.0.0.1", port, path: "/", agent },
            (res) => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", (chunk: string) => {
                    body += chunk;
                });
                res.on("end", () => {
                    resolve({ status: res.statusCode ?? 0, body });
                });
            },
        );

        req.on("error", reject);
    });
}

function createDeps(
    server: Server,
    overrides: Record<string, unknown> = {},
) {
    return {
        server,
        closeWebSocket: vi.fn(),
        closeDatabases: vi.fn().mockResolvedValue(undefined),
        exit: vi.fn(),
        log: vi.fn(),
        ...overrides,
    };
}

afterEach(async () => {
    for (const agent of openAgents.splice(0)) {
        agent.destroy();
    }

    for (const server of openServers.splice(0)) {
        server.closeAllConnections();

        if (server.listening) {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        }
    }
});

describe("graceful shutdown", () => {
    it("closes WebSockets, stops accepting connections, closes databases, then exits with 0", async () => {
        const server = await startServer();
        const port = portOf(server);
        const order: string[] = [];
        const deps = createDeps(server, {
            timeoutMs: 30,
            closeWebSocket: vi.fn(() => {
                order.push("websocket");
            }),
            closeDatabases: vi.fn(async () => {
                order.push(`databases (listening: ${server.listening})`);
            }),
            exit: vi.fn(() => {
                order.push("exit");
            }),
        });

        await createShutdownHandler(deps)("SIGTERM");

        expect(order).toEqual([
            "websocket",
            "databases (listening: false)",
            "exit",
        ]);
        expect(deps.exit).toHaveBeenCalledWith(0);
        await expect(get(port)).rejects.toThrow();

        // The deadline timer must be cleared after a clean shutdown.
        await new Promise((resolve) => setTimeout(resolve, 60));
        expect(deps.exit).toHaveBeenCalledTimes(1);
    });

    it("lets an in-flight request finish before closing the databases", async () => {
        let releaseResponse: () => void = () => undefined;
        let markStarted: () => void = () => undefined;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });

        const server = await startServer((_req, res) => {
            releaseResponse = () => res.end("done");
            markStarted();
        });
        const deps = createDeps(server);

        const response = get(portOf(server));
        await started;

        const shutdown = createShutdownHandler(deps)("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(deps.closeDatabases).not.toHaveBeenCalled();
        expect(deps.exit).not.toHaveBeenCalled();

        releaseResponse();

        await expect(response).resolves.toEqual({ status: 200, body: "done" });
        await shutdown;

        expect(deps.closeDatabases).toHaveBeenCalledOnce();
        expect(deps.exit).toHaveBeenCalledWith(0);
    });

    it("does not wait for a keep-alive connection that becomes idle after its response", async () => {
        let releaseResponse: () => void = () => undefined;
        let markStarted: () => void = () => undefined;
        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });

        const server = await startServer((_req, res) => {
            releaseResponse = () => res.end("done");
            markStarted();
        });
        const agent = new http.Agent({ keepAlive: true });
        openAgents.push(agent);
        const deps = createDeps(server);

        const response = get(portOf(server), agent);
        await started;

        const startedAt = Date.now();
        const shutdown = createShutdownHandler(deps)("SIGTERM");
        releaseResponse();

        await expect(response).resolves.toEqual({ status: 200, body: "done" });
        await shutdown;

        expect(Date.now() - startedAt).toBeLessThan(1_000);
        expect(deps.exit).toHaveBeenCalledWith(0);
    });

    it("forces exit with 1 when shutdown exceeds the deadline", async () => {
        const server = await startServer();
        const deps = createDeps(server, {
            timeoutMs: 50,
            closeDatabases: vi.fn(() => new Promise<void>(() => undefined)),
        });

        void createShutdownHandler(deps)("SIGTERM");

        await vi.waitFor(
            () => {
                expect(deps.exit).toHaveBeenCalledWith(1);
            },
            { timeout: 1_000 },
        );
        expect(deps.exit).toHaveBeenCalledTimes(1);
    });

    it("exits with 1 when closing the databases fails", async () => {
        const server = await startServer();
        const failure = new Error("pool end failed");
        const deps = createDeps(server, {
            closeDatabases: vi.fn().mockRejectedValue(failure),
        });

        await createShutdownHandler(deps)("SIGTERM");

        expect(deps.exit).toHaveBeenCalledTimes(1);
        expect(deps.exit).toHaveBeenCalledWith(1);
        expect(deps.log).toHaveBeenCalledWith(
            expect.any(String),
            failure,
        );
    });

    it("runs shutdown only once when a second signal arrives", async () => {
        const server = await startServer();
        const deps = createDeps(server);
        const handler = createShutdownHandler(deps);

        await Promise.all([handler("SIGTERM"), handler("SIGINT")]);

        expect(deps.closeWebSocket).toHaveBeenCalledTimes(1);
        expect(deps.closeDatabases).toHaveBeenCalledTimes(1);
        expect(deps.exit).toHaveBeenCalledTimes(1);
    });

    it("registers the handler for SIGTERM and SIGINT", () => {
        const source = new EventEmitter();
        const handler = vi.fn().mockResolvedValue(undefined);

        registerShutdownSignals(handler, source);
        source.emit("SIGTERM");
        source.emit("SIGINT");

        expect(handler.mock.calls).toEqual([["SIGTERM"], ["SIGINT"]]);
    });
});