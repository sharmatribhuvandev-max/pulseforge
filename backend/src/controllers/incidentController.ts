import { Response } from "express";
import { postgresPool } from "../db/postgres";
import { Project } from "../models/Project";
import { AuthRequest } from "../middleware/authMiddleware";

export const getProjectIncidents = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const projectId = req.params.id;

        if (!projectId || Array.isArray(projectId)) {
            return res.status(400).json({
                message: "Invalid project ID"
            });
        }

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const project = await Project.findOne({
            _id: projectId,
            userId: req.userId
        });

        if (!project) {
            return res.status(404).json({
                message: "Project not found"
            });
        }

        const result = await postgresPool.query(
            `
            SELECT
                id,
                project_id,
                type,
                threshold,
                actual_value,
                started_at,
                resolved_at
            FROM incidents
            WHERE project_id = $1
            ORDER BY started_at DESC
            `,
            [projectId]
        );

        const active = result.rows.filter(
            (incident) => incident.resolved_at === null
        );

        const resolved = result.rows.filter(
            (incident) => incident.resolved_at !== null
        );

        return res.status(200).json({
            active,
            resolved
        });

    } catch (error) {
        console.error(
            "Get project incidents error:",
            error
        );

        return res.status(500).json({
            message: "Failed to get incidents"
        });
    }
};