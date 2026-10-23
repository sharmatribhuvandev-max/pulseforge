interface StatsCardsProps {
    totalRequests: number;
    successfulRequests: number;
    errors: number;
}

function StatsCards({
    totalRequests,
    successfulRequests,
    errors,
}: StatsCardsProps) {
    const cards = [
        {
            title: "Total Requests",
            value: totalRequests,
            valueClass: "text-white",
        },
        {
            title: "Successful Requests",
            value: successfulRequests,
            valueClass: "text-green-400",
        },
        {
            title: "Failed Requests",
            value: errors,
            valueClass: "text-red-400",
        },
    ];

    return (
        <div>
            <div className="mb-3">
                <h2 className="text-lg font-semibold text-white">
                    Request Activity
                </h2>

                <p className="text-sm text-slate-400">
                    Persisted request history and events received during this session
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map((card) => (
                    <div
                        key={card.title}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-6"
                    >
                        <p className="text-slate-400">
                            {card.title}
                        </p>

                        <h2
                            className={`text-3xl font-bold mt-2 ${card.valueClass}`}
                        >
                            {card.value}
                        </h2>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default StatsCards;