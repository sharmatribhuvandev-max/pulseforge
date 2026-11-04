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

const DEFAULT_MAX_CONNECTIONS_PER_USER = 5;

let maxConnectionsPerUser = DEFAULT_MAX_CONNECTIONS_PER_USER;

// Open connections plus upgrades still in flight, per user. A new Map is
// created on every init, and each release function keeps the Map it counted in.
let userConnectionCounts = new Map<string, number>();

const DEFAULT_MAX_TOTAL_CONNECTIONS = 1000;

let maxTotalConnections = DEFAULT_MAX_TOTAL_CONNECTIONS;

// Open connections plus upgrades still in flight, across all users. Like the
// per-user counts, this is recreated on every init.
let totalConnections = { count: 0 };

function reserveTotalSlot(): (() => void) | undefined {
    const total = totalConnections;

    if (total.count >= maxTotalConnections) {
        return undefined;
    }

    total.count += 1;

    let released = false;

    return () => {
        if (released) {
            return;
        }

        released = true;
        total.count = Math.max(0, total.count - 1);
    };
}

function reserveUserSlot(userId: string): (() => void) | undefined {
    const counts = userConnectionCounts;
    const current = counts.get(userId) ?? 0;

    if (current >= maxConnectionsPerUser) {
        return undefined;
    }

    counts.set(userId, current + 1);

    let released = false;

    return () => {
        if (released) {
            return;
        }

        released = true;

        const remaining = (counts.get(userId) ?? 1) - 1;

        if (remaining <= 0) {
            counts.delete(userId);
        } else {
            counts.set(userId, remaining);
        }
    };
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
    if (socket.destroyed) {
        return;
    }

    const reason = status === 401 ? "Unauthorized" :
        status === 403 ? "Forbidden" :
        status === 429 ? "Too Many Requests" :
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

    let releaseSlot: () => void = () => undefined;

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

        const releaseTotalSlot = reserveTotalSlot();

        if (!releaseTotalSlot) {
            rejectUpgrade(socket, 503, "WebSocket server at capacity");
            return;
        }

        // Free the total slot when the underlying socket closes, however it ends.
        releaseSlot = releaseTotalSlot;
        socket.once("close", releaseTotalSlot);

        const userId = consumeWebSocketTicket(tickets[0]!);

        if (!userId) {
            releaseSlot();
            rejectUpgrade(socket, 401, "Invalid or expired WebSocket ticket");
            return;
        }

        const releaseUserSlot = reserveUserSlot(userId);

        if (!releaseUserSlot) {
            releaseSlot();
            rejectUpgrade(socket, 429, "Too many WebSocket connections");
            return;
        }

        // Free the slot when the underlying socket closes, however it ends.
        const releaseTotalOnly = releaseSlot;
        releaseSlot = () => {
            releaseUserSlot();
            releaseTotalOnly();
        };
        socket.once("close", releaseUserSlot);

        // Resolve project ownership before accepting the connection.
        const projects = await Project.find({ userId }).select("_id").lean();

        if (socket.destroyed) {
            return;
        }

        const projectIds = new Set(
            projects.map((project) => String(project._id)),
        );

        if (!wss) {
            releaseSlot();
            rejectUpgrade(socket, 503, "WebSocket service unavailable");
            return;
        }

        wss.handleUpgrade(request, socket, head, (client) => {
            authorizedProjects.set(client, projectIds);
            connectionUsers.set(client, userId);
            wss?.emit("connection", client, request);
        });
    } catch (error) {
        releaseSlot();
        console.error("WebSocket upgrade failed:", error);
        rejectUpgrade(socket, 503, "WebSocket connection unavailable");
    }
}

// A client with more than this many bytes queued unsent is too slow to keep.
const DEFAULT_MAX_BUFFERED_BYTES = 1024 * 1024;

let maxBufferedBytes = DEFAULT_MAX_BUFFERED_BYTES;

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

// A client stays alive until a heartbeat finds it silent for a full interval.
const clientAlive = new WeakMap<WebSocket, boolean>();

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

function stopHeartbeat(): void {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
    }
}

function startHeartbeat(intervalMs: number): void {
    stopHeartbeat();

    heartbeatTimer = setInterval(() => {
        if (!wss) {
            return;
        }

        for (const client of wss.clients) {
            if (clientAlive.get(client) === false) {
                client.terminate();
                continue;
            }

            clientAlive.set(client, false);

            if (client.readyState === WebSocket.OPEN) {
                client.ping();
            }
        }
    }, intervalMs);

    // The heartbeat must never keep the process alive on its own.
    heartbeatTimer.unref();
}

function closeWebSocketServer(target: WebSocketServer | undefined): void {
    if (!target) {
        return;
    }

    // Only clear shared state if this is still the current server.
    if (wss === target) {
        stopHeartbeat();
        wss = undefined;
    }

    for (const client of target.clients) {
        client.terminate();
    }

    target.close();
}

export function closeWebSocket(): void {
    closeWebSocketServer(wss);
}

export interface WebSocketLimits {
    maxConnectionsPerUser?: number;
    maxTotalConnections?: number;
    heartbeatIntervalMs?: number;
    maxBufferedBytes?: number;
}

export function initWebSocket(
    server: Server,
    limits: WebSocketLimits = {},
): void {
    maxConnectionsPerUser =
        limits.maxConnectionsPerUser ?? DEFAULT_MAX_CONNECTIONS_PER_USER;
    userConnectionCounts = new Map();
    maxTotalConnections =
        limits.maxTotalConnections ?? DEFAULT_MAX_TOTAL_CONNECTIONS;
    totalConnections = { count: 0 };

    maxBufferedBytes =
        limits.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;

    startHeartbeat(
        limits.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    );
    wss = new WebSocketServer({
        noServer: true,
        maxPayload: 64 * 1024,
    });

    const createdWss: WebSocketServer | undefined = wss;

    server.once("close", () => {
        closeWebSocketServer(createdWss);
    });

    server.on("upgrade", (request, socket, head) => {
        void handleUpgrade(request, socket, head);
    });

    wss.on("connection", (socket: WebSocket) => {
        clientAlive.set(socket, true);

        socket.on("pong", () => {
            clientAlive.set(socket, true);
        });

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
            if (client.bufferedAmount > maxBufferedBytes) {
                // Too far behind to catch up: drop the connection instead of
                // letting its queue grow without bound.
                client.terminate();
                continue;
            }

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
