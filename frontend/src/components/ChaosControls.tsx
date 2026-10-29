
import { useEffect, useState } from "react";
import {
    createChaosRule,
    getChaosRules,
    updateChaosRule,
} from "../services/chaosService";
import type { ChaosRule } from "../services/chaosService";
import { checkEndpoint } from "../services/endpointService";

interface ChaosControlsProps {
    endpointId: string;
    endpointName: string;
    onRecoveryVerified?: () => Promise<void>;
}

interface RecoveryCheck {
    attempt: number;
    statusCode: number | null;
    latency: number | null;
    success: boolean;
    message: string;
}

function ChaosControls({
    endpointId,
    endpointName,
    onRecoveryVerified,
}: ChaosControlsProps) {
    const [rule, setRule] = useState<ChaosRule | null>(null);
    const [latency, setLatency] = useState("1500");
    const [errorRate, setErrorRate] = useState("0");
    const [statusCode, setStatusCode] = useState("500");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [verifying, setVerifying] = useState(false);

    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [recoveryChecks, setRecoveryChecks] = useState<RecoveryCheck[]>([]);
    const [recoveryComplete, setRecoveryComplete] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadRules = async () => {
            setLoading(true);
            setError("");

            try {
                const rules = await getChaosRules(endpointId);

                if (cancelled) return;

                const existingRule = rules[0] ?? null;
                setRule(existingRule);

                if (existingRule) {
                    setLatency(String(existingRule.latency));
                    setErrorRate(String(existingRule.errorRate));
                    setStatusCode(String(existingRule.statusCode));
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Unable to load chaos rules."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadRules();

        return () => {
            cancelled = true;
        };
    }, [endpointId]);

    const getConfiguration = () => {
        const latencyValue = Number(latency);
        const errorRateValue = Number(errorRate);
        const statusCodeValue = Number(statusCode);

        if (
            !Number.isFinite(latencyValue) ||
            latencyValue < 0 ||
            latencyValue > 30000
        ) {
            throw new Error("Latency must be between 0 and 30000 ms.");
        }

        if (
            !Number.isFinite(errorRateValue) ||
            errorRateValue < 0 ||
            errorRateValue > 100
        ) {
            throw new Error("Error rate must be between 0 and 100%.");
        }

        if (
            !Number.isInteger(statusCodeValue) ||
            statusCodeValue < 100 ||
            statusCodeValue > 599
        ) {
            throw new Error("HTTP status code must be between 100 and 599.");
        }

        return {
            latency: latencyValue,
            errorRate: errorRateValue,
            statusCode: statusCodeValue,
        };
    };

    const handleSave = async () => {
        setError("");
        setMessage("");
        setRecoveryComplete(false);

        try {
            const configuration = getConfiguration();
            setSaving(true);

            const updatedRule = rule
                ? await updateChaosRule(rule._id, configuration)
                : await createChaosRule({
                    endpointId,
                    enabled: false,
                    ...configuration,
                });

            setRule(updatedRule);
            setMessage(
                updatedRule.enabled
                    ? "Configuration saved. Chaos remains enabled."
                    : "Configuration saved. Chaos remains disabled."
            );
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to save chaos configuration."
            );
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async () => {
        setError("");
        setMessage("");
        setRecoveryComplete(false);

        try {
            setSaving(true);

            if (rule) {
                const updatedRule = await updateChaosRule(rule._id, {
                    enabled: !rule.enabled,
                });

                setRule(updatedRule);
                setMessage(
                    updatedRule.enabled
                        ? "Chaos injection enabled."
                        : "Chaos injection disabled."
                );
            } else {
                const configuration = getConfiguration();

                const createdRule = await createChaosRule({
                    endpointId,
                    enabled: true,
                    ...configuration,
                });

                setRule(createdRule);
                setMessage("Chaos injection enabled.");
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to update chaos status."
            );
        } finally {
            setSaving(false);
        }
    };


    const handleVerifyRecovery = async () => {
        setError("");
        setMessage("");
        setRecoveryChecks([]);
        setRecoveryComplete(false);

        try {
            setVerifying(true);

            // Load every chaos rule for this endpoint.
            const rules = await getChaosRules(endpointId);

            // Disable every enabled rule, including older rules
            // that may have been enabled before the backend fix.
            const enabledRules = rules.filter((item) => item.enabled);

            for (const activeRule of enabledRules) {
                await updateChaosRule(activeRule._id, {
                    enabled: false,
                });
            }

            // Refresh the local rule state after disabling chaos.
            const refreshedRules = await getChaosRules(endpointId);
            const currentRule = refreshedRules[0] ?? null;

            setRule(currentRule);

            if (currentRule) {
                setLatency(String(currentRule.latency));
                setErrorRate(String(currentRule.errorRate));
                setStatusCode(String(currentRule.statusCode));
            }

            // Confirm no enabled rule remains before testing recovery.
            const stillEnabled = refreshedRules.some(
                (item) => item.enabled
            );

            if (stillEnabled) {
                throw new Error(
                    "Could not disable all chaos rules. Recovery checks were not started."
                );
            }

            const checks: RecoveryCheck[] = [];

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const response = await checkEndpoint(endpointId);
                    const result = response.result;

                    if (!result) {
                        checks.push({
                            attempt,
                            statusCode: null,
                            latency: null,
                            success: false,
                            message: "No request result returned",
                        });
                    } else {
                        const succeeded = result.success === true;

                        checks.push({
                            attempt,
                            statusCode:
                                typeof result.statusCode === "number"
                                    ? result.statusCode
                                    : null,
                            latency:
                                typeof result.latency === "number"
                                    ? result.latency
                                    : null,
                            success: succeeded,
                            message: succeeded
                                ? "Request succeeded"
                                : result.success === false
                                    ? "Request failed"
                                    : "Success status unavailable",
                        });
                    }
                } catch (requestError) {
                    checks.push({
                        attempt,
                        statusCode: null,
                        latency: null,
                        success: false,
                        message:
                            requestError instanceof Error
                                ? requestError.message
                                : "Request failed",
                    });
                }

                setRecoveryChecks([...checks]);
            }

            const passed = checks.filter(
                (check) => check.success
            ).length;

            setRecoveryComplete(true);
            setMessage(
                `Recovery check finished: ${passed} of ${checks.length} requests succeeded.`
            );

            if (onRecoveryVerified) {
                try {
                    await onRecoveryVerified();
                } catch (refreshError) {
                    console.error(
                        "Failed to refresh dashboard after recovery check:",
                        refreshError
                    );
                }
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to verify recovery."
            );
        } finally {
            setVerifying(false);
        }
    };

    const averageLatency = (() => {
        const measured = recoveryChecks
            .map((check) => check.latency)
            .filter((value): value is number => value !== null);

        if (measured.length === 0) return null;

        return Math.round(
            measured.reduce((total, value) => total + value, 0) /
            measured.length
        );
    })();

    const recoveryPassed =
        recoveryComplete &&
        recoveryChecks.length === 3 &&
        recoveryChecks.every(
            (check) =>
                check.success &&
                check.statusCode !== null &&
                check.statusCode >= 200 &&
                check.statusCode < 300
        );

    const latencyRecoveryPassed =
        recoveryPassed &&
        recoveryChecks.every(
            (check) =>
                check.latency !== null &&
                check.latency < 1000
        );

    return (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h5 className="font-medium text-slate-200">
                        Chaos Testing
                    </h5>
                    <p className="mt-1 text-xs text-slate-400">
                        Configure fault injection for {endpointName}.
                    </p>
                </div>

                <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${rule?.enabled
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-slate-700/60 text-slate-400"
                        }`}
                >
                    {loading
                        ? "Loading..."
                        : rule?.enabled
                            ? "Chaos enabled"
                            : "Chaos disabled"}
                </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                    <label
                        htmlFor={`chaos-latency-${endpointId}`}
                        className="mb-1 block text-xs text-slate-400"
                    >
                        Added latency (ms)
                    </label>
                    <input
                        id={`chaos-latency-${endpointId}`}
                        type="number"
                        min="0"
                        max="30000"
                        step="100"
                        value={latency}
                        onChange={(event) => setLatency(event.target.value)}
                        disabled={loading || saving || verifying}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                    />
                </div>

                <div>
                    <label
                        htmlFor={`chaos-error-rate-${endpointId}`}
                        className="mb-1 block text-xs text-slate-400"
                    >
                        Error rate (%)
                    </label>
                    <input
                        id={`chaos-error-rate-${endpointId}`}
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={errorRate}
                        onChange={(event) => setErrorRate(event.target.value)}
                        disabled={loading || saving || verifying}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                    />
                </div>

                <div>
                    <label
                        htmlFor={`chaos-status-code-${endpointId}`}
                        className="mb-1 block text-xs text-slate-400"
                    >
                        Error status code
                    </label>
                    <input
                        id={`chaos-status-code-${endpointId}`}
                        type="number"
                        min="100"
                        max="599"
                        step="1"
                        value={statusCode}
                        onChange={(event) => setStatusCode(event.target.value)}
                        disabled={loading || saving || verifying}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                    />
                </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
                Latency: 0–30000 ms. Error rate: 0–100%.
                Use a non-zero latency or error rate to inject faults.
            </p>

            {error && (
                <p role="alert" className="mt-3 text-sm text-red-400">
                    {error}
                </p>
            )}

            {message && (
                <p role="status" className="mt-3 text-sm text-emerald-400">
                    {message}
                </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={loading || saving || verifying}
                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? "Saving..." : "Save Configuration"}
                </button>

                <button
                    type="button"
                    onClick={() => void handleToggle()}
                    disabled={loading || saving || verifying}
                    className={`rounded-lg px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${rule?.enabled
                        ? "bg-red-600 hover:bg-red-500"
                        : "bg-amber-600 hover:bg-amber-500"
                        }`}
                >
                    {saving
                        ? "Updating..."
                        : rule?.enabled
                            ? "Disable Chaos"
                            : "Enable Chaos"}
                </button>

                <button
                    type="button"
                    onClick={() => void handleVerifyRecovery()}
                    disabled={loading || saving || verifying}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {verifying ? "Checking recovery..." : "Verify Recovery"}
                </button>
            </div>


            {recoveryComplete && (
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h6 className="font-medium text-slate-200">
                            Recovery Verification
                        </h6>
                        <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${recoveryPassed && latencyRecoveryPassed
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-amber-500/10 text-amber-400"
                                }`}
                        >
                            {recoveryPassed && latencyRecoveryPassed
                                ? "Request and latency recovery passed"
                                : "Recovery needs attention"}
                        </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div>
                            <p className="text-xs text-slate-400">
                                Successful HTTP checks
                            </p>
                            <p className="mt-1 text-lg font-semibold text-emerald-400">
                                {
                                    recoveryChecks.filter(
                                        (check) =>
                                            check.success &&
                                            check.statusCode !== null &&
                                            check.statusCode >= 200 &&
                                            check.statusCode < 300
                                    ).length
                                }/3
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-400">
                                Failed checks
                            </p>
                            <p className="mt-1 text-lg font-semibold text-red-400">
                                {
                                    recoveryChecks.filter(
                                        (check) =>
                                            !check.success ||
                                            check.statusCode === null ||
                                            check.statusCode < 200 ||
                                            check.statusCode >= 300
                                    ).length
                                }
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-400">
                                Average latency
                            </p>
                            <p className="mt-1 text-lg font-semibold text-slate-200">
                                {averageLatency === null
                                    ? "N/A"
                                    : `${averageLatency} ms`}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 rounded-md border border-slate-800 p-3">
                        <p className="text-sm font-medium text-slate-200">
                            Request recovery
                        </p>
                        <p
                            className={`mt-1 text-sm ${recoveryPassed
                                    ? "text-emerald-400"
                                    : "text-amber-400"
                                }`}
                        >
                            {recoveryPassed
                                ? "All three requests returned successful HTTP 2xx responses."
                                : "One or more checks failed or did not return a successful HTTP 2xx response."}
                        </p>

                        <p className="mt-3 text-sm font-medium text-slate-200">
                            Latency recovery
                        </p>
                        <p
                            className={`mt-1 text-sm ${latencyRecoveryPassed
                                    ? "text-emerald-400"
                                    : "text-amber-400"
                                }`}
                        >
                            {latencyRecoveryPassed
                                ? "All three requests were below the 1000 ms latency threshold."
                                : "Not recovered: all three requests must be below 1000 ms."}
                        </p>
                    </div>

                    <div className="mt-4 space-y-2">
                        {recoveryChecks.map((check) => {
                            const httpSucceeded =
                                check.success &&
                                check.statusCode !== null &&
                                check.statusCode >= 200 &&
                                check.statusCode < 300;

                            const latencyHealthy =
                                check.latency !== null &&
                                check.latency < 1000;

                            return (
                                <div
                                    key={check.attempt}
                                    className="rounded-md border border-slate-800 px-3 py-2"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm text-slate-300">
                                            Check {check.attempt}
                                        </span>
                                        <span
                                            className={`text-xs ${httpSucceeded
                                                    ? "text-emerald-400"
                                                    : "text-red-400"
                                                }`}
                                        >
                                            {check.message}
                                            {check.statusCode !== null
                                                ? ` · HTTP ${check.statusCode}`
                                                : ""}
                                            {check.latency !== null
                                                ? ` · ${check.latency} ms`
                                                : ""}
                                        </span>
                                    </div>

                                    <p
                                        className={`mt-1 text-xs ${latencyHealthy
                                                ? "text-emerald-400"
                                                : "text-amber-400"
                                            }`}
                                    >
                                        {check.latency === null
                                            ? "Latency unavailable"
                                            : latencyHealthy
                                                ? "Latency within threshold"
                                                : "Latency above threshold (1000 ms)"}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                        This panel verifies request outcomes and latency.
                        Incident resolution is handled by the backend and
                        should be confirmed in the dashboard's Active Incidents panel.
                    </p>
                </div>
            )}

        </div>
    );
}

export default ChaosControls;
