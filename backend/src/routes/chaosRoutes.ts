import { Router } from "express";
import {
    createChaosRule,
    getChaosRules,
    updateChaosRule
} from "../controllers/chaosController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.post(
    "/",
    authMiddleware,
    createChaosRule
);

router.get(
    "/endpoint/:endpointId",
    authMiddleware,
    getChaosRules
);

router.patch(
    "/:ruleId",
    authMiddleware,
    updateChaosRule
);

export default router;