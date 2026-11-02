import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

const { dnsLookupMock } = vi.hoisted(() => ({
    dnsLookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
    lookup: dnsLookupMock,
}));

// Test-only: let 127.0.0.1 count as a public address so a real local server
// can be reached. Every other address keeps the real ipaddr.js behaviour.
vi.mock("ipaddr.js", async (importOriginal) => {
    const actual = await importOriginal<{ default: typeof import("ipaddr.js") }>();
    const real = actual.default;

    return {
        default: {
            ...real,
            process: (address: string) => {
                const parsed = real.process(address);

                if (address === "127.0.0.1") {
                    return { range: () => "unicast" };
                }

                return parsed;
            },
            parse: (address: string) => real.parse(address),
        },
    };
});

import {
    destroyOutboundPool,
    getOutboundPoolSize,
    requestOutbound,
} from "../src/services/outboundRequest";

type Handler = Parameters<typeof createServer>[1];

let server: Server | undefined;
let hostCounter = 0;

async function startServer(handler: Handler): Promise<number> {
    server = createServer(handler);

    await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(0, "127.0.0.1", () => resolve());
    });

    return (server.address() as AddressInfo).port;
}

function freshUrl(port: number, path = "/"): string {
    hostCounter += 1;

    return `http://local-${hostCounter}.example:${port}${path}`;
}

function dnsToLoopback(): void {
    dnsLookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error("Expected the promise to reject, but it resolved");
}

describe("requestOutbound against a local HTTP server", () => {
    afterEach(async () => {
        vi.clearAllMocks();
        destroyOutboundPool();

        if (server) {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server!.close(() => resolve()));
            server = undefined;
        }
    });

    // B0: characterization (harness check).
    it("reaches the local server and returns the body", async () => {
        dnsToLoopback();
        const port = await startServer((_req, res) => {
            res.writeHead(200, { "content-type": "text/plain" });
            res.end("hello");
        });

        const response = await requestOutbound(freshUrl(port), "GET");

        expect(response.status).toBe(200);
        expect(response.data).toBe("hello");
    });

    // B1: fails first (no maxContentLength today).
    it("rejects a body larger than 1 MiB", async () => {
        dnsToLoopback();
        const port = await startServer((_req, res) => {
            res.writeHead(200, { "content-type": "application/octet-stream" });
            res.end(Buffer.alloc(2 * 1024 * 1024, 1));
        });

        const error = await caught(requestOutbound(freshUrl(port), "GET"));

        expect(axios.isAxiosError(error)).toBe(true);
        expect((error as { code?: string }).code).toBe("ERR_BAD_RESPONSE");
        expect((error as { response?: unknown }).response).toBeUndefined();
    });

    // B2: characterization.
    it("accepts a body just under 1 MiB", async () => {
        dnsToLoopback();
        const port = await startServer((_req, res) => {
            res.writeHead(200, { "content-type": "application/octet-stream" });
            res.end(Buffer.alloc(1024 * 1024 - 1024, 1));
        });

        const response = await requestOutbound(freshUrl(port), "GET");

        expect(response.status).toBe(200);
    });

    // B3: fails first (today the timeout is not a hard deadline, so this resolves).
    it("cuts off a slow-drip response at the hard deadline with ECONNABORTED", async () => {
        dnsToLoopback();
        const port = await startServer((_req, res) => {
            res.writeHead(200, { "content-type": "text/plain" });
            res.write("a");

            let sent = 0;
            const timer = setInterval(() => {
                sent += 1;

                if (sent >= 3) {
                    clearInterval(timer);
                    res.end("z");
                } else {
                    res.write("b");
                }
            }, 500);

            res.on("close", () => clearInterval(timer));
        });

        const start = Date.now();
        const error = await caught(
            (requestOutbound as (...args: unknown[]) => Promise<unknown>)(
                freshUrl(port),
                "GET",
                { timeoutMs: 500 }
            )
        );

        expect(Date.now() - start).toBeLessThan(1200);
        expect(axios.isAxiosError(error)).toBe(true);
        expect((error as { code?: string }).code).toBe("ECONNABORTED");
    });

    // B4: fails first (no DNS deadline today, so this succeeds after 1.5 s).
    it("stops waiting for a slow DNS lookup at the deadline with ECONNABORTED", async () => {
        let requestsSeen = 0;
        const port = await startServer((_req, res) => {
            requestsSeen += 1;
            res.writeHead(200);
            res.end("ok");
        });

        dnsLookupMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    setTimeout(
                        () => resolve([{ address: "127.0.0.1", family: 4 }]),
                        1500
                    );
                })
        );

        const start = Date.now();
        const error = await caught(
            (requestOutbound as (...args: unknown[]) => Promise<unknown>)(
                freshUrl(port),
                "GET",
                { timeoutMs: 500 }
            )
        );

        expect(Date.now() - start).toBeLessThan(1200);
        expect(axios.isAxiosError(error)).toBe(true);
        expect((error as { code?: string }).code).toBe("ECONNABORTED");

        await new Promise((resolve) => setTimeout(resolve, 1200));
        expect(requestsSeen).toBe(0);
    });

    // B5: post-fix only (today this waits for the 10 s axios timeout).
    it("rejects with ECONNABORTED when the server never responds", async () => {
        dnsToLoopback();
        const port = await startServer(() => {
            // Accept the request and never answer.
        });

        const error = await caught(
            (requestOutbound as (...args: unknown[]) => Promise<unknown>)(
                freshUrl(port),
                "GET",
                { timeoutMs: 500 }
            )
        );

        expect(axios.isAxiosError(error)).toBe(true);
        expect((error as { code?: string }).code).toBe("ECONNABORTED");
    });

    // B6: characterization.
    it("does not follow a redirect and rejects with the 302 response", async () => {
        dnsToLoopback();
        let targetHits = 0;
        const port = await startServer((req, res) => {
            if (req.url === "/target") {
                targetHits += 1;
                res.writeHead(200);
                res.end("target");
                return;
            }

            res.writeHead(302, { location: "/target" });
            res.end();
        });

        const error = await caught(requestOutbound(freshUrl(port), "GET"));

        expect(axios.isAxiosError(error)).toBe(true);
        expect((error as { response?: { status: number } }).response?.status).toBe(302);
        expect(targetHits).toBe(0);
    });

    // B7: characterization.
    it.each([404, 500])("rejects %i with the response status preserved", async (status) => {
        dnsToLoopback();
        const port = await startServer((_req, res) => {
            res.writeHead(status);
            res.end("nope");
        });

        const error = await caught(requestOutbound(freshUrl(port), "GET"));

        expect(axios.isAxiosError(error)).toBe(true);
        expect((error as { response?: { status: number } }).response?.status).toBe(status);
    });

    it.each([200, 204])("accepts %i as success", async (status) => {
        dnsToLoopback();
        const port = await startServer((_req, res) => {
            res.writeHead(status);
            res.end();
        });

        const response = await requestOutbound(freshUrl(port), "GET");

        expect(response.status).toBe(status);
    });

    // B8: post-fix only.
    it("retires the pooled agent after a deadline abort", async () => {
        dnsToLoopback();
        const port = await startServer(() => {
            // Never respond.
        });

        await caught(
            (requestOutbound as (...args: unknown[]) => Promise<unknown>)(
                freshUrl(port),
                "GET",
                { timeoutMs: 300 }
            )
        );

        expect(getOutboundPoolSize()).toBe(0);
    });
});