interface AnalyticsFiltersProps {
    minutes: number;
    endpoint: string;
    method: string;
    status: string;

    onMinutesChange: (value: number) => void;
    onEndpointChange: (value: string) => void;
    onMethodChange: (value: string) => void;
    onStatusChange: (value: string) => void;
}

function AnalyticsFilters({
    minutes,
    endpoint,
    method,
    status,
    onMinutesChange,
    onEndpointChange,
    onMethodChange,
    onStatusChange,
}: AnalyticsFiltersProps) {
    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                {/* Time Range */}
                <div>
                    <label className="block text-xs text-slate-400 mb-2">
                        Time Range
                    </label>

                    <select
                        value={minutes}
                        onChange={(e) =>
                            onMinutesChange(
                                Number(e.target.value)
                            )
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                        <option value={5}>
                            Last 5 minutes
                        </option>

                        <option value={15}>
                            Last 15 minutes
                        </option>

                        <option value={30}>
                            Last 30 minutes
                        </option>

                        <option value={60}>
                            Last 60 minutes
                        </option>

                        <option value={1440}>
                            Last 24 hours
                        </option>
                    </select>
                </div>

                {/* Endpoint */}
                <div>
                    <label className="block text-xs text-slate-400 mb-2">
                        Endpoint
                    </label>

                    <input
                        type="text"
                        value={endpoint}
                        onChange={(e) =>
                            onEndpointChange(
                                e.target.value
                            )
                        }
                        placeholder="All endpoints"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none"
                    />
                </div>

                {/* Method */}
                <div>
                    <label className="block text-xs text-slate-400 mb-2">
                        Method
                    </label>

                    <select
                        value={method}
                        onChange={(e) =>
                            onMethodChange(
                                e.target.value
                            )
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                        <option value="">
                            All methods
                        </option>

                        <option value="GET">
                            GET
                        </option>

                        <option value="POST">
                            POST
                        </option>

                        <option value="PUT">
                            PUT
                        </option>

                        <option value="PATCH">
                            PATCH
                        </option>

                        <option value="DELETE">
                            DELETE
                        </option>
                    </select>
                </div>

                {/* Status */}
                <div>
                    <label className="block text-xs text-slate-400 mb-2">
                        Status
                    </label>

                    <select
                        value={status}
                        onChange={(e) =>
                            onStatusChange(
                                e.target.value
                            )
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                        <option value="">
                            All statuses
                        </option>

                        <option value="success">
                            Success
                        </option>

                        <option value="failed">
                            Failed
                        </option>
                    </select>
                </div>

            </div>
        </div>
    );
}

export default AnalyticsFilters;