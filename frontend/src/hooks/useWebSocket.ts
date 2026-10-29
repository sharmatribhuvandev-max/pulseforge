import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../config";

export interface Incident {
    id: number | string;
    project_id: string;
    type: string;
    threshold: number | string;
    actual_value: number | string;
    started_at: string;
    resolved_at: string | null;
}

export interface WebSocketEvent {
    eventId?: string;
    requestId?: string;
    type: string;

    projectId?: string;
    endpointId?: string;
    endpoint?: string;
    method?: string;

    statusCode?: number;
    latency?: number;
    success?: boolean;
    chaos?: boolean;
    timestamp?: string;

    incident?: Incident;
}

const MAX_EVENTS = 100;
const RECONNECT_DELAY_MS = 3000;

interface WebSocketTicketResponse {
    ticket: string;
    expiresIn: number;
}

export const useWebSocket = () => {
    const [events, setEvents] = useState<WebSocketEvent[]>([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let stopped = false;
        let connecting = false;

        const scheduleReconnect = () => {
            if (stopped || reconnectTimer) return;

            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                void connect();
            }, RECONNECT_DELAY_MS);
        };

        const connect = async () => {
            if (stopped || connecting) return;

            connecting = true;

            try {
                const token = localStorage.getItem("token");

                if (!token) {
                    setConnected(false);
                    return;
                }

                const response = await axios.post<WebSocketTicketResponse>(
                    `${API_URL}/auth/ws-ticket`,
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                if (stopped) return;

                const ticket = response.data.ticket;

                if (!ticket || !/^[a-f0-9]{64}$/.test(ticket)) {
                    throw new Error("Invalid WebSocket ticket response");
                }

                const socketUrl = new URL(
                    API_URL.replace(/^http/, "ws")
                );
                socketUrl.searchParams.set("ticket", ticket);

                socket = new WebSocket(socketUrl.toString());

                const currentSocket = socket;

                currentSocket.onopen = () => {
                    if (stopped || socket !== currentSocket) return;

                    setConnected(true);
                };

                currentSocket.onmessage = (message) => {
                    if (stopped || socket !== currentSocket) return;

                    try {
                        const data: WebSocketEvent = JSON.parse(message.data);

                        const isSupportedEvent = [
                            "api_request",
                            "chaos_event",
                            "incident_created",
                            "incident_updated",
                            "incident_resolved",
                        ].includes(data.type);

                        if (!isSupportedEvent) return;

                        const event: WebSocketEvent = {
                            ...data,
                            eventId:
                                data.eventId ??
                                `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                            timestamp: data.timestamp ?? new Date().toISOString(),
                        };

                        setEvents((previousEvents) =>
                            [event, ...previousEvents].slice(0, MAX_EVENTS)
                        );
                    } catch {
                        // Ignore malformed WebSocket messages.
                    }
                };

                currentSocket.onclose = () => {
                    if (socket !== currentSocket) return;

                    setConnected(false);
                    scheduleReconnect();
                };

                currentSocket.onerror = () => {
                    if (socket === currentSocket) {
                        setConnected(false);
                    }
                };
            } catch {
                setConnected(false);
                scheduleReconnect();
            } finally {
                connecting = false;
            }
        };

        void connect();

        return () => {
            stopped = true;

            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            if (socket) {
                socket.onopen = null;
                socket.onmessage = null;
                socket.onerror = null;
                socket.onclose = null;
                socket.close();
                socket = null;
            }
        };
    }, []);

    return {
        events,
        connected,
    };
};
