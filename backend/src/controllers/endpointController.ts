import { Response } from "express";
import { Endpoint } from "../models/Endpoint";
import { Project } from "../models/Project";
import { AuthRequest } from "../middleware/authMiddleware";

export async function createEndpoint(
    req: AuthRequest,
    res: Response
) {
    try {
        const {
            projectId,
            name,
            url,
            method
        } = req.body;

        /*
         * ==========================================
         * AUTH CHECK
         * ==========================================
         */

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized",
                error: "UNAUTHORIZED"
            });
        }


        /*
         * ==========================================
         * REQUIRED FIELDS
         * ==========================================
         */

        if (
            !projectId ||
            !name ||
            !url ||
            !method
        ) {
            return res.status(400).json({
                message:
                    "projectId, name, url and method are required",
                error: "MISSING_ENDPOINT_FIELDS"
            });
        }


        /*
         * ==========================================
         * VALIDATE NAME
         * ==========================================
         */

        if (
            typeof name !== "string" ||
            name.trim() === ""
        ) {
            return res.status(400).json({
                message: "Endpoint name is required",
                error: "INVALID_ENDPOINT_NAME"
            });
        }


        if (name.trim().length > 200) {
            return res.status(400).json({
                message:
                    "Endpoint name must be 200 characters or less",
                error: "INVALID_ENDPOINT_NAME"
            });
        }


        /*
         * ==========================================
         * VALIDATE URL
         * ==========================================
         */

        if (typeof url !== "string") {
            return res.status(400).json({
                message: "Invalid endpoint URL",
                error: "INVALID_ENDPOINT_URL"
            });
        }

        const trimmedUrl = url.trim();

        try {
            const parsedUrl =
                new URL(trimmedUrl);

            if (
                parsedUrl.protocol !== "http:" &&
                parsedUrl.protocol !== "https:"
            ) {
                return res.status(400).json({
                    message: "Invalid endpoint URL",
                    error: "INVALID_ENDPOINT_URL"
                });
            }

        } catch {
            return res.status(400).json({
                message: "Invalid endpoint URL",
                error: "INVALID_ENDPOINT_URL"
            });
        }


        /*
         * ==========================================
         * VALIDATE METHOD
         * ==========================================
         */

        if (typeof method !== "string") {
            return res.status(400).json({
                message: "Invalid HTTP method",
                error: "INVALID_HTTP_METHOD"
            });
        }

        const normalizedMethod =
            method.trim().toUpperCase();

        const allowedMethods = [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE"
        ];

        if (
            !allowedMethods.includes(
                normalizedMethod
            )
        ) {
            return res.status(400).json({
                message:
                    "Invalid HTTP method",
                error: "INVALID_HTTP_METHOD"
            });
        }


        /*
         * ==========================================
         * VERIFY PROJECT OWNERSHIP
         * ==========================================
         */

        const project =
            await Project.findOne({
                _id: projectId,
                userId: req.userId
            });

        if (!project) {
            return res.status(404).json({
                message: "Project not found",
                error: "PROJECT_NOT_FOUND"
            });
        }


        /*
         * ==========================================
         * CREATE ENDPOINT
         * ==========================================
         */

        const endpoint =
            await Endpoint.create({
                projectId:
                    project._id.toString(),

                name:
                    name.trim(),

                url:
                    trimmedUrl,

                method:
                    normalizedMethod
            });


        /*
         * ==========================================
         * SUCCESS
         * ==========================================
         */

        return res.status(201).json({
            message:
                "Endpoint created successfully",

            endpoint
        });

    } catch (error) {

        console.error(
            "Create endpoint error:",
            error
        );

        return res.status(500).json({
            message:
                "Internal server error",

            error:
                "INTERNAL_SERVER_ERROR"
        });
    }
}


export async function getEndpoints(
    req: AuthRequest,
    res: Response
) {
    try {

        const projectId =
            req.params.projectId;


        /*
         * ==========================================
         * VALIDATE PROJECT ID
         * ==========================================
         */

        if (
            !projectId ||
            Array.isArray(projectId)
        ) {
            return res.status(400).json({
                message:
                    "Invalid project ID",

                error:
                    "INVALID_PROJECT_ID"
            });
        }


        /*
         * ==========================================
         * AUTH CHECK
         * ==========================================
         */

        if (!req.userId) {
            return res.status(401).json({
                message:
                    "Unauthorized",

                error:
                    "UNAUTHORIZED"
            });
        }


        /*
         * ==========================================
         * VERIFY PROJECT OWNERSHIP
         * ==========================================
         */

        const project =
            await Project.findOne({
                _id: projectId,
                userId: req.userId
            });

        if (!project) {
            return res.status(404).json({
                message:
                    "Project not found",

                error:
                    "PROJECT_NOT_FOUND"
            });
        }


        /*
         * ==========================================
         * GET ENDPOINTS
         * ==========================================
         */

        const endpoints =
            await Endpoint.find({
                projectId:
                    project._id
            }).sort({
                createdAt: -1
            });


        return res.status(200).json({
            endpoints
        });

    } catch (error) {

        console.error(
            "Get endpoints error:",
            error
        );

        return res.status(500).json({
            message:
                "Internal server error",

            error:
                "INTERNAL_SERVER_ERROR"
        });
    }
}


export async function deleteEndpoint(
    req: AuthRequest,
    res: Response
) {
    try {
        const endpointId = req.params.endpointId;

        if (!endpointId || Array.isArray(endpointId)) {
            return res.status(400).json({
                message: "Invalid endpoint ID",
                error: "INVALID_ENDPOINT_ID",
            });
        }

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized",
                error: "UNAUTHORIZED",
            });
        }

        const endpoint = await Endpoint.findById(endpointId);

        if (!endpoint) {
            return res.status(404).json({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND",
            });
        }

        const project = await Project.findOne({
            _id: endpoint.projectId,
            userId: req.userId,
        });

        if (!project) {
            return res.status(404).json({
                message: "Endpoint not found",
                error: "ENDPOINT_NOT_FOUND",
            });
        }

        await Endpoint.deleteOne({ _id: endpoint._id });

        return res.status(200).json({
            message: "Endpoint deleted successfully",
            endpointId: endpoint._id.toString(),
        });
    } catch (error) {
        console.error("Delete endpoint error:", error);

        return res.status(500).json({
            message: "Internal server error",
            error: "INTERNAL_SERVER_ERROR",
        });
    }
}
