import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

let wss: WebSocketServer;

export function initWebSocket(server: Server) {
    wss = new WebSocketServer({
        server
    });

    wss.on("connection", (socket: WebSocket) => {
        console.log("WebSocket client connected");

        socket.send(
            JSON.stringify({
                type: "connection",
                message: "Connected to PulseForge WebSocket"
            })
        );

        socket.on("close", () => {
            console.log("WebSocket client disconnected");
        });
    });

    console.log("WebSocket server initialized");
}

export function broadcast(data: any) {
    if (!wss) {
        return;
    }

    const message = JSON.stringify(data);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}