
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
const MIN_JWT_SECRET_LENGTH = 32;

const jwtSecret = requiredString("JWT_SECRET");

if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
        `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
}
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

// Number of reverse proxies in front of the app that Express may trust for
// X-Forwarded-For. 0 (the default) trusts none. Digits only, so values such
// as "1e1", "-1" or "true" are rejected instead of being coerced.
const MAX_TRUST_PROXY_HOPS = 10;

function parseTrustProxyHops(rawValue: string | undefined): number {
    const value = rawValue?.trim() ?? "";

    if (value === "") {
        return 0;
    }

    if (!/^\d+$/.test(value) || Number(value) > MAX_TRUST_PROXY_HOPS) {
        throw new Error(
            `TRUST_PROXY_HOPS must be an integer from 0 to ${MAX_TRUST_PROXY_HOPS}`,
        );
    }

    return Number(value);
}

const trustProxyHops = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);

// Test-only routes are hidden when NODE_ENV is exactly "production" (after
// trimming). Any other value, including unset, counts as not production.
const isProduction = process.env.NODE_ENV?.trim() === "production";

export const env = {
    port: positiveInteger("PORT", 3000),

    frontendUrl,

    trustProxyHops,
    isProduction,

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
