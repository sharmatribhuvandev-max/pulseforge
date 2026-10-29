import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { issueWebSocketTicket } from "../services/webSocketTicketService";

export function createWebSocketTicket(
    req: AuthRequest,
    res: Response,
) {
    res.setHeader("Cache-Control", "no-store");

    if (!req.userId) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }

    try {
        const ticket = issueWebSocketTicket(req.userId);

        return res.status(200).json({
            ticket,
            expiresIn: 30,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "WebSocket ticket capacity reached"
        ) {
            return res.status(503).json({
                message: "WebSocket authentication is temporarily unavailable",
            });
        }

        console.error("WebSocket ticket creation failed:", error);

        return res.status(500).json({
            message: "Internal server error",
        });
    }
}
