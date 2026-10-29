import { describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";

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

describe("WebSocket upgrade socket errors", () => {
    it("handles a socket error while project ownership is being resolved", async () => {
        let finishLookup!: () => void;

        findProjectsMock.mockImplementation(() => ({
            select: () => ({
                lean: () =>
                    new Promise((resolve) => {
                        finishLookup = () => resolve([{ _id: "project-a" }]);
                    }),
            }),
        }));

        const server = http.createServer();
        initWebSocket(server);

        const socket = new PassThrough();
        const ticket = issueWebSocketTicket("user-a");

        const request = {
            headers: {
                origin: "http://localhost:5173",
                host: "localhost",
            },
            url: `/?ticket=${ticket}`,
        };

        server.emit("upgrade", request, socket, Buffer.alloc(0));

        // Let the handler reach the pending project lookup.
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(findProjectsMock).toHaveBeenCalledOnce();

        // A client reset during the lookup must not crash the process.
        expect(() =>
            socket.emit("error", new Error("read ECONNRESET"))
        ).not.toThrow();
        expect(socket.destroyed).toBe(true);

        // The late lookup result must not accept a destroyed socket.
        finishLookup();
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
});