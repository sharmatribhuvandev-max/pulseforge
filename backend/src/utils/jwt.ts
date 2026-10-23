import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
    userId: string;
}

export function generateToken(userId: string): string {
    return jwt.sign(
        {
            userId
        },
        env.jwtSecret,
        {
            expiresIn: "7d"
        }
    );
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
}