import { Router } from "express";

import {
    getAnalytics,
    getLatencyHistoryData,
    getEndpointAnalyticsData,
    getRecentApiEventsData,
} from "../controllers/analyticsController";

import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get(
    "/project/:projectId",
    authMiddleware,
    getAnalytics
);

router.get(
    "/project/:projectId/latency",
    authMiddleware,
    getLatencyHistoryData
);

router.get(
    "/project/:projectId/endpoints",
    authMiddleware,
    getEndpointAnalyticsData
);

export default router;
router.get(
    "/project/:projectId/recent-events",
    authMiddleware,
    getRecentApiEventsData
);
