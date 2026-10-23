import { Router } from "express";

import {
    createProject,
    getProjects,
    deleteProject
} from "../controllers/projectController";

import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.post(
    "/",
    authMiddleware,
    createProject
);

router.get(
    "/",
    authMiddleware,
    getProjects
);

router.delete(
    "/:id",
    authMiddleware,
    deleteProject
);

export default router;