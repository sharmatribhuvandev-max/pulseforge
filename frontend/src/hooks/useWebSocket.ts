import { useEffect, useState } from "react";
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

export const useWebSocket = () => {
    const [events, setEvents] = useState<WebSocketEvent[]>([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let stopped = false;

        const connect = () => {
            if (stopped) return;

            console.log("Connecting to WebSocket...");

            socket = new WebSocket(API_URL.replace(/^http/, "ws"));

            socket.onopen = () => {
                console.log("WebSocket connected");
                setConnected(true);
            };

            socket.onmessage = (message) => {
                try {
                    const data: WebSocketEvent = JSON.parse(message.data);

                    console.log("WebSocket event received:", data);

                    const isSupportedEvent = [
                        "api_request",
                        "chaos_event",
                        "incident_created",
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
                } catch (error) {
                    console.error("WebSocket message error:", error);
                }
            };

            socket.onclose = () => {
                console.log("WebSocket disconnected");
                setConnected(false);

                if (!stopped) {
                    reconnectTimer = setTimeout(connect, 3000);
                }
            };

            socket.onerror = (error) => {
                console.error("WebSocket error:", error);
                setConnected(false);
            };
        };

        connect();

        return () => {
            stopped = true;

            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
            }

            if (socket) {
                socket.close();
            }
        };
    }, []);

    return {
        events,
        connected,
    };
};