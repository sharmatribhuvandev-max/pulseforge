import { afterEach, describe, expect, it, vi } from "vitest";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";

const { axiosMock, dnsLookupMock } = vi.hoisted(() => ({
    axiosMock: vi.fn(),
    dnsLookupMock: vi.fn(),
}));

vi.mock("axios", () => ({
    default: axiosMock,
}));

vi.mock("node:dns/promises", () => ({
    lookup: dnsLookupMock,
}));
import {
    destroyOutboundPool,
    getOutboundPoolSize,
    requestOutbound,
    validateOutboundUrl,
} from "../src/services/outboundRequest";

let destroySpy: ReturnType<typeof vi.spyOn> | undefined;

function trackDestroy() {
    destroySpy = vi.spyOn(HttpAgent.prototype, "destroy");
    return destroySpy;
}

function pinnedAddressOf(agent: unknown): string {
    const lookup = (
        agent as {
            options: {
                lookup: (
                    hostname: string,
                    options: object,
                    callback: (
                        error: Error | null,
                        address: string,
                        family?: number
                    ) => void
                ) => void;
            };
        }
    ).options.lookup;

    let resolved = "";

    lookup("ignored.example", {}, (_error, address) => {
        resolved = address;
    });

    return resolved;
}
describe("validateOutboundUrl", () => {
    it("accepts a valid public HTTPS URL", () => {
        const result = validateOutboundUrl(
            "https://example.com/health"
        );

        expect(result.protocol).toBe("https:");
        expect(result.hostname).toBe("example.com");
    });

    it("accepts a valid public HTTP URL", () => {
        const result = validateOutboundUrl(
            "http://example.com/health"
        );

        expect(result.protocol).toBe("http:");
    });

    it.each([
        "not-a-url",
        "ftp://example.com/file",
        "javascript:alert(1)",
        "file:///etc/passwd",
    ])("rejects an invalid or unsupported URL: %s", (url) => {
        expect(() => validateOutboundUrl(url)).toThrow();
    });

    it("rejects URLs containing embedded credentials", () => {
        expect(() =>
            validateOutboundUrl("https://user:password@example.com/")
        ).toThrow(/Credentials/);
    });
});

describe("requestOutbound", () => {
    afterEach(() => {
        vi.clearAllMocks();
        destroyOutboundPool();
        vi.useRealTimers();
        destroySpy?.mockRestore();
        destroySpy = undefined;
    });

    it("rejects a loopback IPv4 destination before making a request", async () => {
        await expect(
            requestOutbound("http://127.0.0.1/health", "GET")
        ).rejects.toThrow(/public IP address/);

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("rejects a private IPv4 destination before making a request", async () => {
        await expect(
            requestOutbound("http://192.168.1.10/health", "GET")
        ).rejects.toThrow(/public IP address/);

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("rejects a loopback IPv6 destination before making a request", async () => {
        await expect(
            requestOutbound("http://[::1]/health", "GET")
        ).rejects.toThrow(/public IP address/);

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("rejects a hostname if DNS returns a private address", async () => {
        dnsLookupMock.mockResolvedValueOnce([
            { address: "93.184.216.34", family: 4 },
            { address: "10.0.0.5", family: 4 },
        ]);

        await expect(
            requestOutbound("https://mixed.example/health", "GET")
        ).rejects.toThrow(/public IP address/);

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("rejects a hostname if DNS returns only private addresses", async () => {
        dnsLookupMock.mockResolvedValueOnce([
            { address: "10.0.0.5", family: 4 },
        ]);

        await expect(
            requestOutbound("https://private.example/health", "GET")
        ).rejects.toThrow(/public IP address/);

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("uses a pinned connection and disables automatic redirects", async () => {
        dnsLookupMock.mockResolvedValueOnce([
            { address: "93.184.216.34", family: 4 },
        ]);

        axiosMock.mockResolvedValueOnce({ status: 200 });

        await requestOutbound(
            "https://public.example/health",
            "GET"
        );

        expect(axiosMock).toHaveBeenCalledOnce();

        const config = axiosMock.mock.calls[0][0];

        expect(config.url).toBe("https://public.example/health");
        expect(config.method).toBe("GET");
        expect(config.timeout).toBe(10_000);
        expect(config.maxRedirects).toBe(0);
        expect(config.proxy).toBe(false);
        expect(config.httpsAgent).toBeInstanceOf(HttpsAgent);
        expect(config.httpAgent).toBeUndefined();
    });

    it.each([
        "http://100.64.0.1/health",
        "http://192.0.2.1/health",
        "http://198.18.0.1/health",
        "http://198.51.100.1/health",
        "http://203.0.113.1/health",
        "http://[2001:db8::1]/health",
        "http://[fc00::1]/health",
        "http://[fe80::1]/health",
        "http://[::ffff:127.0.0.1]/health",
    ])("rejects a special-use IP destination: %s", async (url) => {
        await expect(
            requestOutbound(url, "GET")
        ).rejects.toThrow();

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("rejects requests when DNS resolution fails", async () => {
        dnsLookupMock.mockRejectedValueOnce(
            new Error("DNS resolution failed")
        );

        await expect(
            requestOutbound("https://unresolved.example/health", "GET")
        ).rejects.toThrow("DNS resolution failed");

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("rejects a hostname that resolves to no addresses", async () => {
        dnsLookupMock.mockResolvedValueOnce([]);

        await expect(
            requestOutbound("https://empty-dns.example/health", "GET")
        ).rejects.toThrow(/did not resolve/);

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("rejects a hostname with a private IPv6 DNS result", async () => {
        dnsLookupMock.mockResolvedValueOnce([
            { address: "93.184.216.34", family: 4 },
            { address: "fd00::1", family: 6 },
        ]);

        await expect(
            requestOutbound("https://mixed-ipv6.example/health", "GET")
        ).rejects.toThrow(/public IP address/);

        expect(axiosMock).not.toHaveBeenCalled();
    });

    it("retires and destroys the agent when the request fails at connection level", async () => {
        dnsLookupMock.mockResolvedValueOnce([
            { address: "93.184.216.34", family: 4 },
        ]);

        axiosMock.mockRejectedValueOnce(new Error("network failure"));

        const spy = trackDestroy();

        await expect(
            requestOutbound("https://failure.example/health", "GET")
        ).rejects.toThrow("network failure");

        expect(spy).toHaveBeenCalledTimes(1);
        expect(getOutboundPoolSize()).toBe(0);
    });

    it("keeps the agent pooled after an HTTP error response", async () => {
        dnsLookupMock.mockResolvedValueOnce([
            { address: "93.184.216.34", family: 4 },
        ]);

        axiosMock.mockRejectedValueOnce(
            Object.assign(new Error("not found"), {
                response: { status: 404 },
            })
        );

        const spy = trackDestroy();

        await expect(
            requestOutbound("https://http-error.example/health", "GET")
        ).rejects.toThrow("not found");

        expect(spy).not.toHaveBeenCalled();
        expect(getOutboundPoolSize()).toBe(1);
    });

    it("reuses a validated DNS result for repeated requests to the same hostname", async () => {
        dnsLookupMock.mockResolvedValue([
            { address: "93.184.216.34", family: 4 },
        ]);

        axiosMock.mockResolvedValue({ status: 200 });

        await requestOutbound("https://cache.example/health", "GET");
        await requestOutbound("https://cache.example/health", "GET");

        expect(dnsLookupMock).toHaveBeenCalledTimes(1);
        expect(axiosMock).toHaveBeenCalledTimes(2);
    });

    it("does not cache DNS results containing private addresses", async () => {
        dnsLookupMock
            .mockResolvedValueOnce([
                { address: "93.184.216.34", family: 4 },
                { address: "10.0.0.5", family: 4 },
            ])
            .mockResolvedValueOnce([
                { address: "93.184.216.34", family: 4 },
            ]);

        axiosMock.mockResolvedValue({ status: 200 });

        await expect(
            requestOutbound("https://mixed-cache.example/health", "GET")
        ).rejects.toThrow(/public IP address/);

        await requestOutbound(
            "https://mixed-cache.example/health",
            "GET"
        );

        expect(dnsLookupMock).toHaveBeenCalledTimes(2);
        expect(axiosMock).toHaveBeenCalledTimes(1);
    });
});

describe("requestOutbound connection pool", () => {
    afterEach(() => {
        vi.clearAllMocks();
        destroyOutboundPool();
        vi.useRealTimers();
        destroySpy?.mockRestore();
        destroySpy = undefined;
    });

    it("reuses the same agent for repeated requests to the same destination", async () => {
        dnsLookupMock.mockResolvedValueOnce([
            { address: "93.184.216.34", family: 4 },
        ]);
        axiosMock
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 200 });

        await requestOutbound("https://reuse-agent.example/a", "GET");
        await requestOutbound("https://reuse-agent.example/b", "GET");

        const first = axiosMock.mock.calls[0][0].httpsAgent;
        const second = axiosMock.mock.calls[1][0].httpsAgent;

        expect(first).toBe(second);
        expect(getOutboundPoolSize()).toBe(1);
    });

    it("isolates agents by protocol, port and destination", async () => {
        axiosMock.mockResolvedValue({ status: 200 });

        await requestOutbound("https://93.184.216.34/health", "GET");
        await requestOutbound("https://93.184.216.34:8443/health", "GET");
        await requestOutbound("http://93.184.216.34/health", "GET");
        await requestOutbound("https://93.184.216.35/health", "GET");

        const agents = axiosMock.mock.calls.map(
            ([config]) => config.httpsAgent ?? config.httpAgent
        );

        expect(new Set(agents).size).toBe(4);
        expect(getOutboundPoolSize()).toBe(4);
    });

    it("uses a new agent pinned to the new IP when the validated address changes", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

        dnsLookupMock
            .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
            .mockResolvedValueOnce([{ address: "93.184.216.35", family: 4 }]);
        axiosMock
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 200 });

        await requestOutbound("https://ip-change.example/health", "GET");

        // Move past the 30 second DNS cache TTL.
        vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));

        await requestOutbound("https://ip-change.example/health", "GET");

        const first = axiosMock.mock.calls[0][0].httpsAgent;
        const second = axiosMock.mock.calls[1][0].httpsAgent;

        expect(first).not.toBe(second);
        expect(pinnedAddressOf(first)).toBe("93.184.216.34");
        expect(pinnedAddressOf(second)).toBe("93.184.216.35");
    });

    it("never exceeds the maximum number of pooled agents", async () => {
        const spy = trackDestroy();

        for (let i = 1; i <= 51; i++) {
            axiosMock.mockResolvedValueOnce({ status: 200 });
            await requestOutbound(`https://1.1.${i}.1/health`, "GET");
        }

        expect(getOutboundPoolSize()).toBe(50);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("evicts idle agents after the idle TTL", async () => {
        vi.useFakeTimers({
            toFake: ["setInterval", "clearInterval", "Date"],
        });

        axiosMock.mockResolvedValueOnce({ status: 200 });

        await requestOutbound("https://93.184.216.40/health", "GET");
        expect(getOutboundPoolSize()).toBe(1);

        vi.advanceTimersByTime(75_000);

        expect(getOutboundPoolSize()).toBe(0);
    });

    it("does not destroy a retired agent while another request is still using it", async () => {
        let resolveFirst!: (value: { status: number }) => void;

        axiosMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                })
        );
        axiosMock.mockRejectedValueOnce(new Error("connection dropped"));

        const spy = trackDestroy();
        const url = "https://93.184.216.41/health";

        const first = requestOutbound(url, "GET");
        const second = requestOutbound(url, "GET");

        await expect(second).rejects.toThrow("connection dropped");

        expect(spy).not.toHaveBeenCalled();
        expect(getOutboundPoolSize()).toBe(0);

        resolveFirst({ status: 200 });
        await first;

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("retries an idempotent request once on a fresh agent after a stale-socket reset", async () => {
        axiosMock
            .mockRejectedValueOnce(
                Object.assign(new Error("socket hang up"), {
                    code: "ECONNRESET",
                    request: { reusedSocket: true },
                })
            )
            .mockResolvedValueOnce({ status: 200 });

        const response = await requestOutbound(
            "https://93.184.216.42/health",
            "GET"
        );

        expect(response.status).toBe(200);
        expect(axiosMock).toHaveBeenCalledTimes(2);

        const first = axiosMock.mock.calls[0][0].httpsAgent;
        const second = axiosMock.mock.calls[1][0].httpsAgent;

        expect(first).not.toBe(second);
    });

    it("does not retry a non-idempotent request after a stale-socket reset", async () => {
        axiosMock.mockRejectedValueOnce(
            Object.assign(new Error("socket hang up"), {
                code: "ECONNRESET",
                request: { reusedSocket: true },
            })
        );

        await expect(
            requestOutbound("https://93.184.216.43/health", "POST")
        ).rejects.toThrow("socket hang up");

        expect(axiosMock).toHaveBeenCalledTimes(1);
    });
});