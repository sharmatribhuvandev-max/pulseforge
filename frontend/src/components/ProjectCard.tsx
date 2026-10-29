
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Project } from "../services/projectService";
import type { Endpoint } from "../services/endpointService";
import {
    createEndpoint,
    deleteEndpoint,
    checkEndpoint,
    getCheckErrorMessage,
} from "../services/endpointService";
import ChaosControls from "./ChaosControls";

interface ProjectCardProps {
    project: Project;
    endpoints: Endpoint[];
    children?: ReactNode;
    onEndpointCreated: () => Promise<void>;
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function ProjectCard({
    project,
    endpoints,
    children,
    onEndpointCreated,
}: ProjectCardProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [method, setMethod] = useState("GET");

    const [submitting, setSubmitting] = useState(false);
    const [deletingEndpointId, setDeletingEndpointId] =
        useState<string | null>(null);
    const [testingEndpointId, setTestingEndpointId] =
        useState<string | null>(null);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [testResult, setTestResult] = useState("");

    const busy =
        submitting ||
        deletingEndpointId !== null ||
        testingEndpointId !== null;

    const handleSubmit = async (
        event: FormEvent<HTMLFormElement>
    ) => {
        event.preventDefault();

        setError("");
        setSuccess("");
        setTestResult("");

        const trimmedName = name.trim();
        const trimmedUrl = url.trim();

        if (!trimmedName) {
            setError("Endpoint name is required.");
            return;
        }

        if (trimmedName.length > 200) {
            setError(
                "Endpoint name must be 200 characters or less."
            );
            return;
        }

        try {
            const parsedUrl = new URL(trimmedUrl);

            if (
                parsedUrl.protocol !== "http:" &&
                parsedUrl.protocol !== "https:"
            ) {
                setError(
                    "URL must start with http:// or https://."
                );
                return;
            }
        } catch {
            setError(
                "Enter a valid URL including http:// or https://."
            );
            return;
        }

        try {
            setSubmitting(true);

            await createEndpoint(
                project._id,
                trimmedName,
                trimmedUrl,
                method
            );

            setName("");
            setUrl("");
            setMethod("GET");
            setFormOpen(false);
            setSuccess("Endpoint created successfully.");

            await onEndpointCreated();
        } catch (err) {
            console.error("Failed to create endpoint:", err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to create endpoint. Check the details and try again."
            );
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteEndpoint = async (
        endpointId: string,
        endpointName: string
    ) => {
        const confirmed = window.confirm(
            `Are you sure you want to delete "${endpointName}"? ` +
            "This removes the endpoint configuration, but does not delete saved API request history."
        );

        if (!confirmed) {
            return;
        }

        setError("");
        setSuccess("");
        setTestResult("");

        try {
            setDeletingEndpointId(endpointId);

            await deleteEndpoint(endpointId);

            setSuccess(
                `Endpoint "${endpointName}" deleted successfully.`
            );

            await onEndpointCreated();
        } catch (err) {
            console.error("Failed to delete endpoint:", err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to delete endpoint. Please try again."
            );
        } finally {
            setDeletingEndpointId(null);
        }
    };

    const handleTestEndpoint = async (
        endpointId: string,
        endpointName: string
    ) => {
        setError("");
        setSuccess("");
        setTestResult("");

        try {
            setTestingEndpointId(endpointId);

            const response = await checkEndpoint(endpointId);
            const result = response.result;

            if (!result) {
                setError(
                    `${endpointName}: PulseForge returned no request result.`
                );
                return;
            }

            const details = [
                typeof result.statusCode === "number"
                    ? `HTTP ${result.statusCode}`
                    : null,
                typeof result.latency === "number"
                    ? `${result.latency} ms`
                    : null,
            ]
                .filter(Boolean)
                .join(" · ");

            if (result.success === true) {
                setTestResult(
                    `✓ ${endpointName} succeeded` +
                    (details ? ` — ${details}` : "")
                );
            } else if (result.success === false) {
                setError(
                    `✗ ${endpointName} failed` +
                    (details ? ` — ${details}` : "")
                );
            } else {
                setError(
                    `${endpointName}: the response did not include a valid success status.`
                );
            }

            await onEndpointCreated();
        } catch (err) {
            console.error("Endpoint test failed:", err);

            setError(`${endpointName}: ${getCheckErrorMessage(err)}`);
        } finally {
            setTestingEndpointId(null);
        }
    };

    return (
        <div className="p-6">
            <div>
                <h3 className="text-lg font-semibold">
                    {project.name}
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                    {project.description ||
                        "No description provided"}
                </p>
            </div>

            {children}

            <div className="mt-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-300">
                        Endpoints
                    </h4>

                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">
                            {endpoints.length}{" "}
                            {endpoints.length === 1
                                ? "endpoint"
                                : "endpoints"}
                        </span>

                        <button
                            type="button"
                            onClick={() => {
                                setFormOpen((open) => !open);
                                setError("");
                                setSuccess("");
                                setTestResult("");
                            }}
                            disabled={busy}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {formOpen ? "Cancel" : "Add Endpoint"}
                        </button>
                    </div>
                </div>

                {formOpen && (
                    <form
                        onSubmit={handleSubmit}
                        className="mb-4 space-y-3 rounded-lg border border-slate-700 bg-slate-800/40 p-4"
                    >
                        <div>
                            <label
                                htmlFor={`endpoint-name-${project._id}`}
                                className="mb-1 block text-sm text-slate-300"
                            >
                                Endpoint name
                            </label>

                            <input
                                id={`endpoint-name-${project._id}`}
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                maxLength={200}
                                required
                                placeholder="e.g. Get users"
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor={`endpoint-url-${project._id}`}
                                className="mb-1 block text-sm text-slate-300"
                            >
                                Endpoint URL
                            </label>

                            <input
                                id={`endpoint-url-${project._id}`}
                                type="url"
                                value={url}
                                onChange={(event) =>
                                    setUrl(event.target.value)
                                }
                                required
                                placeholder="https://api.example.com/users"
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor={`endpoint-method-${project._id}`}
                                className="mb-1 block text-sm text-slate-300"
                            >
                                HTTP method
                            </label>

                            <select
                                id={`endpoint-method-${project._id}`}
                                value={method}
                                onChange={(event) =>
                                    setMethod(event.target.value)
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {methods.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {error && (
                            <p
                                role="alert"
                                className="text-sm text-red-400"
                            >
                                {error}
                            </p>
                        )}

                        {success && (
                            <p
                                role="status"
                                className="text-sm text-emerald-400"
                            >
                                {success}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submitting
                                ? "Adding endpoint..."
                                : "Save Endpoint"}
                        </button>
                    </form>
                )}

                {error && !formOpen && (
                    <p
                        role="alert"
                        className="mb-3 text-sm text-red-400"
                    >
                        {error}
                    </p>
                )}

                {success && !formOpen && (
                    <p
                        role="status"
                        className="mb-3 text-sm text-emerald-400"
                    >
                        {success}
                    </p>
                )}

                {testResult && (
                    <p
                        role="status"
                        className="mb-3 text-sm text-emerald-400"
                    >
                        {testResult}
                    </p>
                )}

                {endpoints.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-700 p-5 text-center">
                        <p className="text-sm text-slate-400">
                            No endpoints configured
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                            Add an endpoint to start monitoring this project.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {endpoints.map((endpoint) => {
                            const endpointName =
                                endpoint.name || "Unnamed endpoint";

                            const isDeleting =
                                deletingEndpointId === endpoint._id;

                            const isTesting =
                                testingEndpointId === endpoint._id;

                            return (
                                <div
                                    key={endpoint._id}
                                    className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words font-medium">
                                                {endpointName}
                                            </p>

                                            <p className="mt-1 break-all text-sm text-slate-400">
                                                {endpoint.method}{" "}
                                                {endpoint.url}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="rounded bg-blue-500/10 px-2 py-1 text-xs text-blue-400">
                                                {endpoint.method}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void handleTestEndpoint(
                                                        endpoint._id,
                                                        endpointName
                                                    )
                                                }
                                                disabled={busy}
                                                aria-label={`Test ${endpointName}`}
                                                className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {isTesting
                                                    ? "Testing..."
                                                    : "Test"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void handleDeleteEndpoint(
                                                        endpoint._id,
                                                        endpointName
                                                    )
                                                }
                                                disabled={busy}
                                                aria-label={`Delete ${endpointName}`}
                                                className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {isDeleting
                                                    ? "Deleting..."
                                                    : "Delete"}
                                            </button>
                                        </div>
                                    </div>

                                    <ChaosControls
                                        endpointId={endpoint._id}
                                        endpointName={endpointName}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ProjectCard;
