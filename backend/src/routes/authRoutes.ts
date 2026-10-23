import { Router, Response } from "express";
import { signup, signin } from "../controllers/authController";
import {
    authMiddleware,
    AuthRequest
} from "../middleware/authMiddleware";

const router = Router();

router.post("/signup", signup);

router.post("/signin", signin);

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