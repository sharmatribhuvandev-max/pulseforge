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
    broadcast,
    authorizeProjectForUser,
} from "../src/services/websocketService";
import { issueWebSocketTicket } from "../src/services/webSocketTicketService";

describe("Live project authorization", () => {
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

    it("delivers events for a project created after connecting, only to its owner", async () => {
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

        async function connectUser(userId: string) {
            const ticket = issueWebSocketTicket(userId);
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
            await new Promise((resolve) => setTimeout(resolve, 50));
            messages.length = 0;

            return messages;
        }

        const userATab1 = await connectUser("user-a");
        const userATab2 = await connectUser("user-a");
        const userB = await connectUser("user-b");

        // Before authorization, the new project's events reach nobody.
        broadcast({ type: "api_request", projectId: "project-new", requestId: "before" });
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(userATab1).toHaveLength(0);
        expect(userATab2).toHaveLength(0);
        expect(userB).toHaveLength(0);

        // The owner's open connections gain access without reconnecting.
        authorizeProjectForUser("user-a", "project-new");

        broadcast({ type: "api_request", projectId: "project-new", requestId: "after" });
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(userATab1).toHaveLength(1);
        expect(JSON.parse(userATab1[0]!).requestId).toBe("after");
        expect(userATab2).toHaveLength(1);
        expect(JSON.parse(userATab2[0]!).requestId).toBe("after");

        // Another user never receives it.
        expect(userB).toHaveLength(0);
    });

    it("ignores a user with no open connections", () => {
        server = http.createServer();
        initWebSocket(server);

        expect(() =>
            authorizeProjectForUser("nobody", "project-x")
        ).not.toThrow();
    });
});