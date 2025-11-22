import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import url from 'url';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);

const ownerWss = new WebSocketServer({ noServer: true });
const vcWss = new WebSocketServer({ noServer: true });

const PORT = 8080;
const POLLING_INTERVAL_MS = 100;

// --- Data Structures ---
interface Room {
    ownerWs: WebSocket | null;
    ownerName?: string;
    vcClients: Map<string, WebSocket>; // playerName -> WebSocket
    lastKnownSeq: number;
    cleanupTimeout?: NodeJS.Timeout;
}
const rooms = new Map<string, Room>(); // roomId -> Room
const playerCodes = new Map<string, Map<string, string>>(); // roomId -> (playerName -> playerCode)

// --- Helper Functions ---
const generateUniqueId = (length: number, existingIds: Set<string>): string => {
    let id: string;
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
ownerWss.on('connection', async (ws: WebSocket, req) => {
    const { query } = url.parse(req.url || '', true);
    const roomId = query.roomId as string;

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
    const pendingCommands = new Map<string, (response: any) => void>();
    ws.on('message', (data: Buffer) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.header?.messagePurpose === 'commandResponse' && pendingCommands.has(msg.header.requestId)) {
                pendingCommands.get(msg.header.requestId)!(msg.body);
                pendingCommands.delete(msg.header.requestId);
            }
        } catch (e) {}
    });

    const sendCommand = <T>(command: string, timeout = 2000): Promise<T> => {
        return new Promise((resolve, reject) => {
            if (ws.readyState !== WebSocket.OPEN) return reject('WebSocket is not open.');

            const requestId = randomUUID();
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
                resolve(response as T);
            });

            ws.send(JSON.stringify(packet));
        });
    };
    
    // --- Initialization Sequence ---
    try {
        await sendCommand("subscribe", 5000); // Subscribe to CommandResponse
        
        const ownerNameResponse = await sendCommand<{
            localplayername: string,
            statusCode: number
        }>("getlocalplayername");
        
        if (ownerNameResponse.statusCode !== 0) throw new Error("Failed to get owner name");
        
        room.ownerName = ownerNameResponse.localplayername;
        console.log(`👑 Owner for room ${roomId} identified as: ${room.ownerName}`);

        await sendCommand(`/notifyroomid ${roomId}`);

    } catch (err) {
        console.error(`Failed to initialize owner connection for room ${roomId}:`, err);
        return ws.close(1011, 'Failed to initialize connection.');
    }

    // --- Sync Data Processing ---
    const processSyncData = async (jsonString: string) => {
        try {
            const data = JSON.parse(jsonString);
            if (!data.events || data.events.length === 0) return;

            room.lastKnownSeq = data.last_sequence;
            console.log(`[${roomId}] Sync: ${data.events.length} events, new seq: ${room.lastKnownSeq}`);

            // Handle new players and generate codes
            for (const event of data.events) {
                if (event.type === 'join' && event.id !== room.ownerName) {
                    const playerName = event.id;
                    if (!playerCodes.get(roomId)?.has(playerName)) {
                        const allCodes = new Set(playerCodes.get(roomId)?.values());
                        const newCode = generateUniqueId(6, allCodes);
                        
                        if (!playerCodes.has(roomId)) playerCodes.set(roomId, new Map());
                        playerCodes.get(roomId)!.set(playerName, newCode);
                        
                        console.log(`[${roomId}] New player '${playerName}' joined. Assigning code: ${newCode}`);
                        await sendCommand(`/notifyplayercode "${playerName}" ${newCode}`);
                    }
                }
            }
            
            // Broadcast update to all authenticated VC clients
            const message = JSON.stringify({ type: 'mc_update', payload: data.events });
            room.vcClients.forEach(client => client.send(message));

        } catch (e) {
            console.error(`[${roomId}] Failed to process sync data:`, e);
        }
    };

    // --- Polling Loop ---
    let isPolling = true;
    const startPolling = async () => {
        while (isPolling && ws.readyState === WebSocket.OPEN) {
            try {
                const response = await sendCommand<{ statusMessage: string, statusCode: number }>(`/vc:sync ${room.lastKnownSeq}`, 500);
                if (response.statusCode === 0) {
                    await processSyncData(response.statusMessage);
                }
            } catch (pollErr) {
                 // Ignore timeouts, they are expected if server is busy
            }
            await new Promise(r => setTimeout(r, POLLING_INTERVAL_MS));
        }
    };
    
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
});

// --- VC Client WebSocket Server (/vc) ---
vcWss.on('connection', (ws: WebSocket, req) => {
    const { query } = url.parse(req.url || '', true);
    const { roomId, playerCode, playerName } = query as { roomId: string, playerCode?: string, playerName?: string };

    if (!roomId) return ws.close(1008, 'Room ID must be provided.');

    const room = rooms.get(roomId);
    if (!room || !room.ownerWs) return ws.close(1008, 'Room not found or not active.');

    let authenticatedPlayerName: string | undefined;

    // Authenticate user
    if (playerName && playerName === room.ownerName) {
        authenticatedPlayerName = room.ownerName; // Owner connects with their name
    } else if (playerCode) {
        const roomPlayerCodes = playerCodes.get(roomId);
        for (const [name, code] of roomPlayerCodes?.entries() || []) {
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
        room.vcClients.delete(authenticatedPlayerName!);
        console.log(`VC client '${authenticatedPlayerName}' disconnected from room: ${roomId}. Remaining: ${room.vcClients.size}`);
    });

    ws.on('error', (error) => {
        console.error(`VC WebSocket error for '${authenticatedPlayerName}' in room ${roomId}:`, error);
        room.vcClients.delete(authenticatedPlayerName!);
    });
});

// --- HTTP Server Setup ---
server.on('upgrade', (request, socket, head) => {
    const { pathname } = url.parse(request.url || '', true);
    if (pathname === '/owner') {
        ownerWss.handleUpgrade(request, socket, head, (ws) => ownerWss.emit('connection', ws, request));
    } else if (pathname === '/vc') {
        vcWss.handleUpgrade(request, socket, head, (ws) => vcWss.emit('connection', ws, request));
    } else {
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

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.send('Proximity Chat Server is running.');
});

server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
