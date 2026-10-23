import { Response } from "express";

import { Project } from "../models/Project";
import { AuthRequest } from "../middleware/authMiddleware";


/*
 * ==========================================
 * CREATE PROJECT
 * ==========================================
 */

export async function createProject(
    req: AuthRequest,
    res: Response
) {
    try {

        /*
         * AUTH CHECK
         */

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }


        /*
         * REQUEST DATA
         */

        const {
            name,
            description
        } = req.body;


        /*
         * PROJECT NAME VALIDATION
         */

        if (
            typeof name !== "string" ||
            name.trim() === ""
        ) {
            return res.status(400).json({
                message: "Project name is required"
            });
        }


        /*
         * PROJECT NAME LENGTH
         */

        if (name.trim().length > 100) {
            return res.status(400).json({
                message:
                    "Project name must be 100 characters or less"
            });
        }


        /*
         * DESCRIPTION VALIDATION
         */

        if (
            description !== undefined &&
            description !== null &&
            typeof description !== "string"
        ) {
            return res.status(400).json({
                message:
                    "Project description must be a string"
            });
        }


        /*
         * DESCRIPTION LENGTH
         */

        if (
            typeof description === "string" &&
            description.length > 500
        ) {
            return res.status(400).json({
                message:
                    "Project description must be 500 characters or less"
            });
        }


        /*
         * CREATE PROJECT DATA
         */

        const projectData: {
            name: string;
            userId: string;
            description?: string;
        } = {
            name: name.trim(),
            userId: req.userId
        };


        /*
         * Only add description when
         * it actually exists.
         */

        if (
            typeof description === "string" &&
            description.trim() !== ""
        ) {
            projectData.description =
                description.trim();
        }


        /*
         * CREATE PROJECT
         */

        const project =
            await Project.create(
                projectData
            );


        /*
         * SUCCESS
         */

        return res.status(201).json({
            message:
                "Project created successfully",
            project
        });

    } catch (error) {

        console.error(
            "Create project error:",
            error
        );

        return res.status(500).json({
            message:
                "Internal server error"
        });
    }
}


/*
 * ==========================================
 * GET PROJECTS
 * ==========================================
 */

export async function getProjects(
    req: AuthRequest,
    res: Response
) {
    try {

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }


        const projects =
            await Project.find({
                userId: req.userId
            }).sort({
                createdAt: -1
            });


        return res.status(200).json({
            projects
        });

    } catch (error) {

        console.error(
            "Get projects error:",
            error
        );

        return res.status(500).json({
            message:
                "Internal server error"
        });
    }
}


/*
 * ==========================================
 * DELETE PROJECT
 * ==========================================
 */

export async function deleteProject(
    req: AuthRequest,
    res: Response
) {
    try {

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }


        const projectId =
            req.params.id;

        if (
            !projectId ||
            Array.isArray(projectId)
        ) {
            return res.status(400).json({
                message:
                    "Invalid project ID"
            });
        }


        const project =
            await Project.findOneAndDelete({
                _id: projectId,
                userId: req.userId
            });


        if (!project) {
            return res.status(404).json({
                message:
                    "Project not found"
            });
        }


        return res.status(200).json({
            message:
                "Project deleted successfully"
        });

    } catch (error) {

        console.error(
            "Delete project error:",
            error
        );

        return res.status(500).json({
            message:
                "Internal server error"
        });
    }
}