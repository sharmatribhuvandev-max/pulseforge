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

import { initWebSocket, broadcast } from "../src/services/websocketService";
import { issueWebSocketTicket } from "../src/services/webSocketTicketService";

describe("Authenticated WebSocket integration", () => {
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

    it("rejects unauthenticated connections and isolates project events", async () => {
        findProjectsMock.mockImplementation((filter: { userId: string }) => ({
            select: () => ({
                lean: async () =>
                    filter.userId === "user-a"
                        ? [{ _id: "project-a" }]
                        : [{ _id: "project-b" }],
            }),
        }));

        server = http.createServer();
        initWebSocket(server);

        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === "string") {
            throw new Error("Test server did not bind to a TCP port");
        }

        const url = `ws://127.0.0.1:${address.port}`;

        const unauthorized = new WebSocket(url, {
            origin: "http://localhost:5173",
        });
        clients.push(unauthorized);

        const rejectedStatus = await new Promise<number>((resolve, reject) => {
            unauthorized.once("unexpected-response", (_request, response) => {
                resolve(response.statusCode ?? 0);
            });
            unauthorized.once("open", () => reject(new Error("Unauthenticated socket was accepted")));
            unauthorized.once("error", () => undefined);
            setTimeout(() => reject(new Error("Unauthenticated socket rejection timed out")), 2000);
        });

        expect(rejectedStatus).toBe(401);

        async function connectUser(userId: string): Promise<WebSocket> {
            const ticket = issueWebSocketTicket(userId);
            const client = new WebSocket(`${url}/?ticket=${ticket}`, {
                origin: "http://localhost:5173",
            });
            clients.push(client);

            // Register the message listener before opening, so an early message is not missed.
            const connectionMessage = new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error("Connection message timed out")),
                    3000,
                );
                client.once("message", (message) => {
                    clearTimeout(timer);
                    try {
                        expect(JSON.parse(message.toString()).type).toBe("connection");
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error("Authenticated socket connection timed out")),
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

            await connectionMessage;

            return client;
        }

        const userA = await connectUser("user-a");
        const userB = await connectUser("user-b");

        const userAMessages: string[] = [];
        const userBMessages: string[] = [];
        userA.on("message", (message) => userAMessages.push(message.toString()));
        userB.on("message", (message) => userBMessages.push(message.toString()));

        broadcast({ type: "api_request", projectId: "project-a", requestId: "request-a" });
        broadcast({ type: "api_request", projectId: "project-b", requestId: "request-b" });
        broadcast({ type: "connection" });

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(userAMessages).toHaveLength(1);
        expect(JSON.parse(userAMessages[0]!).requestId).toBe("request-a");

        expect(userBMessages).toHaveLength(1);
        expect(JSON.parse(userBMessages[0]!).requestId).toBe("request-b");
    });
});
