
import axios from "axios";
import { API_URL } from "../config";

interface AuthResponse {
    message: string;
    token: string;
    user?: {
        id: string;
        name: string;
        email: string;
    };
}

const saveAuthData = (data: AuthResponse) => {
    localStorage.setItem("token", data.token);

    if (data.user?.name) {
        localStorage.setItem("userName", data.user.name);
    }

    if (data.user?.email) {
        localStorage.setItem("userEmail", data.user.email);
    }
};

export const login = async (
    email: string,
    password: string
): Promise<AuthResponse> => {
    const response = await axios.post<AuthResponse>(
        `${API_URL}/auth/signin`,
        { email, password }
    );

    saveAuthData(response.data);
    return response.data;
};

export const signup = async (
    name: string,
    email: string,
    password: string
): Promise<AuthResponse> => {
    const response = await axios.post<AuthResponse>(
        `${API_URL}/auth/signup`,
        { name, email, password }
    );

    saveAuthData(response.data);
    return response.data;
};
