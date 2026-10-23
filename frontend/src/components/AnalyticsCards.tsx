import type { ProjectAnalytics } from "../services/projectService";

interface AnalyticsCardsProps {
    analytics?: ProjectAnalytics;
}

function AnalyticsCards({
    analytics,
}: AnalyticsCardsProps) {

    if (!analytics) {
        return (
            <p className="text-sm text-slate-500">
                Analytics unavailable.
            </p>
        );
    }

    const cards = [
        {
            title: "Total Requests",
            value: analytics.totalRequests,
            className: "text-white",
        },
        {
            title: "Successful",
            value: analytics.successfulRequests,
            className: "text-green-400",
        },
        {
            title: "Failed",
            value: analytics.failedRequests,
            className: "text-red-400",
        },
        {
            title: "Error Rate",
            value: `${analytics.errorRate}%`,
            className: "text-red-400",
        },
        {
            title: "Avg Latency",
            value: `${analytics.averageLatency} ms`,
            className: "text-white",
        },
        {
            title: "P95 Latency",
            value: `${analytics.p95Latency} ms`,
            className: "text-white",
        },
        {
            title: "Max Latency",
            value: `${analytics.maxLatency} ms`,
            className: "text-white",
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            {cards.map((card) => (
                <div
                    key={card.title}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
                >
                    <p className="text-xs text-slate-400">
                        {card.title}
                    </p>

                    <p
                        className={`text-2xl font-bold mt-1 ${card.className}`}
                    >
                        {card.value}
                    </p>
                </div>
            ))}

        </div>
    );
}

export default AnalyticsCards;