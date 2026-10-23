import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddleware";
import {
    getActiveChaosRule,
    applyLatency,
    shouldInjectError
} from "../services/chaosService";

export async function chaosMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const endpointId = req.headers["x-endpoint-id"];

        if (!endpointId || Array.isArray(endpointId)) {
            return next();
        }

        const rule = await getActiveChaosRule(endpointId);

        if (!rule) {
            return next();
        }

        // Apply artificial latency
        if (rule.latency > 0) {
            await applyLatency(rule.latency);
        }

        // Inject an error based on error rate
        if (shouldInjectError(rule.errorRate)) {
            return res.status(rule.statusCode).json({
                message: "Chaos error injected",
                chaos: true,
                statusCode: rule.statusCode
            });
        }

        next();

    } catch (error) {
        console.error("Chaos middleware error:", error);

        // Never allow the chaos system itself
        // to break the application.
        next();
    }
}