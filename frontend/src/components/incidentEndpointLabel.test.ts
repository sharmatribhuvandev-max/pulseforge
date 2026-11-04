import { describe, expect, it } from "vitest";
import { incidentEndpointLabel } from "./incidentEndpointLabel";

const endpoints = [
    { _id: "e1", projectId: "p1", name: "Users API", url: "https://api.example.com/users", method: "GET" },
    { _id: "e2", projectId: "p1", url: "https://api.example.com/orders", method: "POST" },
    { _id: "e3", projectId: "p1", name: "   ", url: "https://api.example.com/health", method: "GET" },
];

describe("incidentEndpointLabel", () => {
    it("labels incidents without an endpoint as project-wide", () => {
        expect(incidentEndpointLabel({ endpoint_id: null }, endpoints))
            .toBe("Project-wide (before per-endpoint tracking)");
    });

    it("treats a missing endpoint_id field as project-wide", () => {
        expect(incidentEndpointLabel({}, endpoints))
            .toBe("Project-wide (before per-endpoint tracking)");
    });

    it("shows the endpoint name, method and URL", () => {
        expect(incidentEndpointLabel({ endpoint_id: "e1" }, endpoints))
            .toBe("Users API · GET https://api.example.com/users");
    });

    it("shows method and URL when the endpoint has no name", () => {
        expect(incidentEndpointLabel({ endpoint_id: "e2" }, endpoints))
            .toBe("POST https://api.example.com/orders");
    });

    it("ignores a blank endpoint name", () => {
        expect(incidentEndpointLabel({ endpoint_id: "e3" }, endpoints))
            .toBe("GET https://api.example.com/health");
    });

    it("labels an endpoint that is no longer in the project as deleted", () => {
        expect(incidentEndpointLabel({ endpoint_id: "gone" }, endpoints))
            .toBe("Deleted endpoint");
    });
});
