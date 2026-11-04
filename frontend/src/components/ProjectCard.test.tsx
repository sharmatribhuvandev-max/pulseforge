// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
    getChaosRules: vi.fn(),
    updateChaosRule: vi.fn(),
    createChaosRule: vi.fn(),
    createEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
    checkEndpoint: vi.fn(),
    getCheckErrorMessage: vi.fn(),
}));

vi.mock("../services/chaosService", () => ({
    getChaosRules: mocks.getChaosRules,
    updateChaosRule: mocks.updateChaosRule,
    createChaosRule: mocks.createChaosRule,
}));

vi.mock("../services/endpointService", () => ({
    createEndpoint: mocks.createEndpoint,
    deleteEndpoint: mocks.deleteEndpoint,
    checkEndpoint: mocks.checkEndpoint,
    getCheckErrorMessage: mocks.getCheckErrorMessage,
}));

import ProjectCard from "./ProjectCard";

const PROJECT = {
    _id: "p1", name: "Shop", description: "", userId: "u1",
    createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z",
};
const ENDPOINT = {
    _id: "e1", projectId: "p1", name: "Users API", url: "https://api.example.com/users",
    method: "GET", createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z",
};
const HEALTHY = { message: "ok", result: { statusCode: 200, latency: 120, success: true } };

describe("ProjectCard", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it("reloads the dashboard once after a recovery verification finishes", async () => {
        mocks.getChaosRules.mockResolvedValue([]);
        mocks.checkEndpoint.mockResolvedValue(HEALTHY);
        const onEndpointCreated = vi.fn().mockResolvedValue(undefined);

        render(<ProjectCard project={PROJECT} endpoints={[ENDPOINT]} onEndpointCreated={onEndpointCreated} />);

        const button = await screen.findByRole("button", { name: "Disable Chaos & Verify" });
        await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(button);

        await screen.findByText(/Recovery check finished: 3 of 3 requests succeeded/);
        await waitFor(() => expect(onEndpointCreated).toHaveBeenCalledTimes(1));
    });
});
