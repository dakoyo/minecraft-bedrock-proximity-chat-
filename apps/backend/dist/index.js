"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const url_1 = __importDefault(require("url"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const ownerWss = new ws_1.WebSocketServer({ noServer: true });
const vcWss = new ws_1.WebSocketServer({ noServer: true });
const PORT = 8080;
const POLLING_INTERVAL_MS = 100;
const rooms = new Map();
// --- WebSocket Server for Minecraft Owner ---
ownerWss.on('connection', (ws, req) => {
    const { query } = url_1.default.parse(req.url || '', true);
    const roomId = query.roomId;
    // Room ID Validation
    const roomIdRegex = /^[a-zA-Z0-9]{4,16}$/;
    if (!roomId || !roomIdRegex.test(roomId)) {
        console.log(`Owner connection rejected: Invalid roomId '${roomId}'.`);
        ws.close(1008, 'Invalid Room ID. Must be 4-16 alphanumeric characters.');
        return;
    }
    console.log(`🔌 Minecraft Owner client connected for room: ${roomId}`);
    let room = rooms.get(roomId);
    if (!room) {
        room = { owner: ws, vcClients: new Set(), lastKnownSeq: -1 };
        rooms.set(roomId, room);
        console.log(`🚪 Room created: ${roomId}`);
    }
    else {
        room.owner = ws; // Allow owner to reconnect
        console.log(`Owner reconnected to room: ${roomId}`);
    }
    let isPolling = true;
    const subscribe = (eventName) => {
        const subscribePacket = {
            header: {
                version: 1,
                requestId: (0, crypto_1.randomUUID)(),
                messagePurpose: 'subscribe',
                messageType: 'commandRequest',
            },
            body: { eventName },
        };
        ws.send(JSON.stringify(subscribePacket));
        console.log(`Sent subscribe packet for ${eventName}.`);
    };
    subscribe('CommandResponse');
    const sendCommand = (command) => {
        const requestId = (0, crypto_1.randomUUID)();
        const packet = {
            header: {
                version: 1,
                requestId: requestId,
                messagePurpose: 'commandRequest',
            },
            body: {
                version: 1,
                commandLine: command,
                origin: { type: 'player' }
            },
        };
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(packet));
        }
        return requestId;
    };
    const startPolling = () => __awaiter(void 0, void 0, void 0, function* () {
        while (isPolling && ws.readyState === ws_1.WebSocket.OPEN) {
            // Use the room-specific lastKnownSeq
            const currentRoom = rooms.get(roomId);
            if (!currentRoom) {
                isPolling = false;
                return;
            }
            ;
            yield new Promise((resolve) => {
                const requestId = sendCommand(`/vc:sync ${currentRoom.lastKnownSeq}`);
                const listener = (data) => {
                    var _a;
                    try {
                        const msg = JSON.parse(data.toString());
                        if (((_a = msg.header) === null || _a === void 0 ? void 0 : _a.messagePurpose) === 'commandResponse' && msg.header.requestId === requestId) {
                            if (msg.body.statusCode === 0) {
                                processSyncData(roomId, msg.body.statusMessage);
                            }
                            ws.off('message', listener);
                            resolve();
                        }
                    }
                    catch (e) { }
                };
                ws.on('message', listener);
                setTimeout(() => {
                    ws.off('message', listener);
                    resolve();
                }, 500);
            });
            yield new Promise(r => setTimeout(r, POLLING_INTERVAL_MS));
        }
    });
    const processSyncData = (currentRoomId, jsonString) => {
        const room = rooms.get(currentRoomId);
        if (!room)
            return;
        try {
            const data = JSON.parse(jsonString);
            if (data.events && data.events.length > 0) {
                room.lastKnownSeq = data.last_sequence;
                console.log(`[${currentRoomId}] Received ${data.events.length} events. New Seq: ${room.lastKnownSeq}.`);
                const message = JSON.stringify({ type: 'mc_update', payload: data.events });
                room.vcClients.forEach(client => {
                    if (client.readyState === ws_1.WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            }
        }
        catch (e) {
            console.error(`[${currentRoomId}] Failed to parse vc:sync response:`, e);
        }
    };
    startPolling();
    ws.on('close', () => {
        console.log(`Minecraft Owner client for room ${roomId} disconnected.`);
        // When owner disconnects, we can assume the game has ended.
        // We close all VC clients and remove the room.
        const room = rooms.get(roomId);
        if (room) {
            room.vcClients.forEach(client => {
                client.close(1012, 'The host has disconnected.');
            });
            rooms.delete(roomId);
            console.log(`🚪 Room closed: ${roomId}`);
        }
        isPolling = false;
    });
    ws.on('error', (error) => {
        console.error(`Owner WebSocket error for room ${roomId}:`, error);
        isPolling = false;
    });
});
// --- WebSocket Server for VC Clients ---
vcWss.on('connection', (ws, req) => {
    const { query } = url_1.default.parse(req.url || '', true);
    const roomId = query.roomId;
    // Room ID Validation
    const roomIdRegex = /^[a-zA-Z0-9]{4,16}$/;
    if (!roomId || !roomIdRegex.test(roomId)) {
        console.log(`VC client connection rejected: Invalid roomId '${roomId}'.`);
        ws.close(1008, 'Invalid Room ID. Must be 4-16 alphanumeric characters.');
        return;
    }
    const room = rooms.get(roomId);
    if (!room) {
        console.log(`VC client connection rejected: Room '${roomId}' not found.`);
        ws.close(1008, 'Room not found.');
        return;
    }
    room.vcClients.add(ws);
    console.log(`🎙️ VC client connected to room: ${roomId}. Total clients: ${room.vcClients.size}`);
    ws.on('message', (message) => {
        // WebRTC Signaling: Broadcast message to all other clients in the same room.
        const parsedMessage = message.toString();
        room.vcClients.forEach(client => {
            if (client !== ws && client.readyState === ws_1.WebSocket.OPEN) {
                client.send(parsedMessage);
            }
        });
    });
    ws.on('close', () => {
        if (room) {
            room.vcClients.delete(ws);
            console.log(`VC client disconnected from room: ${roomId}. Remaining clients: ${room.vcClients.size}`);
        }
    });
    ws.on('error', (error) => {
        console.error(`VC WebSocket error for room ${roomId}:`, error);
        if (room) {
            room.vcClients.delete(ws);
        }
    });
});
// --- HTTP Server Setup ---
server.on('upgrade', (request, socket, head) => {
    const { pathname } = url_1.default.parse(request.url || '', true);
    if (pathname === '/owner') {
        ownerWss.handleUpgrade(request, socket, head, (ws) => {
            ownerWss.emit('connection', ws, request);
        });
    }
    else if (pathname === '/vc') {
        vcWss.handleUpgrade(request, socket, head, (ws) => {
            vcWss.emit('connection', ws, request);
        });
    }
    else {
        socket.destroy();
    }
});
app.get('/', (req, res) => {
    res.send('Proximity Chat Server is running.');
});
server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
