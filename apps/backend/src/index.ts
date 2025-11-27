import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { createServer, IncomingMessage } from "http";
import handleWsConnection from "./ws";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false // Minecraft Bedrock often has issues with this
});

wss.on("connection", handleWsConnection);

app.get("/", (req, res) => {
    res.send("Hello World!");
});

server.listen(3000, () => {
    console.log("Server started on port 3000");
});

server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/mcws")) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
        });
    } else if (url.pathname.startsWith("/frontendws")) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
        });
    } else {
        console.log("Invalid WebSocket path, destroying socket.");
        socket.destroy();
    }
});