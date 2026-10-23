
interface WebSocketEvent {
    eventId?: string;
    requestId?: string;
    type?: string;
    projectId?: string;
    method?: string;
    endpoint?: string;
    statusCode?: number;
    latency?: number;
    success?: boolean;
    chaos?: boolean;
    timestamp?: string;
}

interface RecentEventsProps {
    events: WebSocketEvent[];
}

function RecentEvents({ events }: RecentEventsProps) {
    const apiEvents = events.filter(
        (event) =>
            event.type === "api_request" ||
            event.type === "chaos_event"
    );

    return (
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold">
                            Recent API Events
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                            Recent requests and real-time API activity
                        </p>
                    </div>

                    <span className="whitespace-nowrap text-xs text-slate-500">
                        {apiEvents.length} events
                    </span>
                </div>
            </div>

            {apiEvents.length === 0 ? (
                <div className="p-6 text-slate-400">
                    <p>Waiting for API events...</p>
                    <p className="mt-1 text-xs text-slate-500">
                        Trigger a monitored endpoint to see activity.
                    </p>
                </div>
            ) : (
                <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[850px] table-fixed border-collapse text-left">
                        <colgroup>
                            <col className="w-[76px]" />
                            <col className="w-[82px]" />
                            <col className="w-auto" />
                            <col className="w-[82px]" />
                            <col className="w-[100px]" />
                            <col className="w-[132px]" />
                        </colgroup>

                        <thead className="bg-slate-800/50">
                            <tr>
                                <th className="px-3 py-4 text-xs text-slate-400 sm:text-sm">
                                    Type
                                </th>
                                <th className="px-3 py-4 text-xs text-slate-400 sm:text-sm">
                                    Method
                                </th>
                                <th className="px-3 py-4 text-xs text-slate-400 sm:text-sm">
                                    Endpoint
                                </th>
                                <th className="px-3 py-4 text-xs text-slate-400 sm:text-sm">
                                    Status
                                </th>
                                <th className="px-3 py-4 text-xs text-slate-400 sm:text-sm">
                                    Latency
                                </th>
                                <th className="px-3 py-4 text-xs text-slate-400 sm:text-sm">
                                    Result
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-800">
                            {apiEvents.map((event, index) => {
                                const isChaos =
                                    event.type === "chaos_event" ||
                                    event.chaos === true;

                                const isSuccessful = event.success === true;
                                const isFailed = event.success === false;

                                return (
                                    <tr
                                        key={
                                            event.requestId ??
                                            event.eventId ??
                                            `${event.type}-${event.projectId || "project"}-${event.timestamp || "event"}-${index}`
                                        }
                                        className="hover:bg-slate-800/40 transition"
                                    >
                                        <td className="px-3 py-5 align-middle">
                                            <span
                                                className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                                                    isChaos
                                                        ? "bg-red-500/10 text-red-400"
                                                        : "bg-blue-500/10 text-blue-400"
                                                }`}
                                            >
                                                {isChaos ? "CHAOS" : "API"}
                                            </span>
                                        </td>

                                        <td className="px-3 py-5 align-middle">
                                            <span className="whitespace-nowrap font-mono text-sm">
                                                {event.method || "-"}
                                            </span>
                                        </td>

                                        <td className="max-w-0 overflow-hidden px-3 py-5 align-middle">
                                            <div className="min-w-0 overflow-hidden">
                                                <p
                                                    className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm text-slate-300"
                                                    title={event.endpoint || undefined}
                                                >
                                                    {event.endpoint || "Unknown endpoint"}
                                                </p>
                                            </div>
                                        </td>

                                        <td className="px-3 py-5 align-middle">
                                            {event.statusCode !== undefined ? (
                                                <span
                                                    className={`font-semibold ${
                                                        isFailed || isChaos
                                                            ? "text-red-400"
                                                            : "text-green-400"
                                                    }`}
                                                >
                                                    {event.statusCode}
                                                </span>
                                            ) : (
                                                <span className="text-slate-500">
                                                    -
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-3 py-5 align-middle">
                                            <span className="whitespace-nowrap text-sm tabular-nums text-slate-300">
                                                {event.latency !== undefined
                                                    ? `${event.latency} ms`
                                                    : "-"}
                                            </span>
                                        </td>

                                        <td className="px-3 py-5 align-middle">
                                            <span
                                                className={`whitespace-nowrap text-sm font-medium ${
                                                    isFailed || isChaos
                                                        ? "text-red-400"
                                                        : isSuccessful
                                                          ? "text-green-400"
                                                          : "text-slate-400"
                                                }`}
                                            >
                                                {isChaos
                                                    ? "Chaos Injected"
                                                    : isSuccessful
                                                      ? "Success"
                                                      : isFailed
                                                        ? "Failed"
                                                        : "Unknown"}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default RecentEvents;
