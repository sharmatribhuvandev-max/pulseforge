
import axios from "axios";
import { API_URL } from "../config";

export interface ChaosRule {
    _id: string;
    endpointId: string;
    enabled: boolean;
    latency: number;
    errorRate: number;
    statusCode: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface ChaosRulePayload {
    endpointId?: string;
    enabled?: boolean;
    latency?: number;
    errorRate?: number;
    statusCode?: number;
}

const getAuthHeaders = () => {
    const token = localStorage.getItem("token");

    if (!token) {
        throw new Error("You are not signed in. Please sign in again.");
    }

    return {
        Authorization: `Bearer ${token}`,
    };
};

export const getChaosRules = async (
    endpointId: string
): Promise<ChaosRule[]> => {
    const response = await axios.get(
        `${API_URL}/chaos/endpoint/${endpointId}`,
        { headers: getAuthHeaders() }
    );

    return response.data.chaosRules;
};

export const createChaosRule = async (
    payload: Required<ChaosRulePayload>
): Promise<ChaosRule> => {
    const response = await axios.post(
        `${API_URL}/chaos`,
        payload,
        { headers: getAuthHeaders() }
    );

    return response.data.chaosRule;
};

export const updateChaosRule = async (
    ruleId: string,
    payload: ChaosRulePayload
): Promise<ChaosRule> => {
    const response = await axios.patch(
        `${API_URL}/chaos/${ruleId}`,
        payload,
        { headers: getAuthHeaders() }
    );

    return response.data.chaosRule;
};
