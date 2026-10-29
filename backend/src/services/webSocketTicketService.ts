import { randomBytes } from "node:crypto";

const TICKET_TTL_MS = 30_000;
const MAX_PENDING_TICKETS = 10_000;

interface Ticket {
    userId: string;
    expiresAt: number;
}

const tickets = new Map<string, Ticket>();

function removeExpiredTickets(now: number): void {
    for (const [ticket, entry] of tickets) {
        if (entry.expiresAt <= now) {
            tickets.delete(ticket);
        }
    }
}

export function issueWebSocketTicket(userId: string): string {
    if (!userId.trim()) {
        throw new Error("A user ID is required");
    }

    const now = Date.now();
    removeExpiredTickets(now);

    if (tickets.size >= MAX_PENDING_TICKETS) {
        throw new Error("WebSocket ticket capacity reached");
    }

    const ticket = randomBytes(32).toString("hex");

    tickets.set(ticket, {
        userId,
        expiresAt: now + TICKET_TTL_MS,
    });

    return ticket;
}

export function consumeWebSocketTicket(ticket: string): string | null {
    const entry = tickets.get(ticket);

    if (!entry) {
        return null;
    }

    // Delete before returning so the ticket cannot be reused.
    tickets.delete(ticket);

    if (entry.expiresAt <= Date.now()) {
        return null;
    }

    return entry.userId;
}
