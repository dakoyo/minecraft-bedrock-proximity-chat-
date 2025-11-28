# Communication Flow

This document outlines the communication flow between the Backend, Frontend (Owner & Peers), and Minecraft Bedrock.

## Overview

The application uses a combination of WebSockets and WebRTC to enable proximity chat.
- **Backend**: Acts as a signaling server and bridges communication with Minecraft.
- **Frontend (Owner)**: Connects to the backend, manages the room, and acts as the host for WebRTC connections.
- **Frontend (Peer)**: Connects to the backend to join a room and establishes a P2P connection with the Owner.
- **Minecraft**: Communicates with the backend via WebSocket to provide player positions and list.

## 1. Backend Communication

### WebSocket Endpoints

- **`/mcws`**: Endpoint for Minecraft Bedrock to connect.
- **`/frontendws`**: Endpoint for the Frontend application.

### WebSocket Events (Server -> Frontend Owner)

| Type | Payload | Description |
| :--- | :--- | :--- |
| `code` | `{ code: string }` | Sent immediately after connection to assign a room code. |
| `playerJoin` | `{ data: { playerName: string, playerCode: string } }` | Sent when a player is detected in Minecraft. |
| `playerLeave` | `{ data: { playerName: string } }` | Sent when a player leaves Minecraft. |
| `peerDisconnect` | `{ data: { playerName: string } }` | Sent when a peer disconnects from the signaling server. |
| `sync` | `{ data: string }` | Raw base64 sync data (contains `pl` and `pd`) sent to Owner for relaying. |
| `signal` | `{ target: "owner", sender: string, payload: any }` | WebRTC signaling data forwarded from a peer. |

### WebSocket Events (Server -> Frontend Peer)

| Type | Payload | Description |
| :--- | :--- | :--- |
| `joinResponse` | `{ data: { playerName: string, roomId: string } }` | Sent upon successful room join. |
| `signal` | `{ sender: "owner", payload: any }` | WebRTC signaling data forwarded from the owner. |

### WebSocket Events (Frontend -> Server)

| Type | Payload | Description |
| :--- | :--- | :--- |
| `signal` | `{ target: string, payload: any }` | WebRTC signaling data. `target` is "owner" (if sent by peer) or a player code (if sent by owner). |

## 2. Frontend Communication

### Connection Flow

1.  **Owner** connects to `/frontendws`.
2.  **Backend** generates a `roomId` and sends it to Owner.
3.  **Backend** polls Minecraft for players.
4.  When a player joins Minecraft, Backend generates a `playerCode` and notifies Owner (`playerJoin`).
5.  **Peer** connects to `/frontendws?roomId=...&playerCode=...`.
6.  **Backend** validates credentials and sends `joinResponse` to Peer.

### WebRTC Signaling (P2P)

The Backend acts as a relay for WebRTC signaling messages (Offer, Answer, ICE Candidates).

1.  **Peer** (Initiator) creates an Offer and sends it to **Backend** (`target: "owner"`).
2.  **Backend** forwards Offer to **Owner**.
3.  **Owner** accepts Offer, creates Answer, and sends it to **Backend** (`target: peerCode`).
4.  **Backend** forwards Answer to **Peer**.
5.  ICE Candidates are exchanged similarly.

### Data Channel (P2P)

Once the WebRTC connection is established, a Data Channel (`sync`) is used for real-time updates.

-   **Owner** broadcasts state updates to all connected peers.
-   **Payload**: `{ type: 'update', players: string[], statuses: Record<string, 'online' | 'offline'>, playerData: any[] }`

## 3. Types

```typescript
// WebSocket Message Types

interface BaseMessage {
    type: string;
}

interface CodeMessage extends BaseMessage {
    code: string;
}

interface PlayerJoinMessage extends BaseMessage {
    type: 'playerJoin';
    data: {
        playerName: string;
        playerCode: string;
    };
}

interface PlayerLeaveMessage extends BaseMessage {
    type: 'playerLeave';
    data: {
        playerName: string;
    };
}

interface JoinResponseMessage extends BaseMessage {
    type: 'joinResponse';
    data: {
        playerName: string;
        roomId: string;
    };
}

interface SignalMessage extends BaseMessage {
    type: 'signal';
    target?: string; // "owner" or playerCode
    sender?: string; // "owner" or playerCode (added by server)
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

interface PeerDisconnectMessage extends BaseMessage {
    type: 'peerDisconnect';
    data: {
        playerName: string;
    };
}

// Data Channel Message Types

interface SyncUpdateMessage {
    type: 'update';
    players: string[];
    statuses: Record<string, 'online' | 'offline'>;
    playerData: any[]; // Decoded from sync data
}

interface SyncMessage extends BaseMessage {
    type: 'sync';
    data: string; // Base64 encoded string
}
```
