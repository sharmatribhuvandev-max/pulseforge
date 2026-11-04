import { REQUIRED_HEALTHY_CHECKS } from "../incidentPolicy";

interface RecoveryProgressRef {
    type: string;
    healthy_checks?: number | null;
}

// Error-rate incidents recover independently, so only latency incidents
// show progress. A missing or invalid count shows nothing rather than "0".
export function formatRecoveryProgress(
    incident: RecoveryProgressRef
): string | null {
    const checks = incident.healthy_checks;

    if (
        incident.type !== "HIGH_LATENCY" ||
        typeof checks !== "number" ||
        !Number.isInteger(checks) ||
        checks < 0
    ) {
        return null;
    }

    const shown = Math.min(checks, REQUIRED_HEALTHY_CHECKS);

    return `Recovery: ${shown} of ${REQUIRED_HEALTHY_CHECKS} healthy checks`;
}
