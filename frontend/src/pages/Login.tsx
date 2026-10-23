
import { useState } from "react";
import type { FormEvent } from "react";
import { login, signup } from "../services/authService";

function Login() {
    const [isSignup, setIsSignup] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (
        event: FormEvent<HTMLFormElement>
    ) => {
        event.preventDefault();

        setError("");
        setSuccess("");
        setLoading(true);

        try {
            if (isSignup) {
                await signup(name, email, password);

                // Signup succeeded. Return to sign-in instead
                // of redirecting to the dashboard.
                localStorage.removeItem("token");

                setIsSignup(false);
                setName("");
                setPassword("");
                setSuccess(
                    "Account created successfully! Please sign in."
                );
            } else {
                await login(email, password);

                // Only a successful sign-in opens the dashboard.
                window.location.href = "/";
            }
        } catch (error: unknown) {
            console.error(
                isSignup ? "Signup error:" : "Login error:",
                error
            );

            if (
                typeof error === "object" &&
                error !== null &&
                "response" in error
            ) {
                const response = (
                    error as {
                        response?: {
                            data?: { message?: string };
                        };
                    }
                ).response;

                setError(
                    response?.data?.message ||
                    (isSignup ? "Signup failed" : "Login failed")
                );
            } else {
                setError(
                    isSignup ? "Signup failed" : "Login failed"
                );
            }
        } finally {
            setLoading(false);
        }
    };

    const switchMode = () => {
        setIsSignup((current) => !current);
        setName("");
        setEmail("");
        setPassword("");
        setError("");
        setSuccess("");
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold">
                        PulseForge
                    </h1>

                    <p className="text-slate-400 mt-2">
                        {isSignup
                            ? "Create your account"
                            : "Sign in to your dashboard"}
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="space-y-5"
                >
                    {isSignup && (
                        <div>
                            <label className="block text-sm text-slate-300 mb-2">
                                Name
                            </label>

                            <input
                                type="text"
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                required
                                autoComplete="name"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                                placeholder="Enter your name"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm text-slate-300 mb-2">
                            Email
                        </label>

                        <input
                            type="email"
                            value={email}
                            onChange={(event) =>
                                setEmail(event.target.value)
                            }
                            required
                            autoComplete="email"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                            placeholder="Enter your email"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-slate-300 mb-2">
                            Password
                        </label>

                        <input
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            minLength={isSignup ? 6 : undefined}
                            required
                            autoComplete={
                                isSignup
                                    ? "new-password"
                                    : "current-password"
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:border-blue-500"
                            placeholder={
                                isSignup
                                    ? "Create a password (min. 6 characters)"
                                    : "Enter your password"
                            }
                        />
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm"
                        >
                            {error}
                        </div>
                    )}

                    {success && (
                        <div
                            role="status"
                            className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg p-3 text-sm"
                        >
                            {success}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg py-3 font-medium transition"
                    >
                        {loading
                            ? "Please wait..."
                            : isSignup
                                ? "Create Account"
                                : "Sign In"}
                    </button>
                </form>

                <p className="text-center text-sm text-slate-400 mt-6">
                    {isSignup
                        ? "Already have an account? "
                        : "Don't have an account? "}

                    <button
                        type="button"
                        onClick={switchMode}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                        {isSignup ? "Sign In" : "Sign Up"}
                    </button>
                </p>
            </div>
        </div>
    );
}

export default Login;
