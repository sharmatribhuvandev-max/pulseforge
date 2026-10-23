import { Router } from "express";
import { checkApi } from "../controllers/apiController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get(
    "/:id/check",
    authMiddleware,
    checkApi
);

export default router;