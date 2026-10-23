
import { Request, Response } from "express";
import { User } from "../models/User";
import { hashPassword, comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";

const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_BYTES = 72;

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
    return (
        password.length >= MIN_PASSWORD_LENGTH &&
        Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES
    );
}

export async function signup(req: Request, res: Response) {
    try {
        const { name, email, password } = req.body ?? {};

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (normalizedName.length > MAX_NAME_LENGTH) {
            return res.status(400).json({
                message: `Name must be ${MAX_NAME_LENGTH} characters or fewer`
            });
        }

        if (
            normalizedEmail.length > MAX_EMAIL_LENGTH ||
            !isValidEmail(normalizedEmail)
        ) {
            return res.status(400).json({
                message: "Please provide a valid email address"
            });
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
            });
        }

        if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
            return res.status(400).json({
                message: `Password must not exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes`
            });
        }

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                message: "User already exists"
            });
        }

        const passwordHash = await hashPassword(password);

        const user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            passwordHash
        });

        const token = generateToken(user._id.toString());

        return res.status(201).json({
            message: "User created successfully",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === 11000
        ) {
            return res.status(409).json({
                message: "User already exists"
            });
        }

        console.error("Signup error:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
}

export async function signin(req: Request, res: Response) {
    try {
        const { email, password } = req.body ?? {};

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (
            normalizedEmail.length > MAX_EMAIL_LENGTH ||
            !isValidEmail(normalizedEmail)
        ) {
            return res.status(400).json({
                message: "Please provide a valid email address"
            });
        }

        if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
            return res.status(400).json({
                message: "Invalid email or password"
            });
        }

        const user = await User.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const passwordMatch = await comparePassword(
            password,
            user.passwordHash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const token = generateToken(user._id.toString());

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Signin error:", error);

        return res.status(500).json({
            message: "Internal server error"
        });
    }
}
