import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { rooms } from "./rooms";
import { RoomHandler } from "./util/room";
import { generateRandomRoomCode } from "./util/code";

export default async function handleWsConnection(ws: WebSocket, req: IncomingMessage) {
    if (req.url?.startsWith("/mcws")) {
        handleMinecraftWsConnection(ws, req);
    } else if (req.url?.startsWith("/frontendws")) {
        handleFrontEndWsConnection(ws, req);
    } else {
        ws.close();
    }
}

function handleMinecraftWsConnection(ws: WebSocket, req: IncomingMessage) {
    let roomId = getRoomCode(req);
    if (!roomId) {
        ws.close();
        return;
    }
    if (!rooms.has(roomId)) {
        ws.close();
        return;
    }
    try {
        const roomHandler = rooms.get(roomId);
        if (!roomHandler) {
            ws.close();
            return;
        }
        roomHandler.init(ws);
    } catch (e) {
        ws.close();
    }
}

function handleFrontEndWsConnection(ws: WebSocket, req: IncomingMessage) {
    let code = "";
    do {
        code = generateRandomRoomCode();
    } while (rooms.has(code));
    ws.send(JSON.stringify({ code }));

    const roomHandler = new RoomHandler(ws, code);
    rooms.set(code, roomHandler);
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