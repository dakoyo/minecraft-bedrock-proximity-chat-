import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { createServer, IncomingMessage } from "http";
import handleWsConnection from "./ws";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const app = express();
app.use(cors());

const server = createServer(app);
const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false // Minecraft Bedrock often has issues with this
});

wss.on("connection", handleWsConnection);

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.get("/turn-credentials", async (req, res) => {
    const apiKey = process.env.MATERD_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "API key not configured" });
    }
    try {
        const response = await fetch(`https://dakoyo.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`);
        const iceServers = await response.json();
        res.json(iceServers);
    } catch (error) {
        console.error("Failed to fetch TURN credentials:", error);
        res.status(500).json({ error: "Failed to fetch TURN credentials" });
    }
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