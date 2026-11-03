import { Router, Response } from "express";
import { signup, signin } from "../controllers/authController";
import { createWebSocketTicket } from "../controllers/webSocketTicketController";
import {
    authMiddleware,
    AuthRequest
} from "../middleware/authMiddleware";
import { authRateLimit } from "../middleware/authRateLimit";
import { signinRateLimit } from "../middleware/signinRateLimit";
import { webSocketTicketRateLimit } from "../middleware/webSocketTicketRateLimit";

const router = Router();

router.post("/signup", authRateLimit, signup);

router.post("/signin", signinRateLimit, signin);

router.post(
    "/ws-ticket",
    authMiddleware,
    webSocketTicketRateLimit,
    createWebSocketTicket,
);

router.get(
    "/me",
    authMiddleware,
    (req: AuthRequest, res: Response) => {
        res.json({
            message: "Authentication successful",
            userId: req.userId
        });
    }
);

export default router;
