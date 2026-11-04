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
    broadcast,
} from "../src/services/websocketService";
import { issueWebSocketTicket } from "../src/services/webSocketTicketService";

// The maxBufferedBytes option does not exist yet, so these tests fail until it does.
const init = initWebSocket as unknown as (s: http.Server, o: unknown) => void;

const LIMIT = 1024 * 1024;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("WebSocket slow-client protection", () => {
    let server: http.Server;
    let clients: WebSocket[] = [];
    let bufferedSpy: { mockRestore: () => void } | undefined;

    // Local ports of test clients whose server-side socket reports a full queue.
    const slowPorts = new Set<number>();
    let queuedBytes = 2 * LIMIT;

    afterEach(async () => {
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.close();
            } else if (client.readyState === WebSocket.CONNECTING) {
                client.terminate();
            }
        }
        clients = [];

        bufferedSpy?.mockRestore();
        bufferedSpy = undefined;
        slowPorts.clear();

        closeWebSocket();

        if (server?.listening) {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        }

        vi.clearAllMocks();
    });

    async function start(): Promise<string> {
        queuedBytes = 2 * LIMIT;

        findProjectsMock.mockImplementation(() => ({
            select: () => ({
                lean: async () => [{ _id: "project-a" }],
            }),
        }));

        // Real sockets, but the queue size of chosen server-side sockets is set by the test.
        bufferedSpy = vi
            .spyOn(WebSocket.prototype, "bufferedAmount", "get")
            .mockImplementation(function (this: any) {
                return this._isServer && slowPorts.has(this._socket?.remotePort)
                    ? queuedBytes
                    : 0;
            });

        server = http.createServer();
        init(server, { maxBufferedBytes: LIMIT });

        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === "string") {
            throw new Error("Test server did not bind to a TCP port");
        }

        return `ws://127.0.0.1:${address.port}`;
    }

    async function connect(url: string, slow: boolean) {
        const ticket = issueWebSocketTicket("user-a");
        const client = new WebSocket(`${url}/?ticket=${ticket}`, {
            origin: "http://localhost:5173",
        });
        clients.push(client);

        const messages: string[] = [];
        client.on("message", (message) => messages.push(message.toString()));

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

        // Let the welcome message arrive, then discard it.
        await sleep(50);
        messages.length = 0;

        if (slow) {
            slowPorts.add((client as any)._socket.localPort);
        }

        return { client, messages };
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

    it("terminates a client whose queue is over the limit and sends it nothing", async () => {
        const url = await start();
        const slow = await connect(url, true);

        broadcast({ type: "api_request", projectId: "project-a", requestId: "r1" });

        const closed = await waitForClose(slow.client, 1500);
        await sleep(50);

        expect(closed, "the slow client was not terminated").toBe(true);
        expect(slow.messages).toHaveLength(0);
    });

    it("[characterization, passes before the fix] still sends to a client exactly at the limit", async () => {
        const url = await start();
        queuedBytes = LIMIT;
        const edge = await connect(url, true);

        broadcast({ type: "api_request", projectId: "project-a", requestId: "r1" });
        await sleep(100);

        expect(edge.messages).toHaveLength(1);
        expect(edge.client.readyState).toBe(WebSocket.OPEN);
    });

    it("terminates only the slow client and still serves a healthy one", async () => {
        const url = await start();
        const slow = await connect(url, true);
        const healthy = await connect(url, false);

        broadcast({ type: "api_request", projectId: "project-a", requestId: "r1" });

        const slowClosed = await waitForClose(slow.client, 1500);
        await sleep(50);

        expect(slowClosed, "the slow client was not terminated").toBe(true);
        expect(healthy.client.readyState).toBe(WebSocket.OPEN);
        expect(healthy.messages).toHaveLength(1);
        expect(JSON.parse(healthy.messages[0]!).requestId).toBe("r1");
    });
});