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
const rooms = new Map(); // roomId -> Room
const playerCodes = new Map(); // roomId -> (playerName -> playerCode)
// --- Helper Functions ---
const generateUniqueId = (length, existingIds) => {
    let id;
    const chars = '0123456789';
    do {
        id = '';
        for (let i = 0; i < length; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (existingIds.has(id));
    return id;
};
// --- Minecraft Owner WebSocket Server (/owner) ---
ownerWss.on('connection', (ws, req) => __awaiter(void 0, void 0, void 0, function* () {
    const { query } = url_1.default.parse(req.url || '', true);
    const roomId = query.roomId;
    if (!roomId) {
        return ws.close(1008, 'Room ID must be provided.');
    }
    const room = rooms.get(roomId);
    if (!room || room.ownerWs) {
        return ws.close(1008, room ? 'Room is already hosted.' : 'Room not found.');
    }
    console.log(`🔌 Minecraft Owner connecting for room: ${roomId}`);
    room.ownerWs = ws;
    if (room.cleanupTimeout) {
        clearTimeout(room.cleanupTimeout);
    }
    // --- Command Handling ---
    const pendingCommands = new Map();
    ws.on('message', (data) => {
        var _a;
        try {
            const msg = JSON.parse(data.toString());
            if (((_a = msg.header) === null || _a === void 0 ? void 0 : _a.messagePurpose) === 'commandResponse' && pendingCommands.has(msg.header.requestId)) {
                pendingCommands.get(msg.header.requestId)(msg.body);
                pendingCommands.delete(msg.header.requestId);
            }
        }
        catch (e) { }
    });
    const sendCommand = (command, timeout = 2000) => {
        return new Promise((resolve, reject) => {
            if (ws.readyState !== ws_1.WebSocket.OPEN)
                return reject('WebSocket is not open.');
            const requestId = (0, crypto_1.randomUUID)();
            const packet = {
                header: { version: 1, requestId, messagePurpose: 'commandRequest' },
                body: { version: 1, commandLine: command, origin: { type: 'player' } },
            };
            const timer = setTimeout(() => {
                pendingCommands.delete(requestId);
                reject(`Command '${command}' timed out.`);
            }, timeout);
            pendingCommands.set(requestId, (response) => {
                clearTimeout(timer);
                resolve(response);
            });
            ws.send(JSON.stringify(packet));
        });
    };
    // --- Initialization Sequence ---
    try {
        yield sendCommand("subscribe", 5000); // Subscribe to CommandResponse
        const ownerNameResponse = yield sendCommand("getlocalplayername");
        if (ownerNameResponse.statusCode !== 0)
            throw new Error("Failed to get owner name");
        room.ownerName = ownerNameResponse.localplayername;
        console.log(`👑 Owner for room ${roomId} identified as: ${room.ownerName}`);
        yield sendCommand(`/notifyroomid ${roomId}`);
    }
    catch (err) {
        console.error(`Failed to initialize owner connection for room ${roomId}:`, err);
        return ws.close(1011, 'Failed to initialize connection.');
    }
    // --- Sync Data Processing ---
    const processSyncData = (jsonString) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        try {
            const data = JSON.parse(jsonString);
            if (!data.events || data.events.length === 0)
                return;
            room.lastKnownSeq = data.last_sequence;
            console.log(`[${roomId}] Sync: ${data.events.length} events, new seq: ${room.lastKnownSeq}`);
            // Handle new players and generate codes
            for (const event of data.events) {
                if (event.type === 'join' && event.id !== room.ownerName) {
                    const playerName = event.id;
                    if (!((_a = playerCodes.get(roomId)) === null || _a === void 0 ? void 0 : _a.has(playerName))) {
                        const allCodes = new Set((_b = playerCodes.get(roomId)) === null || _b === void 0 ? void 0 : _b.values());
                        const newCode = generateUniqueId(6, allCodes);
                        if (!playerCodes.has(roomId))
                            playerCodes.set(roomId, new Map());
                        playerCodes.get(roomId).set(playerName, newCode);
                        console.log(`[${roomId}] New player '${playerName}' joined. Assigning code: ${newCode}`);
                        yield sendCommand(`/notifyplayercode "${playerName}" ${newCode}`);
                    }
                }
            }
            // Broadcast update to all authenticated VC clients
            const message = JSON.stringify({ type: 'mc_update', payload: data.events });
            room.vcClients.forEach(client => client.send(message));
        }
        catch (e) {
            console.error(`[${roomId}] Failed to process sync data:`, e);
        }
    });
    // --- Polling Loop ---
    let isPolling = true;
    const startPolling = () => __awaiter(void 0, void 0, void 0, function* () {
        while (isPolling && ws.readyState === ws_1.WebSocket.OPEN) {
            try {
                const response = yield sendCommand(`/vc:sync ${room.lastKnownSeq}`, 500);
                if (response.statusCode === 0) {
                    yield processSyncData(response.statusMessage);
                }
            }
            catch (pollErr) {
                // Ignore timeouts, they are expected if server is busy
            }
            yield new Promise(r => setTimeout(r, POLLING_INTERVAL_MS));
        }
    });
    startPolling();
    ws.on('close', () => {
        console.log(`Minecraft Owner for room ${roomId} disconnected.`);
        isPolling = false;
        room.vcClients.forEach(client => client.close(1012, 'The host has disconnected.'));
        playerCodes.delete(roomId);
        rooms.delete(roomId);
        console.log(`🚪 Room closed: ${roomId}`);
    });
    ws.on('error', (err) => {
        console.error(`Owner WebSocket error for room ${roomId}:`, err);
        isPolling = false;
    });
}));
// --- VC Client WebSocket Server (/vc) ---
vcWss.on('connection', (ws, req) => {
    const { query } = url_1.default.parse(req.url || '', true);
    const { roomId, playerCode, playerName } = query;
    if (!roomId)
        return ws.close(1008, 'Room ID must be provided.');
    const room = rooms.get(roomId);
    if (!room || !room.ownerWs)
        return ws.close(1008, 'Room not found or not active.');
    let authenticatedPlayerName;
    // Authenticate user
    if (playerName && playerName === room.ownerName) {
        authenticatedPlayerName = room.ownerName; // Owner connects with their name
    }
    else if (playerCode) {
        const roomPlayerCodes = playerCodes.get(roomId);
        for (const [name, code] of (roomPlayerCodes === null || roomPlayerCodes === void 0 ? void 0 : roomPlayerCodes.entries()) || []) {
            if (code === playerCode) {
                authenticatedPlayerName = name;
                break;
            }
        }
    }
    if (!authenticatedPlayerName) {
        return ws.close(1008, 'Invalid credentials.');
    }
    // Add to room's vcClients
    room.vcClients.set(authenticatedPlayerName, ws);
    console.log(`🎙️ VC client '${authenticatedPlayerName}' connected to room: ${roomId}. Total clients: ${room.vcClients.size}`);
    ws.on('close', () => {
        room.vcClients.delete(authenticatedPlayerName);
        console.log(`VC client '${authenticatedPlayerName}' disconnected from room: ${roomId}. Remaining: ${room.vcClients.size}`);
    });
    ws.on('error', (error) => {
        console.error(`VC WebSocket error for '${authenticatedPlayerName}' in room ${roomId}:`, error);
        room.vcClients.delete(authenticatedPlayerName);
    });
});
// --- HTTP Server Setup ---
server.on('upgrade', (request, socket, head) => {
    const { pathname } = url_1.default.parse(request.url || '', true);
    if (pathname === '/owner') {
        ownerWss.handleUpgrade(request, socket, head, (ws) => ownerWss.emit('connection', ws, request));
    }
    else if (pathname === '/vc') {
        vcWss.handleUpgrade(request, socket, head, (ws) => vcWss.emit('connection', ws, request));
    }
    else {
        socket.destroy();
    }
});
app.get('/create-room', (req, res) => {
    const existingRoomIds = new Set(rooms.keys());
    const roomId = generateUniqueId(6, existingRoomIds);
    console.log(`✨ Room creation request. New ID: ${roomId}`);
    const cleanupTimeout = setTimeout(() => {
        const room = rooms.get(roomId);
        if (room && !room.ownerWs) {
            console.log(`- Deleting expired pending room: ${roomId}`);
            rooms.delete(roomId);
        }
    }, 300000); // 5 minutes
    rooms.set(roomId, {
        ownerWs: null,
        vcClients: new Map(),
        lastKnownSeq: -1,
        cleanupTimeout,
    });
    res.json({ roomId });
});
app.get('/', (req, res) => {
    res.send('Proximity Chat Server is running.');
});
server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
