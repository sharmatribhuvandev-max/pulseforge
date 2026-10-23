
import type { Incident } from "../services/projectService";

interface IncidentPanelProps {
    activeIncidents: Incident[];
    resolvedIncidents: Incident[];
}

function IncidentPanel({
    activeIncidents,
    resolvedIncidents,
}: IncidentPanelProps) {
    const formatType = (type: string) => {
        return type
            .replaceAll("_", " ")
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const formatValue = (incident: Incident) => {
        if (incident.type === "HIGH_ERROR_RATE") {
            return `${Number(incident.actual_value).toFixed(2)}%`;
        }

        if (incident.type === "HIGH_LATENCY") {
            return `${Number(incident.actual_value)} ms`;
        }

        return String(incident.actual_value);
    };

    const formatThreshold = (incident: Incident) => {
        if (incident.type === "HIGH_ERROR_RATE") {
            return `${Number(incident.threshold).toFixed(0)}%`;
        }

        if (incident.type === "HIGH_LATENCY") {
            return `${Number(incident.threshold)} ms`;
        }

        return String(incident.threshold);
    };

    return (
        <div className="mt-8 space-y-8">
            {/* Active Incidents */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold">
                            🚨 Active Incidents
                        </h2>

                        <p className="text-sm text-slate-400 mt-1">
                            Incidents currently affecting your APIs
                        </p>
                    </div>

                    <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-sm">
                        {activeIncidents.length} active
                    </span>
                </div>

                {activeIncidents.length === 0 ? (
                    <div className="p-6 text-slate-400">
                        No active incidents. Everything looks healthy.
                    </div>
                ) : (
                    <div className="p-6 space-y-4">
                        {activeIncidents.map((incident) => (
                            <div
                                key={incident.id}
                                className="border border-red-500/30 bg-red-500/5 rounded-xl p-5"
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-red-400 font-semibold">
                                            {formatType(incident.type)}
                                        </h3>

                                        <p className="text-sm text-slate-500 mt-1">
                                            Started:{" "}
                                            {new Date(
                                                incident.started_at
                                            ).toLocaleString()}
                                        </p>
                                    </div>

                                    <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs font-medium">
                                        ACTIVE
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-5">
                                    <div>
                                        <p className="text-xs text-slate-500">
                                            Actual
                                        </p>

                                        <p className="text-xl font-bold text-white mt-1">
                                            {formatValue(incident)}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-500">
                                            Threshold
                                        </p>

                                        <p className="text-xl font-bold text-white mt-1">
                                            {formatThreshold(incident)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Resolved Incidents */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-slate-800">
                    <h2 className="text-xl font-semibold">
                        Resolved Incidents
                    </h2>

                    <p className="text-sm text-slate-400 mt-1">
                        Previously detected incidents
                    </p>
                </div>

                {resolvedIncidents.length === 0 ? (
                    <div className="p-6 text-slate-400">
                        No resolved incidents yet.
                    </div>
                ) : (
                    <div className="p-6 space-y-4">
                        {resolvedIncidents.map((incident) => (
                            <div
                                key={incident.id}
                                className="border border-slate-700 bg-slate-800/30 rounded-xl p-5"
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-slate-300 font-semibold">
                                            {formatType(incident.type)}
                                        </h3>

                                        <p className="text-sm text-slate-500 mt-1">
                                            Started:{" "}
                                            {new Date(
                                                incident.started_at
                                            ).toLocaleString()}
                                        </p>

                                        {incident.resolved_at && (
                                            <p className="text-sm text-slate-500">
                                                Resolved:{" "}
                                                {new Date(
                                                    incident.resolved_at
                                                ).toLocaleString()}
                                            </p>
                                        )}
                                    </div>

                                    <span className="px-2 py-1 rounded bg-green-500/10 text-green-400 text-xs font-medium">
                                        RESOLVED
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-5">
                                    <div>
                                        <p className="text-xs text-slate-500">
                                            Value at Resolution
                                        </p>

                                        <p className="text-lg font-bold text-white mt-1">
                                            {formatValue(incident)}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-slate-500">
                                            Threshold
                                        </p>

                                        <p className="text-lg font-bold text-white mt-1">
                                            {formatThreshold(incident)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default IncidentPanel;
