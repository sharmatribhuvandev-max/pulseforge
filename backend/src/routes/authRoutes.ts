import { Router, Response } from "express";
import { signup, signin } from "../controllers/authController";
import { createWebSocketTicket } from "../controllers/webSocketTicketController";
import {
    authMiddleware,
    AuthRequest
} from "../middleware/authMiddleware";
import { authRateLimit } from "../middleware/authRateLimit";

const router = Router();

router.post("/signup", authRateLimit, signup);

router.post("/signin", authRateLimit, signin);

router.post("/ws-ticket", authMiddleware, createWebSocketTicket);

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
