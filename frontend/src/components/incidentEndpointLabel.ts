import type { Endpoint } from "../services/endpointService";

interface IncidentEndpointRef {
    endpoint_id?: string | null;
}

export function incidentEndpointLabel(
    incident: IncidentEndpointRef,
    endpoints: readonly Pick<Endpoint, "_id" | "name" | "url" | "method">[]
): string {
    if (!incident.endpoint_id) {
        return "Project-wide (before per-endpoint tracking)";
    }

    const endpoint = endpoints.find(
        (candidate) => candidate._id === incident.endpoint_id
    );

    if (!endpoint) {
        return "Deleted endpoint";
    }

    const target = `${endpoint.method} ${endpoint.url}`;
    const name = endpoint.name?.trim();

    return name ? `${name} · ${target}` : target;
}
