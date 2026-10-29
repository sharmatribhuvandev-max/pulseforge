
import dotenv from "dotenv";

dotenv.config();

function requiredString(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function positiveInteger(
    name: string,
    fallback: number,
): number {
    const rawValue = process.env[name];

    if (rawValue === undefined || rawValue.trim() === "") {
        return fallback;
    }

    const value = Number(rawValue);

    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(
            `Environment variable ${name} must be a positive integer`,
        );
    }

    return value;
}

const mongoUri = requiredString("MONGO_URI");
const jwtSecret = requiredString("JWT_SECRET");
const postgresPassword = requiredString("POSTGRES_PASSWORD");

const rawFrontendUrl =
    process.env.FRONTEND_URL?.trim() || "http://localhost:5173";

// Browsers send the Origin header as scheme://host[:port] with no path or
// trailing slash. Store exactly that form so CORS and the WebSocket origin
// check, which compare strings, match the real browser origin.
function parseFrontendOrigin(value: string): string {
    try {
        const parsedUrl = new URL(value);

        if (
            !["http:", "https:"].includes(parsedUrl.protocol) ||
            parsedUrl.username ||
            parsedUrl.password ||
            parsedUrl.pathname !== "/" ||
            parsedUrl.search ||
            parsedUrl.hash
        ) {
            throw new Error();
        }

        return parsedUrl.origin;
    } catch {
        throw new Error(
            "FRONTEND_URL must be a valid HTTP or HTTPS origin " +
                "(for example https://app.example.com) with no path, " +
                "query string, or credentials",
        );
    }
}

const frontendUrl = parseFrontendOrigin(rawFrontendUrl);

export const env = {
    port: positiveInteger("PORT", 3000),

    frontendUrl,

    mongoUri,

    jwtSecret,

    postgres: {
        host: process.env.POSTGRES_HOST?.trim() || "localhost",
        port: positiveInteger("POSTGRES_PORT", 5432),
        user: process.env.POSTGRES_USER?.trim() || "postgres",
        password: postgresPassword,
        database: process.env.POSTGRES_DB?.trim() || "pulseforge",
    },
};
