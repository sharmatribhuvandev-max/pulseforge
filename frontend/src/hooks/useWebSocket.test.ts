// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("axios", async (importOriginal) => {
    const actual = await importOriginal<typeof import("axios")>();
    return {
        ...actual,
        default: { ...actual.default, post: mocks.post, isAxiosError: actual.default.isAxiosError },
    };
});

vi.mock("../config", () => ({ API_URL: "http://localhost:3000" }));

import { useWebSocket } from "./useWebSocket";

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((message: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    url: string;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }

    close() {
        this.closed = true;
    }
}

const TICKET = { data: { ticket: "a".repeat(64), expiresIn: 30 } };

function httpError(status: number): AxiosError {
    return new AxiosError(
        `Request failed with status code ${status}`,
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        { status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() }, data: {} } as AxiosResponse,
    );
}

const advance = (ms: number) => act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
});

describe("useWebSocket", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.spyOn(Math, "random").mockReturnValue(0);
        vi.stubGlobal("WebSocket", FakeWebSocket);
        FakeWebSocket.instances = [];
        localStorage.setItem("token", "test-token");
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it.each([429, 503])("waits at least 15 s after a %i from the ticket request", async (status) => {
        mocks.post.mockRejectedValueOnce(httpError(status)).mockResolvedValue(TICKET);

        renderHook(() => useWebSocket());
        await advance(0);
        expect(mocks.post).toHaveBeenCalledTimes(1);

        await advance(14_999);
        expect(mocks.post).toHaveBeenCalledTimes(1);

        await advance(1);
        expect(mocks.post).toHaveBeenCalledTimes(2);
    });

    it("still retries a 500 after the normal short delay", async () => {
        mocks.post.mockRejectedValueOnce(httpError(500)).mockResolvedValue(TICKET);

        renderHook(() => useWebSocket());
        await advance(500);

        expect(mocks.post).toHaveBeenCalledTimes(2);
    });

    it("counts a reconnect after the connection drops and reopens", async () => {
        mocks.post.mockResolvedValue(TICKET);

        const { result } = renderHook(() => useWebSocket());
        await advance(0);
        act(() => FakeWebSocket.instances[0].onopen?.());
        expect(result.current.reconnects).toBe(0);

        act(() => FakeWebSocket.instances[0].onclose?.());
        await advance(500);
        act(() => FakeWebSocket.instances[1].onopen?.());

        expect(result.current.reconnects).toBe(1);
    });

    it("closes the socket and cancels a pending retry on unmount", async () => {
        mocks.post.mockResolvedValue(TICKET);

        const { unmount } = renderHook(() => useWebSocket());
        await advance(0);
        act(() => FakeWebSocket.instances[0].onopen?.());
        act(() => FakeWebSocket.instances[0].onclose?.());

        unmount();
        await advance(60_000);

        expect(FakeWebSocket.instances[0].closed).toBe(true);
        expect(mocks.post).toHaveBeenCalledTimes(1);
    });
});
