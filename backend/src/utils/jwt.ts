
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
    userId: string;
}

export function generateToken(userId: string): string {
    return jwt.sign(
        { userId },
        env.jwtSecret,
        { expiresIn: "7d" }
    );
}

export function verifyToken(token: string): JwtPayload {
    const decoded = jwt.verify(token, env.jwtSecret);

    if (
        typeof decoded !== "object" ||
        decoded === null ||
        !("userId" in decoded) ||
        typeof decoded.userId !== "string" ||
        decoded.userId.trim().length === 0
    ) {
        throw new Error("Invalid token payload");
    }

    return {
        userId: decoded.userId
    };
}
