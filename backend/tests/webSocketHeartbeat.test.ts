import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import WebSocket from "ws";

const { findProjectsMock } = vi.hoisted(() => ({
    findProjectsMock: vi.fn(),
}));

vi.mock("../src/models/Project", () => ({
    Project: {
        find: findProjectsMock,
    },
}));

vi.mock("../src/config/env", () => ({
    env: {
        frontendUrl: "http://localhost:5173",
    },
}));

import {
    initWebSocket,
    closeWebSocket,
} from "../src/services/websocketService";
import { issueWebSocketTicket } from "../src/services/webSocketTicketService";

// The options argument and closeWebSocket do not exist yet, so these tests fail until they do.
const init = initWebSocket as unknown as (s: http.Server, o: unknown) => void;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("WebSocket heartbeat", () => {
    let server: http.Server;
    let clients: WebSocket[] = [];

    afterEach(async () => {
        vi.useRealTimers();

        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.close();
            } else if (client.readyState === WebSocket.CONNECTING) {
                client.terminate();
            }
        }
        clients = [];

        if (typeof closeWebSocket === "function") {
            closeWebSocket();
        }

        if (server?.listening) {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        }

        vi.clearAllMocks();
    });

    async function start(options: { heartbeatIntervalMs: number }): Promise<string> {
        findProjectsMock.mockImplementation(() => ({
            select: () => ({
                lean: async () => [{ _id: "project-a" }],
            }),
        }));

        server = http.createServer();
        init(server, options);

        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === "string") {
            throw new Error("Test server did not bind to a TCP port");
        }

        return `ws://127.0.0.1:${address.port}`;
    }

    async function connect(url: string, autoPong = true): Promise<WebSocket> {
        const ticket = issueWebSocketTicket("user-a");
        const client = new WebSocket(`${url}/?ticket=${ticket}`, {
            origin: "http://localhost:5173",
            autoPong,
        });
        clients.push(client);

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error("Connection timed out")),
                3000,
            );
            client.once("open", () => {
                clearTimeout(timer);
                resolve();
            });
            client.once("error", (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });

        return client;
    }

    function waitForClose(client: WebSocket, ms: number): Promise<boolean> {
        if (client.readyState === WebSocket.CLOSED) {
            return Promise.resolve(true);
        }

        return new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), ms);
            client.once("close", () => {
                clearTimeout(timer);
                resolve(true);
            });
        });
    }

    it("sends pings to a connected client", async () => {
        const url = await start({ heartbeatIntervalMs: 50 });
        const client = await connect(url);

        let pings = 0;
        client.on("ping", () => {
            pings += 1;
        });

        await sleep(300);

        expect(pings).toBeGreaterThanOrEqual(2);
    });

    it("terminates a client that never answers pings", async () => {
        const url = await start({ heartbeatIntervalMs: 50 });
        const dead = await connect(url, false);

        const closed = await waitForClose(dead, 1500);

        expect(closed, "the unresponsive client was not terminated").toBe(true);
    });

    it("[characterization, passes before the heartbeat exists] keeps a client that answers pings", async () => {
        const url = await start({ heartbeatIntervalMs: 50 });
        const alive = await connect(url);

        await sleep(400);

        expect(alive.readyState).toBe(WebSocket.OPEN);
    });

    it("does not stack heartbeat timers when initialised twice", () => {
        vi.useFakeTimers();
        const before = vi.getTimerCount();

        server = http.createServer();
        init(server, { heartbeatIntervalMs: 1000 });
        init(http.createServer(), { heartbeatIntervalMs: 1000 });

        expect(vi.getTimerCount() - before).toBe(1);
    });

    it("closeWebSocket terminates open clients", async () => {
        const url = await start({ heartbeatIntervalMs: 50 });
        const client = await connect(url);

        closeWebSocket();

        const closed = await waitForClose(client, 1500);

        expect(closed, "closeWebSocket did not terminate the client").toBe(true);
    });

    it("closeWebSocket clears the heartbeat timer", () => {
        vi.useFakeTimers();
        const before = vi.getTimerCount();

        server = http.createServer();
        init(server, { heartbeatIntervalMs: 1000 });

        expect(vi.getTimerCount() - before).toBe(1);

        closeWebSocket();

        expect(vi.getTimerCount() - before).toBe(0);
    });
});