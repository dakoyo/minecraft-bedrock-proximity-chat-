import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { rooms } from "./rooms";
import { RoomHandler, closeMinecraftWebSocket } from "./util/room";
import { generateRandomRoomCode } from "./util/code";

export default async function handleWsConnection(ws: WebSocket, req: IncomingMessage) {
    ws.on("error", (e) => {
        console.error("WebSocket error:", e);
    });

    if (req.url?.startsWith("/mcws")) {
        await handleMinecraftWsConnection(ws, req);
    } else if (req.url?.startsWith("/frontendws")) {
        handleFrontEndWsConnection(ws, req);
    } else {
        ws.close();
    }
}

async function handleMinecraftWsConnection(ws: WebSocket, req: IncomingMessage) {
    let roomId = getRoomCode(req);
    if (!roomId) {
        await closeMinecraftWebSocket(ws);
        return;
    }
    if (!rooms.has(roomId)) {
        await closeMinecraftWebSocket(ws);
        return;
    }
    try {
        const roomHandler = rooms.get(roomId);
        if (!roomHandler) {
            await closeMinecraftWebSocket(ws);
            return;
        }
        roomHandler.init(ws);
    } catch (e) {
        await closeMinecraftWebSocket(ws);
    }
}

function handleFrontEndWsConnection(ws: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url || "", "http://localhost");
    const roomId = url.searchParams.get("roomId");
    const playerCode = url.searchParams.get("playerCode");

    console.log(`[WS] Connection attempt. URL: ${req.url}, roomId: ${roomId}, playerCode: ${playerCode}`);

    if (roomId && playerCode) {
        const roomHandler = rooms.get(roomId);
        if (!roomHandler) {
            console.log(`[WS] Room not found: ${roomId}`);
            ws.close(1008, "Room not found");
            return;
        }
        console.log(`[WS] Handling peer join for room: ${roomId}, player: ${playerCode}`);
        roomHandler.handlePeerJoin(ws, playerCode);
        return;
    }

    let code = "";
    do {
        code = generateRandomRoomCode();
    } while (rooms.has(code));
    ws.send(JSON.stringify({ code }));

    const roomHandler = new RoomHandler(ws, code);
    rooms.set(code, roomHandler);

    ws.on("close", () => {
        roomHandler.destroy();
        rooms.delete(code);
        console.log(`Room ${code} destroyed due to frontend disconnect.`);
    });
}


function getRoomCode(req: IncomingMessage) {
    let roomId = req.url?.split("?")[1]?.split("=")[1];
    if (!roomId) {
        roomId = req.url?.split("/")[2];
    }
    if (!roomId) {
        return null;
    }
    return roomId;
}