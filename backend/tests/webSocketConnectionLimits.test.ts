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

import { initWebSocket } from "../src/services/websocketService";
import { issueWebSocketTicket } from "../src/services/webSocketTicketService";

type Outcome =
    | { kind: "open"; client: WebSocket }
    | { kind: "rejected"; status: number };

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("WebSocket connection limits", () => {
    let server: http.Server;
    let clients: WebSocket[] = [];

    afterEach(async () => {
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.close();
            } else if (client.readyState === WebSocket.CONNECTING) {
                client.terminate();
            }
        }
        clients = [];

        if (server?.listening) {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        }

        vi.clearAllMocks();
    });

    async function start(options: {
        maxConnectionsPerUser?: number;
        maxTotalConnections?: number;
    }): Promise<string> {
        // The project lookup takes a little time, so concurrent upgrades overlap.
        findProjectsMock.mockImplementation(() => ({
            select: () => ({
                lean: async () => {
                    await sleep(30);
                    return [{ _id: "project-a" }];
                },
            }),
        }));

        server = http.createServer();
        // The second argument does not exist yet, so these tests fail until it is added.
        (initWebSocket as unknown as (s: http.Server, o: unknown) => void)(server, options);

        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === "string") {
            throw new Error("Test server did not bind to a TCP port");
        }

        return `ws://127.0.0.1:${address.port}`;
    }

    function attempt(url: string, userId: string, existingTicket?: string): Promise<Outcome> {
        const ticket = existingTicket ?? issueWebSocketTicket(userId);
        const client = new WebSocket(`${url}/?ticket=${ticket}`, {
            origin: "http://localhost:5173",
        });
        clients.push(client);

        return new Promise<Outcome>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error("Connection attempt timed out")),
                3000,
            );
            client.once("open", () => {
                clearTimeout(timer);
                resolve({ kind: "open", client });
            });
            client.once("unexpected-response", (_request, response) => {
                clearTimeout(timer);
                response.resume();
                resolve({ kind: "rejected", status: response.statusCode ?? 0 });
            });
            client.once("error", () => undefined);
        });
    }

    function requireOpen(outcome: Outcome): WebSocket {
        if (outcome.kind !== "open") {
            throw new Error(`Expected an open connection, got HTTP ${outcome.status}`);
        }
        return outcome.client;
    }

    it("refuses a user's connection over the limit with 429 and keeps existing ones", async () => {
        const url = await start({ maxConnectionsPerUser: 2 });

        const first = requireOpen(await attempt(url, "user-a"));
        const second = requireOpen(await attempt(url, "user-a"));

        const third = await attempt(url, "user-a");

        expect(third).toEqual({ kind: "rejected", status: 429 });
        expect(first.readyState).toBe(WebSocket.OPEN);
        expect(second.readyState).toBe(WebSocket.OPEN);
    });

    it("does not count other users' connections against the limit", async () => {
        const url = await start({ maxConnectionsPerUser: 2 });

        requireOpen(await attempt(url, "user-a"));
        requireOpen(await attempt(url, "user-a"));

        const other = await attempt(url, "user-b");

        expect(other.kind).toBe("open");
    });

    it("frees the slot when a connection closes", async () => {
        const url = await start({ maxConnectionsPerUser: 1 });

        const first = requireOpen(await attempt(url, "user-a"));

        expect(await attempt(url, "user-a")).toEqual({ kind: "rejected", status: 429 });

        await new Promise<void>((resolve) => {
            first.once("close", () => resolve());
            first.close();
        });
        await sleep(100);

        const again = await attempt(url, "user-a");

        expect(again.kind).toBe("open");
    });

    it("counts upgrades still in flight, not only open sockets", async () => {
        const url = await start({ maxConnectionsPerUser: 2 });

        const outcomes = await Promise.all([
            attempt(url, "user-a"),
            attempt(url, "user-a"),
            attempt(url, "user-a"),
        ]);

        const opened = outcomes.filter((outcome) => outcome.kind === "open");
        const rejected = outcomes.filter((outcome) => outcome.kind === "rejected");

        expect(opened).toHaveLength(2);
        expect(rejected).toEqual([{ kind: "rejected", status: 429 }]);
    });

    it("refuses a connection over the total limit with 503 and keeps existing ones", async () => {
        const url = await start({ maxTotalConnections: 2 });

        const first = requireOpen(await attempt(url, "user-a"));
        const second = requireOpen(await attempt(url, "user-b"));

        const third = await attempt(url, "user-c");

        expect(third).toEqual({ kind: "rejected", status: 503 });
        expect(first.readyState).toBe(WebSocket.OPEN);
        expect(second.readyState).toBe(WebSocket.OPEN);
    });

    it("keeps the ticket when the total limit refuses, so it can be reused", async () => {
        const url = await start({ maxTotalConnections: 1 });

        const holder = requireOpen(await attempt(url, "user-a"));
        const ticket = issueWebSocketTicket("user-c");

        expect(await attempt(url, "user-c", ticket)).toEqual({
            kind: "rejected",
            status: 503,
        });

        await new Promise<void>((resolve) => {
            holder.once("close", () => resolve());
            holder.close();
        });
        await sleep(100);

        const retry = await attempt(url, "user-c", ticket);

        expect(retry.kind).toBe("open");
    });

    it("counts upgrades still in flight toward the total limit", async () => {
        const url = await start({ maxTotalConnections: 2 });

        const outcomes = await Promise.all([
            attempt(url, "user-a"),
            attempt(url, "user-b"),
            attempt(url, "user-c"),
        ]);

        const opened = outcomes.filter((outcome) => outcome.kind === "open");
        const rejected = outcomes.filter((outcome) => outcome.kind === "rejected");

        expect(opened).toHaveLength(2);
        expect(rejected).toEqual([{ kind: "rejected", status: 503 }]);
    });

    it("frees the total slot when a connection closes", async () => {
        const url = await start({ maxTotalConnections: 1 });

        const first = requireOpen(await attempt(url, "user-a"));

        expect(await attempt(url, "user-b")).toEqual({ kind: "rejected", status: 503 });

        await new Promise<void>((resolve) => {
            first.once("close", () => resolve());
            first.close();
        });
        await sleep(100);

        const again = await attempt(url, "user-b");

        expect(again.kind).toBe("open");
    });

    it("[characterization, passes before the total limit exists] a per-user refusal does not use up a total slot", async () => {
        const url = await start({ maxConnectionsPerUser: 1, maxTotalConnections: 2 });

        requireOpen(await attempt(url, "user-a"));

        expect(await attempt(url, "user-a")).toEqual({ kind: "rejected", status: 429 });

        const other = await attempt(url, "user-b");

        expect(other.kind).toBe("open");
    });
});