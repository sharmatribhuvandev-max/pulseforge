interface EndpointAnalyticsData {
    endpoint: string;
    method: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRate: number;
    averageLatency: number;
    maxLatency: number;
    p95Latency: number;
}

interface EndpointAnalyticsProps {
    analytics: EndpointAnalyticsData[];
}

function EndpointAnalyticsCard({
    analytics,
}: EndpointAnalyticsProps) {
    if (analytics.length === 0) {
        return (
            <p className="text-sm text-slate-500">
                No endpoint analytics available.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {analytics.map((item) => (
                <div
                    key={`${item.method}-${item.endpoint}`}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-5"
                >
                    <div className="flex items-start justify-between gap-4">

                        <div className="min-w-0">

                            <div className="flex items-center gap-3">

                                <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-xs font-semibold">
                                    {item.method}
                                </span>

                                <p className="font-medium text-white truncate">
                                    {item.endpoint}
                                </p>

                            </div>

                        </div>

                        <span
                            className={`text-sm font-semibold ${
                                item.errorRate >= 50
                                    ? "text-red-400"
                                    : item.errorRate > 0
                                    ? "text-yellow-400"
                                    : "text-green-400"
                            }`}
                        >
                            {item.errorRate}%
                        </span>

                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">

                        <div>
                            <p className="text-xs text-slate-500">
                                Requests
                            </p>

                            <p className="text-lg font-bold text-white mt-1">
                                {item.totalRequests}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-500">
                                Errors
                            </p>

                            <p className="text-lg font-bold text-red-400 mt-1">
                                {item.failedRequests}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-500">
                                Avg Latency
                            </p>

                            <p className="text-lg font-bold text-white mt-1">
                                {item.averageLatency} ms
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-slate-500">
                                P95 Latency
                            </p>

                            <p className="text-lg font-bold text-white mt-1">
                                {item.p95Latency} ms
                            </p>
                        </div>

                    </div>

                    <div className="flex gap-6 mt-4 text-sm text-slate-400">

                        <span>
                            Successful:{" "}
                            <span className="text-green-400">
                                {item.successfulRequests}
                            </span>
                        </span>

                        <span>
                            Max:{" "}
                            <span className="text-white">
                                {item.maxLatency} ms
                            </span>
                        </span>

                    </div>
                </div>
            ))}
        </div>
    );
}

export default EndpointAnalyticsCard;