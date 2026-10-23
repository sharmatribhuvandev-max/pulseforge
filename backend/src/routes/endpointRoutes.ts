
import { Router } from "express";
import {
    createEndpoint,
    getEndpoints,
    deleteEndpoint,
} from "../controllers/endpointController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.post(
    "/",
    authMiddleware,
    createEndpoint
);

router.get(
    "/project/:projectId",
    authMiddleware,
    getEndpoints
);

router.delete(
    "/:endpointId",
    authMiddleware,
    deleteEndpoint
);

export default router;
