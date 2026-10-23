import { Router } from "express";

import { getProjectIncidents } from "../controllers/incidentController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get(
    "/project/:id",
    authMiddleware,
    getProjectIncidents
);

export default router;