import { rateLimit } from "express-rate-limit";

// Brute-force protection for signin. It has its own counter, separate from
// signup, and only failed attempts (status 400 and above) count, so people
// who log in successfully are not locked out by their own sessions.
export const signinRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        message: "Too many authentication attempts. Please try again later.",
    },
});