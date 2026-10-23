import { ChaosRule } from "../models/ChaosRule";

export async function getActiveChaosRule(
    endpointId: string
) {
    const rule = await ChaosRule.findOne({
        endpointId,
        enabled: true
    }).sort({
        createdAt: -1
    });

    return rule;
}

export function applyLatency(latency: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, latency);
    });
}

export function shouldInjectError(errorRate: number): boolean {
    if (errorRate <= 0) {
        return false;
    }

    if (errorRate >= 100) {
        return true;
    }

    const random = Math.random() * 100;

    return random < errorRate;
}