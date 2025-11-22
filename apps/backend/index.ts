import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import url from 'url';

const app = express();
const server = http.createServer(app);

const ownerWss = new WebSocketServer({ noServer: true });
const vcWss = new WebSocketServer({ noServer: true });

const PORT = 8080;
const POLLING_INTERVAL_MS = 100;

// --- Room Management ---
interface Room {
    owner: WebSocket;
    vcClients: Set<WebSocket>;
    lastKnownSeq: number;
}
const rooms = new Map<string, Room>();

// --- WebSocket Server for Minecraft Owner ---
ownerWss.on('connection', (ws: WebSocket, req) => {
    const { query } = url.parse(req.url || '', true);
    const roomId = query.roomId as string;

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
    } else {
        room.owner = ws; // Allow owner to reconnect
        console.log(`Owner reconnected to room: ${roomId}`);
    }
    
    let isPolling = true;

    const subscribe = (eventName: string) => {
        const subscribePacket = {
            header: {
                version: 1,
                requestId: randomUUID(),
                messagePurpose: 'subscribe',
                messageType: 'commandRequest',
            },
            body: { eventName },
        };
        ws.send(JSON.stringify(subscribePacket));
        console.log(`Sent subscribe packet for ${eventName}.`);
    }
    
    subscribe('CommandResponse');

    const sendCommand = (command: string): string => {
        const requestId = randomUUID();
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

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(packet));
        }
        return requestId;
    };

    const startPolling = async () => {
        while (isPolling && ws.readyState === WebSocket.OPEN) {
            // Use the room-specific lastKnownSeq
            const currentRoom = rooms.get(roomId);
            if (!currentRoom) {
                isPolling = false;
                return;
            };

            await new Promise<void>((resolve) => {
                const requestId = sendCommand(`/vc:sync ${currentRoom.lastKnownSeq}`);
                
                const listener = (data: Buffer) => {
                    try {
                        const msg = JSON.parse(data.toString());
                        if (msg.header?.messagePurpose === 'commandResponse' && msg.header.requestId === requestId) {
                            if (msg.body.statusCode === 0) {
                                processSyncData(roomId, msg.body.statusMessage);
                            }
                            ws.off('message', listener);
                            resolve();
                        }
                    } catch (e) {}
                };
                ws.on('message', listener);
                
                setTimeout(() => {
                    ws.off('message', listener);
                    resolve();
                }, 500); 
            });
            await new Promise(r => setTimeout(r, POLLING_INTERVAL_MS));
        }
    };
    
    const processSyncData = (currentRoomId: string, jsonString: string) => {
        const room = rooms.get(currentRoomId);
        if (!room) return;

        try {
            const data = JSON.parse(jsonString);
            if (data.events && data.events.length > 0) {
                room.lastKnownSeq = data.last_sequence;
                console.log(`[${currentRoomId}] Received ${data.events.length} events. New Seq: ${room.lastKnownSeq}.`);
                
                const message = JSON.stringify({ type: 'mc_update', payload: data.events });
                room.vcClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            }
        } catch (e) {
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
vcWss.on('connection', (ws: WebSocket, req) => {
    const { query } = url.parse(req.url || '', true);
    const roomId = query.roomId as string;

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
    
    ws.on('message', (message: Buffer) => {
        // WebRTC Signaling: Broadcast message to all other clients in the same room.
        const parsedMessage = message.toString();
        room.vcClients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
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
    const { pathname } = url.parse(request.url || '', true);

    if (pathname === '/owner') {
        ownerWss.handleUpgrade(request, socket, head, (ws) => {
            ownerWss.emit('connection', ws, request);
        });
    } else if (pathname === '/vc') {
        vcWss.handleUpgrade(request, socket, head, (ws) => {
            vcWss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

app.get('/', (req, res) => {
    res.send('Proximity Chat Server is running.');
});

server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
