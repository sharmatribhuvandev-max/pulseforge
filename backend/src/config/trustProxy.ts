import type { Express } from "express";

// Render and similar hosts put reverse proxies in front of the app, so the
// socket address is the proxy, not the client. Express only trusts as many
// proxies as it is told to.
//
// 0 hops maps to `false` (Express's default), not `true`: `true` trusts every
// X-Forwarded-For entry, which lets anyone choose their own rate-limit bucket,
// and express-rate-limit reports it as ERR_ERL_PERMISSIVE_TRUST_PROXY.
export function applyTrustProxy(app: Express, hops: number): void {
    app.set("trust proxy", hops === 0 ? false : hops);
}