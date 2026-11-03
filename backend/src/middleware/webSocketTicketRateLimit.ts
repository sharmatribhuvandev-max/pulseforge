import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { AuthRequest } from "./authMiddleware";

// Limits how often one authenticated user can ask for WebSocket tickets.
// Keyed on the user ID, not the IP, so users behind one address do not share
// a bucket. Mount it after authMiddleware so only authenticated requests count.
export const webSocketTicketRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
        const userId = (req as AuthRequest).userId;

        if (userId) {
            return `user:${userId}`;
        }

        // authMiddleware always sets userId first; this is only a safety net.
        return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
    },
    message: {
        message: "Too many WebSocket ticket requests. Please try again later.",
    },
});