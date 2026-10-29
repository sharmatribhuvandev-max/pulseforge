import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { Agent } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

describe("Node HTTP agent pinned lookup", () => {
    let server: ReturnType<typeof createServer> | undefined;

    afterEach(async () => {
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server!.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
            server = undefined;
        }
    });

    it("uses the configured lookup callback for a real local connection", async () => {
        let requestHost = "";
        let lookupCalled = false;

        server = createServer((request, response) => {
            requestHost = request.headers.host ?? "";
            response.writeHead(200, { "content-type": "text/plain" });
            response.end("ok");
        });

        await new Promise<void>((resolve, reject) => {
            server!.once("error", reject);
            server!.listen(0, "127.0.0.1", () => resolve());
        });

        const addressInfo = server.address();

        if (!addressInfo || typeof addressInfo === "string") {
            throw new Error("Local test server did not bind to a TCP port");
        }

        const agent = new Agent({
            keepAlive: false,
            lookup: (_hostname, options, callback) => {
                lookupCalled = true;

                if (options.all) {
                    callback(null, [{
                        address: "127.0.0.1",
                        family: 4,
                    }]);
                } else {
                    callback(null, "127.0.0.1", 4);
                }
            },
        });

        try {
            const { request } = await import("node:http");

            const statusCode = await new Promise<number>((resolve, reject) => {
                const req = request(
                    {
                        hostname: "pinned-test.invalid",
                        port: addressInfo.port,
                        path: "/",
                        method: "GET",
                        agent,
                    },
                    (res) => {
                        res.resume();
                        res.once("end", () => resolve(res.statusCode ?? 0));
                    }
                );

                req.once("error", reject);
                req.end();
            });

            expect(statusCode).toBe(200);
            expect(lookupCalled).toBe(true);
            expect(requestHost).toBe(`pinned-test.invalid:${addressInfo.port}`);
        } finally {
            agent.destroy();
        }
    });

    it("reuses a keep-alive socket for repeated requests to the same pinned destination", async () => {
        let connectionCount = 0;
        let lookupCount = 0;

        server = createServer((_request, response) => {
            response.writeHead(200, {
                "content-type": "text/plain",
                "connection": "keep-alive",
            });
            response.end("ok");
        });

        server.on("connection", () => {
            connectionCount += 1;
        });

        await new Promise<void>((resolve, reject) => {
            server!.once("error", reject);
            server!.listen(0, "127.0.0.1", () => resolve());
        });

        const addressInfo = server.address();

        if (!addressInfo || typeof addressInfo === "string") {
            throw new Error("Local test server did not bind to a TCP port");
        }

        const agent = new Agent({
            keepAlive: true,
            maxSockets: 1,
            lookup: (_hostname, options, callback) => {
                lookupCount += 1;

                if (options.all) {
                    callback(null, [{
                        address: "127.0.0.1",
                        family: 4,
                    }]);
                } else {
                    callback(null, "127.0.0.1", 4);
                }
            },
        });

        const makeRequest = async (): Promise<number> => {
            const { request } = await import("node:http");

            return new Promise<number>((resolve, reject) => {
                const req = request(
                    {
                        hostname: "pinned-reuse-test.invalid",
                        port: addressInfo.port,
                        path: "/",
                        method: "GET",
                        agent,
                    },
                    (res) => {
                        res.resume();
                        res.once("end", () => resolve(res.statusCode ?? 0));
                    }
                );

                req.once("error", reject);
                req.end();
            });
        };

        try {
            expect(await makeRequest()).toBe(200);
            expect(await makeRequest()).toBe(200);

            expect(connectionCount).toBe(1);
            expect(lookupCount).toBe(1);
        } finally {
            agent.destroy();
        }
    });
});