
import axios, { type AxiosResponse } from "axios";
import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import type { ClientRequestArgs } from "node:http";
import type { Duplex } from "node:stream";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

const REQUEST_TIMEOUT_MS = 10_000;
const DNS_CACHE_TTL_MS = 30_000;
const DNS_CACHE_MAX_ENTRIES = 100;

interface ValidatedAddress {
    address: string;
    family: 4 | 6;
}

interface DnsCacheEntry {
    addresses: ValidatedAddress[];
    expiresAt: number;
}

interface ConnectionTiming {
    tcpConnectedMs?: number;
    tlsSecureMs?: number;
}

const dnsCache = new Map<string, DnsCacheEntry>();

function isPublicAddress(address: string): boolean {
    if (isIP(address) === 0) {
        return false;
    }

    try {
        return ipaddr.process(address).range() === "unicast";
    } catch {
        return false;
    }
}

function normalizeHostname(hostname: string): string {
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
        return hostname.slice(1, -1);
    }

    return hostname;
}

export function validateOutboundUrl(value: string): URL {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(value);
    } catch {
        throw new Error("Invalid outbound URL");
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Only HTTP and HTTPS URLs are allowed");
    }

    if (parsedUrl.username || parsedUrl.password) {
        throw new Error("Credentials in outbound URLs are not allowed");
    }

    if (!parsedUrl.hostname) {
        throw new Error("Outbound URL must include a hostname");
    }

    return parsedUrl;
}

function getCachedAddresses(hostname: string): ValidatedAddress[] | undefined {
    const key = normalizeHostname(hostname).toLowerCase();
    const entry = dnsCache.get(key);

    if (!entry) {
        return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
        dnsCache.delete(key);
        return undefined;
    }

    // Refresh insertion order so frequently used entries stay in the cache.
    dnsCache.delete(key);
    dnsCache.set(key, entry);

    return entry.addresses.map((address) => ({ ...address }));
}

function cacheAddresses(
    hostname: string,
    addresses: ValidatedAddress[]
): void {
    const key = normalizeHostname(hostname).toLowerCase();

    // Replace any previous entry for this hostname.
    dnsCache.delete(key);

    // Evict the oldest entry when the cache is full.
    while (dnsCache.size >= DNS_CACHE_MAX_ENTRIES) {
        const oldestKey = dnsCache.keys().next().value;

        if (oldestKey === undefined) {
            break;
        }

        dnsCache.delete(oldestKey);
    }

    dnsCache.set(key, {
        addresses: addresses.map((address) => ({ ...address })),
        expiresAt: Date.now() + DNS_CACHE_TTL_MS,
    });
}

async function resolvePublicAddresses(
    hostname: string
): Promise<ValidatedAddress[]> {
    const normalizedHostname = normalizeHostname(hostname);
    const literalFamily = isIP(normalizedHostname);

    if (literalFamily !== 0) {
        const literalAddress: ValidatedAddress = {
            address: normalizedHostname,
            family: literalFamily as 4 | 6,
        };

        if (!isPublicAddress(literalAddress.address)) {
            throw new Error(
                "Outbound destination is not a public IP address"
            );
        }

        return [literalAddress];
    }

    const cached = getCachedAddresses(normalizedHostname);

    if (cached) {
        return cached;
    }

    const addresses: LookupAddress[] = await dnsLookup(normalizedHostname, {
        all: true,
        verbatim: true,
    });

    if (addresses.length === 0) {
        throw new Error("Outbound hostname did not resolve");
    }

    const validatedAddresses: ValidatedAddress[] = [];

    for (const result of addresses) {
        if (result.family !== 4 && result.family !== 6) {
            throw new Error("Unsupported outbound IP address family");
        }

        if (
            result.family === 6 &&
            ipaddr.parse(result.address).range() === "rfc6052"
        ) {
            continue;
        }

        if (!isPublicAddress(result.address)) {
            throw new Error(
                "Outbound destination is not a public IP address"
            );
        }

        validatedAddresses.push({
            address: result.address,
            family: result.family,
        });
    }

    if (validatedAddresses.length === 0) {
        throw new Error(
            "No validated public outbound destination available"
        );
    }

    const sortedAddresses = validatedAddresses.sort(
        (a, b) => a.family - b.family
    );

    cacheAddresses(normalizedHostname, sortedAddresses);

    return sortedAddresses;
}

function createPinnedLookup(
    address: ValidatedAddress
): NonNullable<import("node:http").AgentOptions["lookup"]> {
    return (
        _hostname: string,
        options: LookupOptions,
        callback: (
            error: NodeJS.ErrnoException | null,
            address: string | LookupAddress[],
            family?: number
        ) => void
    ) => {
        if (options.all) {
            callback(null, [{
                address: address.address,
                family: address.family,
            }]);
            return;
        }

        callback(null, address.address, address.family);
    };
}

function elapsedMs(start: number): number {
    return Number((performance.now() - start).toFixed(1));
}

/* ------------------------------------------------------------------ */
/* Bounded keep-alive agent pool                                       */
/* ------------------------------------------------------------------ */

const POOL_MAX_AGENTS = 50;
const POOL_MAX_SOCKETS_PER_AGENT = 4;
const POOL_MAX_FREE_SOCKETS_PER_AGENT = 2;
const POOL_AGENT_IDLE_TTL_MS = 60_000;
const POOL_SWEEP_INTERVAL_MS = 15_000;
const POOL_KEEP_ALIVE_MSECS = 1_000;
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

interface PooledAgent {
    agent: HttpAgent | HttpsAgent;
    lastUsedAt: number;
    activeRequests: number;
    lastConnectionTiming: ConnectionTiming;
}

interface AgentLease {
    key: string;
    entry: PooledAgent;
    pooled: boolean;
}

// Map insertion order doubles as LRU order (entries are re-inserted on use).
const agentPool = new Map<string, PooledAgent>();
let sweepTimer: NodeJS.Timeout | undefined;

// One agent per protocol + hostname + port + validated IP. The agent's lookup
// only ever returns that IP, so a pooled socket can never reach another
// destination.
function buildPoolKey(url: URL, address: ValidatedAddress): string {
    const port = url.port || (url.protocol === "https:" ? "443" : "80");

    return [
        url.protocol,
        normalizeHostname(url.hostname).toLowerCase(),
        port,
        address.address,
    ].join("|");
}

function createPooledAgent(
    url: URL,
    address: ValidatedAddress
): PooledAgent {
    const lastConnectionTiming: ConnectionTiming = {};

    const options: import("node:http").AgentOptions = {
        keepAlive: true,
        keepAliveMsecs: POOL_KEEP_ALIVE_MSECS,
        maxSockets: POOL_MAX_SOCKETS_PER_AGENT,
        maxFreeSockets: POOL_MAX_FREE_SOCKETS_PER_AGENT,
        scheduling: "lifo",
        lookup: createPinnedLookup(address),
    };

    if (url.protocol === "https:") {
        // Default TLS behaviour is kept: certificate and hostname verification.
        const agent = new HttpsAgent(options);
        const originalCreateConnection = agent.createConnection.bind(agent);

        agent.createConnection = (
            connectionOptions: import("node:https").RequestOptions,
            callback?: (err: Error | null, stream: Duplex) => void
        ) => {
            const socketStart = performance.now();
            const socket = originalCreateConnection(
                connectionOptions,
                callback
            );

            if (socket) {
                socket.once("connect", () => {
                    lastConnectionTiming.tcpConnectedMs =
                        elapsedMs(socketStart);
                });
                socket.once("secureConnect", () => {
                    lastConnectionTiming.tlsSecureMs =
                        elapsedMs(socketStart);
                });
            }

            return socket;
        };

        return {
            agent,
            lastUsedAt: Date.now(),
            activeRequests: 0,
            lastConnectionTiming,
        };
    }

    const agent = new HttpAgent(options);
    const originalCreateConnection = agent.createConnection.bind(agent);

    agent.createConnection = (
        connectionOptions: ClientRequestArgs,
        callback?: (err: Error | null, stream: Duplex) => void
    ) => {
        const socketStart = performance.now();
        const socket = originalCreateConnection(connectionOptions, callback);

        if (socket) {
            socket.once("connect", () => {
                lastConnectionTiming.tcpConnectedMs = elapsedMs(socketStart);
            });
        }

        return socket;
    };

    return {
        agent,
        lastUsedAt: Date.now(),
        activeRequests: 0,
        lastConnectionTiming,
    };
}

function evictAgent(key: string, entry?: PooledAgent): void {
    const current = agentPool.get(key);

    if (!current || (entry && current !== entry)) {
        return;
    }
    agentPool.delete(key);
    current.agent.destroy();
}

const retiredAgents = new WeakSet<PooledAgent>();

// Remove an agent from the pool immediately so no new request can use it.
// It is destroyed only when its last in-flight request finishes.
function retireAgent(key: string, entry: PooledAgent): void {
    if (agentPool.get(key) === entry) {
        agentPool.delete(key);
    }

    retiredAgents.add(entry);
}

function sweepIdleAgents(now: number = Date.now()): void {
    for (const [key, entry] of agentPool) {
        if (
            entry.activeRequests === 0 &&
            now - entry.lastUsedAt >= POOL_AGENT_IDLE_TTL_MS
        ) {
            evictAgent(key, entry);
        }
    }
}

function ensureSweepTimer(): void {
    if (sweepTimer) {
        return;
    }

    sweepTimer = setInterval(() => sweepIdleAgents(), POOL_SWEEP_INTERVAL_MS);
    // Never keep the process alive just for pool cleanup.
    sweepTimer.unref();
}

function acquireAgent(url: URL, address: ValidatedAddress): AgentLease {
    ensureSweepTimer();

    const key = buildPoolKey(url, address);
    const existing = agentPool.get(key);

    if (existing) {
        agentPool.delete(key);
        agentPool.set(key, existing);
        existing.activeRequests += 1;
        existing.lastUsedAt = Date.now();

        return { key, entry: existing, pooled: true };
    }

    if (agentPool.size >= POOL_MAX_AGENTS) {
        // Evict the least recently used agent that has no requests in flight.
        for (const [candidateKey, candidate] of agentPool) {
            if (candidate.activeRequests === 0) {
                evictAgent(candidateKey, candidate);
                break;
            }
        }
    }

    const entry = createPooledAgent(url, address);
    entry.activeRequests = 1;

    if (agentPool.size >= POOL_MAX_AGENTS) {
        // Pool is full of busy agents: use a one-off agent, never exceed the cap.
        return { key, entry, pooled: false };
    }

    agentPool.set(key, entry);

    return { key, entry, pooled: true };
}

function releaseAgent(lease: AgentLease): void {
    const { entry } = lease;

    entry.activeRequests = Math.max(0, entry.activeRequests - 1);
    entry.lastUsedAt = Date.now();

    if (
        entry.activeRequests === 0 &&
        (!lease.pooled || retiredAgents.has(entry))
    ) {
        entry.agent.destroy();
    }
}

function hasHttpResponse(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { response?: unknown }).response !== undefined
    );
}

function isStaleSocketError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return false;
    }

    const candidate = error as {
        code?: unknown;
        request?: { reusedSocket?: boolean };
    };

    return (
        candidate.request?.reusedSocket === true &&
        (candidate.code === "ECONNRESET" || candidate.code === "EPIPE")
    );
}

export function getOutboundPoolSize(): number {
    return agentPool.size;
}

// For graceful shutdown and tests.
export function destroyOutboundPool(): void {
    if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = undefined;
    }

    for (const [key, entry] of agentPool) {
        agentPool.delete(key);
        entry.agent.destroy();
    }
}

export async function requestOutbound(
    value: string,
    method: string
): Promise<AxiosResponse> {
    const totalStart = performance.now();
    const parsedUrl = validateOutboundUrl(value);

    const dnsStart = performance.now();
    const addresses = await resolvePublicAddresses(parsedUrl.hostname);
    const dnsDurationMs = elapsedMs(dnsStart);

    const pinnedAddress = addresses[0];

    if (!pinnedAddress) {
        throw new Error("No validated outbound destination available");
    }

    let retried = false;

    for (; ;) {
        const lease = acquireAgent(parsedUrl, pinnedAddress);
        const requestStart = performance.now();

        try {
            const response = await axios({
                method,
                url: parsedUrl.toString(),
                timeout: REQUEST_TIMEOUT_MS,
                maxRedirects: 0,
                proxy: false,
                httpAgent:
                    parsedUrl.protocol === "http:"
                        ? lease.entry.agent
                        : undefined,
                httpsAgent:
                    parsedUrl.protocol === "https:"
                        ? lease.entry.agent
                        : undefined,
            });

            const reusedSocket =
                (response.request as { reusedSocket?: boolean } | undefined)
                    ?.reusedSocket === true;

            console.info("[Outbound timing]", {
                hostname: parsedUrl.hostname,
                dnsDurationMs,
                reusedSocket,
                tcpConnectedMs: reusedSocket
                    ? undefined
                    : lease.entry.lastConnectionTiming.tcpConnectedMs,
                tlsSecureMs: reusedSocket
                    ? undefined
                    : lease.entry.lastConnectionTiming.tlsSecureMs,
                axiosDurationMs: elapsedMs(requestStart),
                totalDurationMs: elapsedMs(totalStart),
            });

            return response;
        } catch (error) {
            // Connection-level failures (timeout, reset, TLS or network error)
            // have no HTTP response. Retire the agent so the next request gets
            // a clean one. HTTP error responses (404, 500) keep the agent.
            if (!hasHttpResponse(error)) {
                retireAgent(lease.key, lease.entry);
            }

            // A pooled socket the server closed while idle can fail on reuse.
            // Retry once, idempotent methods only, on a fresh agent.
            if (
                !retried &&
                isStaleSocketError(error) &&
                IDEMPOTENT_METHODS.has(method.toUpperCase())
            ) {
                retried = true;

                console.warn("[Outbound stale pooled socket, retrying once]", {
                    hostname: parsedUrl.hostname,
                });

                continue;
            }

            console.warn("[Outbound timing failure]", {
                hostname: parsedUrl.hostname,
                dnsDurationMs,
                axiosDurationMs: elapsedMs(requestStart),
                totalDurationMs: elapsedMs(totalStart),
            });

            throw error;
        } finally {
            releaseAgent(lease);
        }
    }
}