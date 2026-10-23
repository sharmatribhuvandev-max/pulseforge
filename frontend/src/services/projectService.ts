import axios from "axios";
import { API_URL } from "../config";

export interface Project {
    _id: string;
    name: string;
    description?: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectAnalytics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRate: number;
    averageLatency: number;
    maxLatency: number;
    p95Latency: number;
}

export interface EndpointAnalytics {
    endpoint: string;
    method: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRate: number;
    averageLatency: number;
    maxLatency: number;
    p95Latency: number;
}

export interface LatencyPoint {
    timestamp: string;
    latency: number;
    statusCode: number;
    error: boolean;
}

export interface RecentApiEvent {
    requestId: string;
    type: "api_request" | "chaos_event";
    projectId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    latency: number;
    success: boolean;
    chaos: boolean;
    timestamp: string;
}

export const getProjects = async (): Promise<Project[]> => {
    const token = localStorage.getItem("token");

    const response = await axios.get(
        `${API_URL}/projects`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    return response.data.projects;
};

export const createProject = async (
    name: string,
    description: string
): Promise<Project> => {
    const token = localStorage.getItem("token");

    const response = await axios.post(
        `${API_URL}/projects`,
        { name, description },
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    return response.data.project;
};

export const getProjectAnalytics = async (
    projectId: string,
    filters?: {
        minutes?: number;
        endpoint?: string;
        method?: string;
        status?: string;
    }
): Promise<ProjectAnalytics> => {
    const token = localStorage.getItem("token");

    const response = await axios.get(
        `${API_URL}/analytics/project/${projectId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            params: filters,
        }
    );

    return response.data.analytics;
};

export const getEndpointAnalytics = async (
    projectId: string,
    filters?: {
        minutes?: number;
        endpoint?: string;
        method?: string;
        status?: string;
    }
): Promise<EndpointAnalytics[]> => {
    const token = localStorage.getItem("token");

    const response = await axios.get(
        `${API_URL}/analytics/project/${projectId}/endpoints`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            params: filters,
        }
    );

    return response.data.endpoints;
};

export const getLatencyHistory = async (
    projectId: string,
    filters?: {
        minutes?: number;
        endpoint?: string;
        method?: string;
        status?: string;
    }
): Promise<LatencyPoint[]> => {
    const token = localStorage.getItem("token");

    const response = await axios.get(
        `${API_URL}/analytics/project/${projectId}/latency`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            params: filters,
        }
    );

    return response.data.history;
};

export interface ProjectIncidents {
    active: Incident[];
    resolved: Incident[];
}

export interface Incident {
    id: string;
    project_id: string;
    type: string;
    threshold: number | string;
    actual_value: number | string;
    started_at: string;
    resolved_at: string | null;
}

export const getProjectIncidents = async (
    projectId: string
): Promise<ProjectIncidents> => {
    const token = localStorage.getItem("token");

    const response = await axios.get(
        `${API_URL}/incidents/project/${projectId}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    return response.data;
};

export const getRecentApiEvents = async (
    projectId: string
): Promise<RecentApiEvent[]> => {
    const token = localStorage.getItem("token");

    const response = await axios.get(
        `${API_URL}/analytics/project/${projectId}/recent-events`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    return response.data.events;
};
