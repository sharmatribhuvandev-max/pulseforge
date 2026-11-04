import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";

import { getCheckErrorMessage } from "./endpointService";

function httpError(status: number, data: unknown): AxiosError {
    return new AxiosError(
        `Request failed with status code ${status}`,
        "ERR_BAD_RESPONSE",
        undefined,
        undefined,
        {
            status,
            statusText: "",
            headers: {},
            config: { headers: new AxiosHeaders() },
            data,
        } as AxiosResponse,
    );
}

describe("getCheckErrorMessage", () => {
    it("shows the status and message from the response body", () => {
        const error = httpError(500, { message: "Upstream timed out" });

        expect(getCheckErrorMessage(error))
            .toBe("HTTP 500: Upstream timed out");
    });

    it("adds the error code and a chaos marker when present", () => {
        const error = httpError(503, {
            message: "Injected failure",
            error: "CHAOS_ERROR",
            chaos: true,
        });

        expect(getCheckErrorMessage(error))
            .toBe("HTTP 503: Injected failure (CHAOS_ERROR) [chaos]");
    });

    it("falls back to the axios message when the body has no message", () => {
        const error = httpError(500, "<html>Internal Server Error</html>");

        expect(getCheckErrorMessage(error))
            .toBe("Request failed with status code 500");
    });

    it("uses the message of a non-axios error", () => {
        expect(getCheckErrorMessage(new Error("Network down")))
            .toBe("Network down");
    });

    it("returns a generic message for a non-error value", () => {
        expect(getCheckErrorMessage("boom")).toBe("request failed.");
    });
});
