# Frontend Development Prompt for AI: Minecraft Proximity Voice Chat Client

## 1. Project Overview

You are tasked with creating the frontend for a Minecraft proximity voice chat application. This web client will connect to a custom WebSocket server to facilitate real-time voice communication between players based on their in-game location.

The application should allow users to join a "room" corresponding to a Minecraft world, see other participants, and communicate via WebRTC. The key feature is 3D spatial audio, where the voice of other players will sound like it's coming from their in-game position.

## 2. Core Technologies

- **Framework:** React (using Vite for the development environment)
- **UI:** A modern component library like Material-UI (MUI) or Chakra UI. Please choose one and use it consistently.
- **Styling:** CSS-in-JS (e.g., Emotion, styled-components) or CSS Modules.
- **State Management:** React Context API for managing application-wide state (e.g., WebSocket connection, room details, participants).

## 3. Backend API Specification

The frontend will interact with a WebSocket server that has two main purposes:
1.  Receiving player location data from the Minecraft game client (the "owner").
2.  Broadcasting WebRTC signaling messages between voice chat clients.

### WebSocket Connection

-   **Endpoint:** `ws://<your_server_address>/vc?roomId=<roomId>`
-   **`roomId`:** A 4-16 character alphanumeric string that identifies the chat room. The client must provide this when connecting.

### WebSocket Message Handling

1.  **Receiving Player Data (from Server):**
    The server will periodically send updates about player locations.
    -   **Format:**
        ```json
        {
          "type": "mc_update",
          "payload": [
            {
              "seq": 1,
              "type": "join" | "leave" | "move",
              "id": "player_name_string",
              "data": {
                // For 'join'
                "dim": "minecraft:overworld",
                // For 'move'
                "x": 123.45,
                "y": 64.0,
                "z": -78.9,
                "rx": 0.0, // Head rotation X (pitch)
                "ry": 90.0  // Head rotation Y (yaw)
              }
            }
            // ... more events
          ]
        }
        ```
    -   The frontend must parse these events to manage the list of in-game players and their positions. The `id` field corresponds to the Minecraft player name.

2.  **WebRTC Signaling (Peer-to-Peer via Server):**
    For WebRTC, the server acts as a simple signaling relay. Any message sent by a client to the WebSocket server will be broadcast to all other clients in the same room. The frontend should send and receive standard WebRTC signaling messages (SDP offers/answers, ICE candidates) through this mechanism. You will need to wrap them in a JSON object to identify the sender and receiver.
    -   **Example Sending Format:**
        ```json
        {
          "type": "signal",
          "from": "local_user_id",
          "to": "remote_user_id",
          "data": { ...SDP or ICE candidate... }
        }
        ```

## 4. Required Features

### Screen 1: Lobby / Room Entry
-   A simple form with two fields:
    1.  **Username:** For display in the voice chat UI.
    2.  **Room ID:** The user must enter the `roomId` corresponding to the Minecraft world they are in.
-   A "Join Room" button.
-   Upon clicking "Join", the app should:
    1.  Request microphone access from the user (`navigator.mediaDevices.getUserMedia`).
    2.  Establish a WebSocket connection to the server using the provided `roomId`.
    3.  Transition to the Voice Chat screen on successful connection.

### Screen 2: Voice Chat
This is the main interface.

1.  **Participant List:**
    -   Display a list of all users currently connected to the voice chat room.
    -   Each entry should show the username.
    -   The user should be able to individually mute/unmute other participants' audio.

2.  **WebRTC Connection Management:**
    -   For every other user in the room, a direct `RTCPeerConnection` should be established.
    -   When a new user joins the WebSocket room, create a new `RTCPeerConnection` for them, generate an offer, and send it via the WebSocket.
    -   Handle incoming signaling messages to establish and maintain P2P connections.

3.  **3D Spatial Audio (Positional Audio):**
    -   This is the most critical feature. For each incoming audio stream from another player, you must use the Web Audio API to create a positional audio effect.
    -   **Implementation Steps:**
        1.  Create an `AudioContext`.
        2.  For each `RTCPeerConnection`, get the incoming `MediaStream`.
        3.  Create a `MediaStreamAudioSourceNode` from the stream.
        4.  Create a `PannerNode`. This node is responsible for the 3D audio effect.
        5.  Connect the source node to the panner node, and the panner node to the `audioContext.destination`.
        6.  Listen for `mc_update` events from the WebSocket. When a `move` event is received for a player, update the `PannerNode`'s position.
            -   The `PannerNode` has `positionX`, `positionY`, and `positionZ` properties. You can map the Minecraft coordinates (`x`, `y`, `z`) directly to these.
            -   You will also need to update the `AudioListener`'s position and orientation to match the local player's position and head rotation. The local player is the one whose name matches the `id` from a `move` event and also the current user's name.

4.  **Controls:**
    -   A global "Mute/Unmute" button for the user's own microphone.
    -   A "Disconnect" or "Leave Room" button.

## 5. Implementation Plan

1.  **Project Setup:** Initialize a new React project using Vite.
2.  **Component Scaffolding:** Create placeholder components for the Lobby and Voice Chat screens.
3.  **State Management:** Set up a React Context to manage the WebSocket connection, participants, and audio settings.
4.  **WebSocket Logic:** Implement a service or hook to handle WebSocket connection, message sending, and receiving.
5.  **WebRTC Logic:** Create a robust system for managing multiple `RTCPeerConnection` instances. This should handle the entire lifecycle: creation, signaling, connection, and teardown.
6.  **Audio Processing:** Integrate the Web Audio API to process incoming audio streams and apply the 3D panning effect based on in-game coordinates.
7.  **UI Development:** Build out the UI using your chosen component library, connecting it to the state and logic.

Please proceed with this plan, ensuring the code is well-structured, commented where necessary, and handles errors gracefully (e.g., WebSocket disconnections, failed WebRTC connections).
