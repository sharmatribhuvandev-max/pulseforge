import axios from "axios";
import { API_URL } from "../config";

export interface Endpoint {
    _id: string;
    projectId: string;
    name?: string;
    url: string;
    method: string;
    createdAt: string;
    updatedAt: string;
}

export const getEndpoints = async (
    projectId: string
): Promise<Endpoint[]> => {
    const token = localStorage.getItem("token");

    const response = await axios.get(
        `${API_URL}/endpoints/project/${projectId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    return response.data.endpoints;
};


export const createEndpoint = async (
    projectId: string,
    name: string,
    url: string,
    method: string
): Promise<Endpoint> => {
    const token = localStorage.getItem("token");

    const response = await axios.post(
        `${API_URL}/endpoints`,
        { projectId, name, url, method },
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    return response.data.endpoint;
};


export const deleteEndpoint = async (
    endpointId: string
): Promise<void> => {
    const token = localStorage.getItem("token");

    await axios.delete(
        `${API_URL}/endpoints/${endpointId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );
};


export interface CheckEndpointResponse {
    message: string;
    result?: {
        requestId?: string | number;
        statusCode?: number;
        latency?: number;
        success?: boolean;
    };
}

export const checkEndpoint = async (
    endpointId: string
): Promise<CheckEndpointResponse> => {
    const token = localStorage.getItem("token");

    const response = await axios.get<CheckEndpointResponse>(
        `${API_URL}/api/${endpointId}/check`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    return response.data;
};

export const getCheckErrorMessage = (error: unknown): string => {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as
            | { message?: unknown; error?: unknown; chaos?: unknown }
            | undefined;

        if (data && typeof data.message === "string") {
            const code =
                typeof data.error === "string" ? ` (${data.error})` : "";
            const chaos = data.chaos === true ? " [chaos]" : "";

            return `HTTP ${status ?? "?"}: ${data.message}${code}${chaos}`;
        }

        return error.message;
    }

    return error instanceof Error ? error.message : "request failed.";
};