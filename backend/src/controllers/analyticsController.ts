import { Response } from "express";
import { Project } from "../models/Project";
import { AuthRequest } from "../middleware/authMiddleware";

import {
    getProjectAnalytics,
    getLatencyHistory,
    getEndpointAnalytics,
    getRecentApiEvents,
} from "../services/analyticsService";


interface AnalyticsFilters {
    minutes?: number;
    endpoint?: string;
    method?: string;
    status?: "success" | "failed";
}


/*
 * Read analytics filters
 * from query parameters
 */
function getAnalyticsFilters(
    req: AuthRequest
): AnalyticsFilters {

    const filters: AnalyticsFilters = {};

    const minutesParam =
        req.query.minutes;

    const endpointParam =
        req.query.endpoint;

    const methodParam =
        req.query.method;

    const statusParam =
        req.query.status;


    /*
     * Minutes
     */
    if (
        typeof minutesParam === "string" &&
        minutesParam.trim() !== ""
    ) {

        const parsedMinutes =
            Number(minutesParam);

        if (
            !Number.isNaN(parsedMinutes) &&
            parsedMinutes > 0
        ) {
            filters.minutes =
                parsedMinutes;
        }
    }


    /*
     * Endpoint
     */
    if (
        typeof endpointParam === "string" &&
        endpointParam.trim() !== ""
    ) {

        filters.endpoint =
            endpointParam.trim();
    }


    /*
     * Method
     */
    if (
        typeof methodParam === "string" &&
        methodParam.trim() !== ""
    ) {

        filters.method =
            methodParam
                .trim()
                .toUpperCase();
    }


    /*
     * Status
     */
    if (statusParam === "success") {

        filters.status =
            "success";
    }

    if (statusParam === "failed") {

        filters.status =
            "failed";
    }


    return filters;
}


/*
 * Project Analytics
 */
export async function getAnalytics(
    req: AuthRequest,
    res: Response
) {

    try {

        const projectId =
            req.params.projectId;


        /*
         * Validate project ID
         */
        if (
            !projectId ||
            Array.isArray(projectId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid project ID",
            });
        }


        /*
         * Validate authentication
         */
        if (!req.userId) {

            return res.status(401).json({
                message:
                    "Unauthorized",
            });
        }


        /*
         * Check project ownership
         */
        const project =
            await Project.findOne({
                _id: projectId,
                userId: req.userId,
            });


        if (!project) {

            return res.status(404).json({
                message:
                    "Project not found",
            });
        }


        /*
         * Read filters
         */
        const filters =
            getAnalyticsFilters(req);


        /*
         * Get analytics
         */
        const analytics =
            await getProjectAnalytics(
                projectId,
                filters
            );


        return res.status(200).json({
            projectId,
            analytics,
        });

    } catch (error) {

        console.error(
            "Get analytics error:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to get analytics",
        });
    }
}


/*
 * Latency History
 *
 * IMPORTANT:
 * This endpoint now receives
 * the same analytics filters.
 */
export async function getLatencyHistoryData(
    req: AuthRequest,
    res: Response
) {

    try {

        const projectId =
            req.params.projectId;


        /*
         * Validate project ID
         */
        if (
            !projectId ||
            Array.isArray(projectId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid project ID",
            });
        }


        /*
         * Validate authentication
         */
        if (!req.userId) {

            return res.status(401).json({
                message:
                    "Unauthorized",
            });
        }


        /*
         * Check project ownership
         */
        const project =
            await Project.findOne({
                _id: projectId,
                userId: req.userId,
            });


        if (!project) {

            return res.status(404).json({
                message:
                    "Project not found",
            });
        }


        /*
         * Read filters
         */
        const filters =
            getAnalyticsFilters(req);


        /*
         * Get filtered latency history
         */
        const history =
            await getLatencyHistory(
                projectId,
                filters
            );


        return res.status(200).json({
            projectId,
            history,
        });

    } catch (error) {

        console.error(
            "Get latency history error:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to get latency history",
        });
    }
}


/*
 * Endpoint Analytics
 */
export async function getEndpointAnalyticsData(
    req: AuthRequest,
    res: Response
) {

    try {

        const projectId =
            req.params.projectId;


        /*
         * Validate project ID
         */
        if (
            !projectId ||
            Array.isArray(projectId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid project ID",
            });
        }


        /*
         * Validate authentication
         */
        if (!req.userId) {

            return res.status(401).json({
                message:
                    "Unauthorized",
            });
        }


        /*
         * Check project ownership
         */
        const project =
            await Project.findOne({
                _id: projectId,
                userId: req.userId,
            });


        if (!project) {

            return res.status(404).json({
                message:
                    "Project not found",
            });
        }


        /*
         * Read filters
         */
        const filters =
            getAnalyticsFilters(req);


        /*
         * Get filtered endpoint analytics
         */
        const endpoints =
            await getEndpointAnalytics(
                projectId,
                filters
            );


        return res.status(200).json({
            projectId,
            endpoints,
        });

    } catch (error) {

        console.error(
            "Get endpoint analytics error:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to get endpoint analytics",
        });
    }
}


/*
 * Recent API Events
 */
export async function getRecentApiEventsData(
    req: AuthRequest,
    res: Response
) {
    try {
        const projectId = req.params.projectId;

        if (!projectId || Array.isArray(projectId)) {
            return res.status(400).json({
                message: "Invalid project ID",
            });
        }

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const project = await Project.findOne({
            _id: projectId,
            userId: req.userId,
        });

        if (!project) {
            return res.status(404).json({
                message: "Project not found",
            });
        }

        const events = await getRecentApiEvents(projectId, 20);

        return res.status(200).json({
            projectId,
            events,
        });
    } catch (error) {
        console.error("Get recent API events error:", error);
        return res.status(500).json({
            message: "Failed to get recent API events",
        });
    }
}
