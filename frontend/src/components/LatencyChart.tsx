import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

import type { LatencyPoint } from "../services/projectService";

interface LatencyChartProps {
    history: LatencyPoint[];
}

function LatencyChart({
    history,
}: LatencyChartProps) {

    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">

            {history.length === 0 ? (

                <p className="text-sm text-slate-500">
                    No latency data available.
                </p>

            ) : (

                <div className="h-72">

                    <ResponsiveContainer
                        width="100%"
                        height="100%"
                    >

                        <LineChart data={history}>

                            <CartesianGrid
                                strokeDasharray="3 3"
                            />

                            <XAxis
                                dataKey="timestamp"
                                tickFormatter={(value) =>
                                    new Date(
                                        String(value)
                                    ).toLocaleTimeString()
                                }
                            />

                            <YAxis
                                label={{
                                    value: "Latency (ms)",
                                    angle: -90,
                                    position: "insideLeft",
                                }}
                            />

                            <Tooltip
                                labelFormatter={(value) =>
                                    new Date(
                                        String(value)
                                    ).toLocaleString()
                                }
                                formatter={(value) => [
                                    `${value} ms`,
                                    "Latency",
                                ]}
                            />

                            <Line
                                type="monotone"
                                dataKey="latency"
                                strokeWidth={2}
                                dot={true}
                                activeDot={{ r: 6 }}
                            />

                        </LineChart>

                    </ResponsiveContainer>

                </div>
            )}

        </div>
    );
}

export default LatencyChart;
