import dotenv from "dotenv";

dotenv.config();

export const env = {
    port: Number(process.env.PORT) || 3000,

    frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

    mongoUri: process.env.MONGO_URI || "",

    jwtSecret: process.env.JWT_SECRET || "",

    postgres: {
        host: process.env.POSTGRES_HOST || "localhost",
        port: Number(process.env.POSTGRES_PORT) || 5432,
        user: process.env.POSTGRES_USER || "postgres",
        password: process.env.POSTGRES_PASSWORD || "",
        database: process.env.POSTGRES_DB || "pulseforge"
    }
};