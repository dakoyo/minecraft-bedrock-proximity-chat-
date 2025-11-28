import { RawData, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { SimplifiedSyncData, SimplifiedSyncMessage } from "@minecraft/proximity-vc";
import { generateRandomPlayerCode } from "./code";

export class RoomHandler {
    minecraftWs?: WebSocket;
    frontEndWs: WebSocket;
    localPlayerName?: string;
    roomId: string;

    private commandRequests = new Map<string, { resolve: (value: string) => void, reject: (reason?: any) => void }>();
    private boundHandleMessage: (data: RawData) => void;

    constructor(FrontEndWs: WebSocket, roomId: string) {
        this.frontEndWs = FrontEndWs;
        this.roomId = roomId;
        this.boundHandleMessage = this.handleMessage.bind(this);
    }

    private interval?: NodeJS.Timeout;
    private lastSequenceNumber = -1;
    private getAll = true;
    private playerNames: string[] = [];
    private isSyncing = false;
    private destroyed = false;

    private playerCodes = new Map<string, string>(); // code -> name
    private peers = new Map<string, WebSocket>(); // code -> ws

    async handlePlayerJoin(playerName: string) {
        const playerCode = generateRandomPlayerCode();

        this.playerNames.push(playerName);
        this.playerCodes.set(playerCode, playerName);
        this.frontEndWs.send(JSON.stringify({ type: "playerJoin", data: { playerName, playerCode } }));
        await this.notifyPlayerCode(playerName, playerCode);
    }

    async handlePlayerLeave(playerName: string) {
        console.log(`[Room] handlePlayerLeave: ${playerName}`);
        this.playerNames.splice(this.playerNames.indexOf(playerName), 1);
        // Remove from playerCodes
        for (const [code, name] of this.playerCodes.entries()) {
            if (name === playerName) {
                this.playerCodes.delete(code);
                const peerWs = this.peers.get(code);
                if (peerWs) {
                    peerWs.close();
                    this.peers.delete(code);
                }
                break;
            }
        }
        this.frontEndWs.send(JSON.stringify({ type: "playerLeave", data: { playerName } }));
    }

    handlePeerJoin(ws: WebSocket, playerCode: string) {
        const playerName = this.playerCodes.get(playerCode);
        console.log(`[Room] handlePeerJoin. Code: ${playerCode}, Name: ${playerName}`);

        if (!playerName) {
            console.log(`[Room] Invalid player code: ${playerCode}`);
            ws.close(1008, "Invalid player code");
            return;
        }

        this.peers.set(playerCode, ws);

        // Send join response to peer
        ws.send(JSON.stringify({
            type: "joinResponse",
            data: {
                playerName,
                roomId: this.roomId
            }
        }));

        // Handle signaling messages from peer
        ws.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === "signal") {
                    // Forward signal to owner
                    this.frontEndWs.send(JSON.stringify({
                        type: "signal",
                        target: "owner",
                        sender: playerCode,
                        payload: message.payload
                    }));
                }
            } catch (e) {
                console.error("Failed to parse peer message", e);
            }
        });

        ws.on("close", () => {
            this.peers.delete(playerCode);
            // Notify owner about peer disconnect
            this.frontEndWs.send(JSON.stringify({
                type: "peerDisconnect",
                data: { playerName }
            }));
        });
    }

    async notifyPlayerCode(playerName: string, playerCode: string) {
        if (this.localPlayerName === playerName) return;
        await this.runCommand(`vc:notifyplayer ${playerName} ${this.roomId} ${playerCode}`);
    }

    async sync() {
        if (this.isSyncing || this.destroyed) return;
        this.isSyncing = true;
        try {
            const syncMessageRaw = await this.runCommand(`vc:sync ${this.getAll ? "true" : "false"}`);
            const syncMessage: SimplifiedSyncMessage = JSON.parse(syncMessageRaw);

            const syncDataRaw = atob(syncMessage.d);
            const syncData: SimplifiedSyncData = JSON.parse(syncDataRaw);

            if (syncData.pl) {
                syncData.pl.forEach(async (playerName) => {
                    if (!this.playerNames.includes(playerName)) {
                        try {
                            await this.handlePlayerJoin(playerName);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                });

                this.playerNames.forEach(async (playerName) => {
                    if (!syncData.pl?.includes(playerName)) {
                        this.handlePlayerLeave(playerName);
                    }
                });
            }

            // Send raw sync data to owner
            this.frontEndWs.send(JSON.stringify({
                type: "sync",
                data: syncMessage.d
            }));

            this.getAll = false;
            if (syncMessage.s !== this.lastSequenceNumber + 1) {
                this.getAll = true;
                this.lastSequenceNumber = -1;
            } else {
                this.lastSequenceNumber = syncMessage.s;
            }

        } catch (e) {
            console.error(e);
        } finally {
            this.isSyncing = false;
        }
    }

    async init(mcws: WebSocket) {
        this.minecraftWs = mcws;
        this.minecraftWs.on("message", this.boundHandleMessage);
        this.minecraftWs.on("error", (e) => {
            console.error("Minecraft WebSocket error:", e);
        });

        this.minecraftWs.on("close", () => {
            console.log(`[Room] Minecraft client disconnected. Room: ${this.roomId}`);
            // Create a copy of the array because handlePlayerLeave modifies it
            const players = [...this.playerNames];
            for (const player of players) {
                this.handlePlayerLeave(player);
            }
            this.destroy();
        });

        // Handle signaling messages from owner
        this.frontEndWs.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === "signal") {
                    const targetPeer = this.peers.get(message.target);
                    if (targetPeer) {
                        targetPeer.send(JSON.stringify({
                            type: "signal",
                            sender: "owner",
                            payload: message.payload
                        }));
                    }
                }
            } catch (e) {
                console.error("Failed to parse owner message", e);
            }
        });

        if (this.destroyed) return;

        this.interval = setInterval(async () => {
            if (this.destroyed) {
                if (this.interval) clearInterval(this.interval);
                return;
            }
            this.sync();
        }, 200);
    }

    private handleMessage(data: RawData) {
        const message = data.toString("utf-8");
        try {
            const jsonMessage = JSON.parse(message);
            const header = jsonMessage.header;
            const body = jsonMessage.body;

            if (header && header.messagePurpose === "commandResponse") {
                const requestId = header.requestId;
                const request = this.commandRequests.get(requestId);

                if (request) {
                    if (body.statusCode === 0) {
                        request.resolve(body.statusMessage);
                    } else {
                        request.reject(body.statusMessage);
                    }
                    this.commandRequests.delete(requestId);
                } else {
                    // console.log("Received response for unknown/expired requestId:", requestId);
                }
            }
        } catch (error) {
            console.error("Failed to parse incoming message:", message);
        }
    }

    runCommand(command: string) {
        return new Promise<string>((resolve, reject) => {
            try {
                if (!this.minecraftWs) {
                    throw new Error("Minecraft WebSocket is not initialized");
                }

                const requestId = randomUUID();
                const commandPacket = {
                    header: {
                        version: 1,
                        requestId: requestId,
                        messagePurpose: "commandRequest",
                    },
                    body: {
                        version: 1,
                        commandLine: command,
                        origin: {
                            type: "player"
                        }
                    },
                };

                this.commandRequests.set(requestId, { resolve, reject });
                this.minecraftWs.send(JSON.stringify(commandPacket));

                // Timeout to clean up stale requests
                setTimeout(() => {
                    if (this.commandRequests.has(requestId)) {
                        this.commandRequests.get(requestId)?.reject(`Timeout: ${command}`);
                        this.commandRequests.delete(requestId);
                    }
                }, 5000);
            } catch (e) {
                reject(e);
            }
        })
    }

    destroy() {
        this.destroyed = true;
        if (this.interval) {
            clearInterval(this.interval);
        }
        if (this.minecraftWs) {
            this.minecraftWs.off("message", this.boundHandleMessage);
            this.minecraftWs.terminate();
        }
        // Close all peer connections
        for (const peer of this.peers.values()) {
            peer.close();
        }
        this.peers.clear();
    }
}