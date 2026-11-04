// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
    getChaosRules: vi.fn(),
    updateChaosRule: vi.fn(),
    createChaosRule: vi.fn(),
    checkEndpoint: vi.fn(),
}));

vi.mock("../services/chaosService", () => ({
    getChaosRules: mocks.getChaosRules,
    updateChaosRule: mocks.updateChaosRule,
    createChaosRule: mocks.createChaosRule,
}));

vi.mock("../services/endpointService", () => ({
    checkEndpoint: mocks.checkEndpoint,
}));

import ChaosControls from "./ChaosControls";

const ENABLED_RULE = { _id: "r1", endpointId: "e1", enabled: true, latency: 1500, errorRate: 0, statusCode: 500 };
const DISABLED_RULE = { ...ENABLED_RULE, enabled: false };
const HEALTHY = { message: "ok", result: { statusCode: 200, latency: 120, success: true } };

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

const flush = () => new Promise((done) => setTimeout(done, 0));

async function renderReady() {
    const onRecoveryVerified = vi.fn().mockResolvedValue(undefined);
    const view = render(
        <ChaosControls endpointId="e1" endpointName="Users API" onRecoveryVerified={onRecoveryVerified} />
    );
    const button = await screen.findByRole("button", { name: "Disable Chaos & Verify" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    return { ...view, button, onRecoveryVerified };
}

describe("ChaosControls verify recovery", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it("says it disables chaos, and says so while running", async () => {
        mocks.getChaosRules.mockResolvedValue([DISABLED_RULE]);
        const pending = deferred<typeof HEALTHY>();
        mocks.checkEndpoint.mockReturnValue(pending.promise);

        const { button } = await renderReady();
        fireEvent.click(button);

        expect(await screen.findByRole("button", { name: "Disabling chaos and checking..." })).toBeTruthy();

        await act(async () => {
            pending.resolve(HEALTHY);
            await flush();
        });
    });

    it("stops checking and aborts the in-flight check on unmount", async () => {
        mocks.getChaosRules.mockResolvedValue([DISABLED_RULE]);
        const pending = deferred<typeof HEALTHY>();
        mocks.checkEndpoint.mockReturnValue(pending.promise);

        const { button, unmount, onRecoveryVerified } = await renderReady();
        fireEvent.click(button);
        await waitFor(() => expect(mocks.checkEndpoint).toHaveBeenCalledTimes(1));
        const signal = mocks.checkEndpoint.mock.calls[0][1]?.signal as AbortSignal | undefined;

        unmount();
        pending.resolve(HEALTHY);
        await flush();

        expect(signal?.aborted).toBe(true);
        expect(mocks.checkEndpoint).toHaveBeenCalledTimes(1);
        expect(onRecoveryVerified).not.toHaveBeenCalled();
    });

    it("sends no further requests if unmounted while disabling rules", async () => {
        mocks.getChaosRules.mockResolvedValue([ENABLED_RULE]);
        const update = deferred<typeof DISABLED_RULE>();
        mocks.updateChaosRule.mockReturnValue(update.promise);
        mocks.checkEndpoint.mockResolvedValue(HEALTHY);

        const { button, unmount } = await renderReady();
        fireEvent.click(button);
        await waitFor(() => expect(mocks.updateChaosRule).toHaveBeenCalledTimes(1));
        const rulesCallsBefore = mocks.getChaosRules.mock.calls.length;

        unmount();
        update.resolve(DISABLED_RULE);
        await flush();

        expect(mocks.getChaosRules).toHaveBeenCalledTimes(rulesCallsBefore);
        expect(mocks.checkEndpoint).not.toHaveBeenCalled();
    });
});
