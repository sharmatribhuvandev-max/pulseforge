import express from "express";
import cors from "cors";

import { env } from "./config/env";

import apiRoutes from "./routes/apiRoutes";
import authRoutes from "./routes/authRoutes";
import projectRoutes from "./routes/projectRoutes";
import endpointRoutes from "./routes/endpointRoutes";
import chaosRoutes from "./routes/chaosRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import incidentRoutes from "./routes/incidentRoutes";

const app = express();

app.use(
    cors({
        origin: env.frontendUrl,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        message: "PulseForge API is running",
    });
});

app.get("/test-success", (_req, res) => {
    res.status(200).json({
        message: "Test API successful",
    });
});

app.use("/api", apiRoutes);
app.use("/auth", authRoutes);
app.use("/projects", projectRoutes);
app.use("/endpoints", endpointRoutes);
app.use("/chaos", chaosRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/incidents", incidentRoutes);

app.use((req, res) => {
    res.status(404).json({
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

app.use(
    (
        err: unknown,
        _req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) => {
        console.error("Unhandled request error:", err);

        if (res.headersSent) {
            return next(err);
        }

        return res.status(500).json({
            message: "Internal server error",
        });
    },
);

export default app;
