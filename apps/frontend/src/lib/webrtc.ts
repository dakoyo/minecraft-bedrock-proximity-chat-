import { AudioManager } from "./audio";

export class WebRTCManager {
    private peerConnections: Map<string, RTCPeerConnection> = new Map();
    private localStream: MediaStream | null = null;
    private audioManager: AudioManager;
    private ws: WebSocket;
    private onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;


    constructor(audioManager: AudioManager, ws: WebSocket, onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void) {
        this.audioManager = audioManager;
        this.ws = ws;
        this.onConnectionStateChange = onConnectionStateChange;
    }

    async initLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (e) {
            console.error("Failed to get user media", e);
        }
    }

    async setupPeerConnection(targetPeerId: string) {
        if (this.peerConnections.has(targetPeerId)) return this.peerConnections.get(targetPeerId)!;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.peerConnections.set(targetPeerId, pc);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!);
            });
        }

        pc.ontrack = (event) => {
            console.log(`Received remote track from ${targetPeerId}`);
            if (event.streams && event.streams[0]) {
                this.audioManager.addPeer(targetPeerId, event.streams[0]);
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
                    type: 'signal',
                    target: targetPeerId === 'owner' ? 'owner' : targetPeerId,
                    payload: { candidate: event.candidate }
                }));
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${targetPeerId}: ${pc.connectionState}`);

            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(targetPeerId, pc.connectionState);
            }

            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.audioManager.removePeer(targetPeerId);
                this.peerConnections.delete(targetPeerId);
            }
        };

        return pc;
    }

    async handleSignal(sender: string, payload: any) {
        const targetId = sender === 'owner' ? 'owner' : sender;
        let pc = this.peerConnections.get(targetId);

        if (!pc && payload.type === 'offer') {
            pc = await this.setupPeerConnection(targetId);
        }

        if (!pc) return;

        try {
            if (payload.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this.ws.send(JSON.stringify({
                    type: 'signal',
                    target: sender,
                    payload: answer
                }));
            } else if (payload.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload));
            } else if (payload.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        } catch (e) {
            console.error("Error handling signal", e);
        }
    }

    cleanup() {
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
    }
}
