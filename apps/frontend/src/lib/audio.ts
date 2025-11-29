import type { SimplifiedSyncData } from "@minecraft/proximity-vc";

export class AudioManager {
    private audioContext: AudioContext;
    private listener: AudioListener;
    private peers: Map<string, { panner?: PannerNode, gain: GainNode, source?: MediaStreamAudioSourceNode, audioElement?: HTMLAudioElement, playerName?: string }> = new Map();
    private destination: AudioDestinationNode;
    private voiceRange: number = 20; // Default voice range

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.listener = this.audioContext.listener;
        this.destination = this.audioContext.destination;

        // Ensure AudioContext is resumed (browser policy)
        if (this.audioContext.state === 'suspended') {
            const resume = () => {
                this.audioContext.resume();
                document.removeEventListener('click', resume);
                document.removeEventListener('keydown', resume);
            };
            document.addEventListener('click', resume);
            document.addEventListener('keydown', resume);
        }
    }

    setVoiceRange(range: number) {
        this.voiceRange = range;
        this.peers.forEach(peer => {
            if (peer.panner) {
                peer.panner.refDistance = 1; // Distance at which volume is 100%
                peer.panner.maxDistance = this.voiceRange;
            }
            // rolloffFactor determines how fast volume drops. 
            // linear: volume = 1 - (distance - refDistance) / (maxDistance - refDistance)
            // inverse: volume = refDistance / (refDistance + rolloffFactor * (distance - refDistance))
            // exponential: volume = (distance / refDistance) ^ (-rolloffFactor)

            // For game-like proximity, 'linear' is often easiest to predict, but 'inverse' is more realistic.
            // Let's stick to default 'inverse' or explicit 'linear' if we want hard cutoff.
            // Minecraft usually has a linear drop-off for voice chat mods.
            if (peer.panner) {
                peer.panner.distanceModel = 'linear';
            }
        });
    }

    updateListener(pos: [number, number, number], rot: [number, number]) {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Minecraft coordinates: X=East/West, Y=Up/Down, Z=North/South
        // Web Audio API: X=Right, Y=Up, Z=Back (Right-handed)
        // We need to map MC coords to Web Audio.
        // Usually: MC X -> Web X, MC Y -> Web Y, MC Z -> Web Z (but Z might need inversion depending on coordinate system)
        // Let's assume direct mapping for now and adjust if needed.

        const [x, y, z] = pos;

        // Update Listener Position
        if (this.listener.positionX) {
            this.listener.positionX.value = x;
            this.listener.positionY.value = y;
            this.listener.positionZ.value = z;
        } else {
            this.listener.setPosition(x, y, z);
        }

        // Update Listener Orientation
        // Minecraft Rotation: 
        // rot[0] (Pitch): -90 (up) to 90 (down)
        // rot[1] (Yaw): -180 to 180 (North is usually -180/180 or 0 depending on version)

        // Convert degrees to radians
        const pitchRad = rot[0] * (Math.PI / 180);
        const yawRad = rot[1] * (Math.PI / 180);

        // Calculate forward vector
        // x = -sin(yaw) * cos(pitch)
        // y = -sin(pitch)
        // z = cos(yaw) * cos(pitch)

        const forwardX = -Math.sin(yawRad) * Math.cos(pitchRad);
        const forwardY = -Math.sin(pitchRad);
        const forwardZ = Math.cos(yawRad) * Math.cos(pitchRad);

        const upX = 0;
        const upY = 1;
        const upZ = 0;

        if (this.listener.forwardX) {
            this.listener.forwardX.value = forwardX;
            this.listener.forwardY.value = forwardY;
            this.listener.forwardZ.value = forwardZ;
            this.listener.upX.value = upX;
            this.listener.upY.value = upY;
            this.listener.upZ.value = upZ;
        } else {
            this.listener.setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ);
        }
    }

    addPeer(peerId: string, stream: MediaStream) {
        if (this.peers.has(peerId)) return;

        const panner = this.audioContext.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'linear';
        panner.refDistance = 1;
        panner.maxDistance = this.voiceRange;
        panner.rolloffFactor = 1;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 0;
        panner.coneOuterGain = 0;

        const gain = this.audioContext.createGain();

        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(gain);
        gain.connect(panner);
        panner.connect(this.destination);

        this.peers.set(peerId, { panner, gain, source });
    }

    addStream(streamId: string, stream: MediaStream) {
        console.log(`[AudioManager] Adding stream ${streamId}`, {
            ctxState: this.audioContext.state,
            streamActive: stream.active,
            tracks: stream.getAudioTracks().length,
            trackEnabled: stream.getAudioTracks()[0]?.enabled
        });

        if (this.peers.has(streamId)) {
            console.warn(`[AudioManager] Stream ${streamId} already exists`);
            return;
        }

        // Hack: Create a muted audio element to force the browser to play the stream
        const audioElement = new Audio();
        audioElement.srcObject = stream;
        audioElement.muted = true;
        audioElement.volume = 0; // Double safety
        audioElement.autoplay = true;
        audioElement.play().catch(e => console.error(`[AudioManager] Failed to play hidden audio for ${streamId}`, e));

        const gain = this.audioContext.createGain();
        const source = this.audioContext.createMediaStreamSource(stream);

        // Initially connect as global (no panner)
        source.connect(gain);
        gain.connect(this.destination);

        this.peers.set(streamId, { gain, source, audioElement });
    }

    identifyPeer(streamId: string, playerName: string) {
        const peer = this.peers.get(streamId);
        if (!peer) {
            console.warn(`[AudioManager] Cannot identify stream ${streamId}: not found`);
            return;
        }

        if (peer.playerName === playerName) return; // Already identified

        console.log(`[AudioManager] Identifying stream ${streamId} as player ${playerName}`);
        peer.playerName = playerName;

        // Create Panner for spatial audio
        if (!peer.panner) {
            const panner = this.audioContext.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'linear';
            panner.refDistance = 1;
            panner.maxDistance = this.voiceRange;
            panner.rolloffFactor = 1;
            panner.coneInnerAngle = 360;
            panner.coneOuterAngle = 0;
            panner.coneOuterGain = 0;

            // Reconnect: Source -> Gain -> Panner -> Destination
            // Current: Source -> Gain -> Destination
            peer.gain.disconnect();
            peer.gain.connect(panner);
            panner.connect(this.destination);

            peer.panner = panner;
        }
    }

    removePeer(peerId: string) {
        const peer = this.peers.get(peerId);
        if (peer) {
            console.log(`[AudioManager] Removing peer ${peerId}`);
            peer.source?.disconnect();
            peer.gain.disconnect();
            peer.panner?.disconnect();
            if (peer.audioElement) {
                peer.audioElement.srcObject = null;
                peer.audioElement.pause();
            }
            this.peers.delete(peerId);
        }
    }

    updatePeerPosition(playerName: string, pos: [number, number, number]) {
        // Find all streams belonging to this player (could be multiple if they have multiple tabs/streams?)
        // Usually one, but let's iterate.
        this.peers.forEach(peer => {
            if (peer.playerName === playerName && peer.panner) {
                const [x, y, z] = pos;
                if (peer.panner.positionX) {
                    peer.panner.positionX.value = x;
                    peer.panner.positionY.value = y;
                    peer.panner.positionZ.value = z;
                } else {
                    peer.panner.setPosition(x, y, z);
                }
            }
        });
    }

    // Process sync data to update all peers
    processSyncData(data: SimplifiedSyncData, myPlayerName: string) {
        if (data.s) {
            this.setVoiceRange(data.s.voiceRange);
        }

        if (data.pl && data.pd) {
            data.pl.forEach((playerName, index) => {
                if (playerName === myPlayerName) {
                    // Update Listener (Me)
                    const playerData = data.pd[index];
                    if (playerData && playerData.length >= 2) {
                        const pos = playerData[0] as [number, number, number];
                        const rot = playerData[1] as [number, number];
                        this.updateListener(pos, rot);
                    }
                } else {
                    // Update Peer
                    const playerData = data.pd[index];
                    if (playerData && playerData.length >= 1) {
                        const pos = playerData[0] as [number, number, number];
                        this.updatePeerPosition(playerName, pos);
                    }
                }
            });
        }
    }
    // Expose methods for UI
    getAudioContextState() {
        return this.audioContext.state;
    }

    async resume() {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        return this.audioContext.state;
    }

    setMasterVolume(volume: number) {
        // We can control the destination gain if we had one, or just suspend/resume.
        // But suspending stops the microphone too if it's on the same context (usually not, but let's be safe).
        // Better to set gain on all peers.
        // Or better, create a master gain node.
        // For now, let's just iterate over peers and set their gain.
        this.peers.forEach(peer => {
            peer.gain.gain.value = volume;
            if (peer.audioElement) {
                peer.audioElement.muted = volume === 0;
            }
        });
    }

    dispose() {
        console.log('[AudioManager] Disposing...');
        this.peers.forEach(peer => {
            peer.source?.disconnect();
            peer.gain.disconnect();
            peer.panner?.disconnect();
            if (peer.audioElement) {
                peer.audioElement.srcObject = null;
                peer.audioElement.pause();
                peer.audioElement.remove();
            }
        });
        this.peers.clear();
        this.audioContext.close();
    }
}
