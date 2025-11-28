import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Usage: pnpm start <ROOM_CODE> <PLAYER_NAME>");
    process.exit(1);
}

const [roomCode, playerName] = args;
const wsUrl = `ws://localhost:3000/mcws?roomId=${roomCode}`;

console.log(`Connecting to ${wsUrl} as ${playerName}...`);

const ws = new WebSocket(wsUrl);

ws.on("open", () => {
    console.log("Connected to backend!");
});

ws.on("message", (data) => {
    try {
        const message = JSON.parse(data.toString());
        handleMessage(message);
    } catch (e) {
        console.error("Failed to parse message:", e);
    }
});

ws.on("close", (code, reason) => {
    console.log(`Disconnected: ${code} ${reason}`);
    process.exit(0);
});

ws.on("error", (err) => {
    console.error("WebSocket error:", err);
});

function handleMessage(message: any) {
    const header = message.header;
    const body = message.body;

    if (header && header.messagePurpose === "commandRequest") {
        handleCommandRequest(header, body);
    }
}

// Mock Data State
interface MockPlayer {
    name: string;
    pos: { x: number, y: number, z: number };
    rot: { x: number, y: number };
    groups: number[];
}

const mockPlayers: MockPlayer[] = [
    { name: playerName, pos: { x: 0, y: 100, z: 0 }, rot: { x: 0, y: 0 }, groups: [] },
    { name: "Alex", pos: { x: 5, y: 100, z: 5 }, rot: { x: 0, y: 0 }, groups: [] },
    { name: "Steve", pos: { x: -5, y: 100, z: -5 }, rot: { x: 0, y: 0 }, groups: [] }
];

let sequenceNumber = 0;

// Simulate movement
setInterval(() => {
    const time = Date.now() / 1000;
    mockPlayers.forEach((p, i) => {
        if (p.name === playerName) return; // Don't move self automatically? Or do? Let's move everyone.

        // Simple circle movement
        const radius = 5 + i * 2;
        p.pos.x = Math.cos(time + i) * radius;
        p.pos.z = Math.sin(time + i) * radius;
        p.rot.y = (time + i) * 50 % 360;
    });
}, 50);

function handleCommandRequest(header: any, body: any) {
    const requestId = header.requestId;
    const commandLine = body.commandLine as string;

    // console.log(`Received command: ${commandLine}`);

    if (commandLine.startsWith("getlocalplayername")) {
        sendCommandResponse(requestId, {
            localPlayerName: playerName
        });
    } else if (commandLine.startsWith("vc:sync")) {
        const args = commandLine.split(" ");
        const getAll = args[1] === "true";

        const syncData: any = {
            g: [], // No groups for now
            pd: []
        };

        if (getAll) {
            syncData.pl = mockPlayers.map(p => p.name);
        }

        syncData.pd = mockPlayers.map(p => {
            return [
                [Math.round(p.pos.x * 10) / 10, Math.round(p.pos.y * 10) / 10, Math.round(p.pos.z * 10) / 10],
                [Math.round(p.rot.x), Math.round(p.rot.y)],
                p.groups
            ];
        });

        const syncMessage = {
            s: sequenceNumber++,
            d: Buffer.from(JSON.stringify(syncData)).toString("base64")
        };

        sendCommandResponse(requestId, JSON.stringify(syncMessage));

    } else if (commandLine.startsWith("vc:notifyplayer")) {
        console.log("Notification received:", commandLine);
        sendCommandResponse(requestId, "Notification received");
    } else {
        console.log("Unknown command:", commandLine);
        sendCommandResponse(requestId, "Unknown command", 1);
    }
}

function sendCommandResponse(requestId: string, data: any, statusCode: number = 0) {
    const response = {
        header: {
            messagePurpose: "commandResponse",
            requestId: requestId,
            version: 1
        },
        body: {
            statusCode: statusCode,
            statusMessage: typeof data === "string" ? data : JSON.stringify(data),
            // Some commands might expect specific fields in body, but runCommand in backend 
            // seems to resolve with statusMessage.
            // Wait, backend: request.resolve(body.statusMessage);
            // So whatever we put in statusMessage is what the backend gets.
        }
    };

    // For getlocalplayername, the backend probably expects the name directly?
    // Backend doesn't seem to use getlocalplayername.
    // But the user asked for it.
    // If the backend used it, it would likely expect the name in statusMessage or some other field.
    // Standard Bedrock behavior for getlocalplayername:
    // It returns the name.

    // Let's adjust based on backend expectation.
    // Backend: request.resolve(body.statusMessage);
    // So if we want to return data, we must put it in statusMessage (stringified if needed).

    ws.send(JSON.stringify(response));
}
