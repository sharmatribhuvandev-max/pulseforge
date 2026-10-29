import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { Project } from "../models/Project";
import { env } from "../config/env";
import { consumeWebSocketTicket } from "./webSocketTicketService";

let wss: WebSocketServer | undefined;

const authorizedProjects = new WeakMap<WebSocket, Set<string>>();

// Which user each connection belongs to, so a project created after the
// connection opened can be authorized for it without reconnecting.
const connectionUsers = new WeakMap<WebSocket, string>();

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
    if (socket.destroyed) {
        return;
    }

    const reason = status === 401 ? "Unauthorized" :
        status === 403 ? "Forbidden" :
        status === 503 ? "Service Unavailable" :
        "Bad Request";

    socket.end(
        `HTTP/1.1 ${status} ${reason}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        "Cache-Control: no-store\r\n" +
        `Content-Length: ${Buffer.byteLength(message)}\r\n` +
        "\r\n" +
        message,
    );
}

async function handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
): Promise<void> {
    // Before the upgrade completes, nothing else listens for socket errors.
    // An unhandled error here, such as a client reset during the project
    // lookup, would otherwise crash the process.
    socket.on("error", () => {
        socket.destroy();
    });

    try {
        const origin = request.headers.origin;

        if (origin !== env.frontendUrl) {
            rejectUpgrade(socket, 403, "Origin not allowed");
            return;
        }

        const requestUrl = new URL(
            request.url ?? "/",
            `http://${request.headers.host ?? "localhost"}`,
        );

        const tickets = requestUrl.searchParams.getAll("ticket");

        if (
            tickets.length !== 1 ||
            !/^[a-f0-9]{64}$/.test(tickets[0] ?? "")
        ) {
            rejectUpgrade(socket, 401, "WebSocket authentication required");
            return;
        }

        const userId = consumeWebSocketTicket(tickets[0]!);

        if (!userId) {
            rejectUpgrade(socket, 401, "Invalid or expired WebSocket ticket");
            return;
        }

        // Resolve project ownership before accepting the connection.
        const projects = await Project.find({ userId }).select("_id").lean();

        if (socket.destroyed) {
            return;
        }

        const projectIds = new Set(
            projects.map((project) => String(project._id)),
        );

        if (!wss) {
            rejectUpgrade(socket, 503, "WebSocket service unavailable");
            return;
        }

        wss.handleUpgrade(request, socket, head, (client) => {
            authorizedProjects.set(client, projectIds);
            connectionUsers.set(client, userId);
            wss?.emit("connection", client, request);
        });
    } catch (error) {
        console.error("WebSocket upgrade failed:", error);
        rejectUpgrade(socket, 503, "WebSocket connection unavailable");
    }
}

export function initWebSocket(server: Server): void {
    wss = new WebSocketServer({
        noServer: true,
        maxPayload: 64 * 1024,
    });

    server.on("upgrade", (request, socket, head) => {
        void handleUpgrade(request, socket, head);
    });

    wss.on("connection", (socket: WebSocket) => {
        console.log("Authenticated WebSocket client connected");

        socket.send(
            JSON.stringify({
                type: "connection",
                message: "Connected to PulseForge WebSocket",
            }),
        );

        socket.on("close", () => {
            console.log("WebSocket client disconnected");
        });

        socket.on("error", (error) => {
            console.error("WebSocket client error:", error);
        });
    });

    console.log("Authenticated WebSocket server initialized");
}

export function broadcast(data: unknown): void {
    if (!wss || typeof data !== "object" || data === null) {
        return;
    }

    const projectId = (data as { projectId?: unknown }).projectId;

    // Events without a project ID must never be broadcast to clients.
    if (typeof projectId !== "string" || !projectId) {
        return;
    }

    const message = JSON.stringify(data);

    for (const client of wss.clients) {
        const projectIds = authorizedProjects.get(client);

        if (
            client.readyState === WebSocket.OPEN &&
            projectIds?.has(projectId)
        ) {
            client.send(message);
        }
    }
}

/*
 * Authorize a newly created project for every open connection that
 * belongs to its owner. Other users' connections are never changed.
 */
export function authorizeProjectForUser(
    userId: string,
    projectId: string,
): void {
    if (!wss || !userId || !projectId) {
        return;
    }

    for (const client of wss.clients) {
        if (connectionUsers.get(client) !== userId) {
            continue;
        }

        authorizedProjects.get(client)?.add(projectId);
    }
}
