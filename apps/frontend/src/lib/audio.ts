import type { SimplifiedSyncData } from "@minecraft/proximity-vc";

export class AudioManager {
    private audioContext: AudioContext;
    private listener: AudioListener;
    private peers: Map<string, { panner: PannerNode, gain: GainNode, source?: MediaStreamAudioSourceNode }> = new Map();
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
            peer.panner.refDistance = 1; // Distance at which volume is 100%
            peer.panner.maxDistance = this.voiceRange;
            // rolloffFactor determines how fast volume drops. 
            // linear: volume = 1 - (distance - refDistance) / (maxDistance - refDistance)
            // inverse: volume = refDistance / (refDistance + rolloffFactor * (distance - refDistance))
            // exponential: volume = (distance / refDistance) ^ (-rolloffFactor)

            // For game-like proximity, 'linear' is often easiest to predict, but 'inverse' is more realistic.
            // Let's stick to default 'inverse' or explicit 'linear' if we want hard cutoff.
            // Minecraft usually has a linear drop-off for voice chat mods.
            peer.panner.distanceModel = 'linear';
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
        const pitch = rot[0] * (Math.PI / 180);
        const yaw = rot[1] * (Math.PI / 180);

        // Calculate forward vector
        // Assuming standard math:
        // x = -sin(yaw) * cos(pitch)
        // y = -sin(pitch)
        // z = cos(yaw) * cos(pitch)

        // Minecraft Yaw: 0 = South (+Z), 90 = West (-X), 180 = North (-Z), -90 = East (+X)
        // This varies, but let's try standard conversion first.

        const forwardX = -Math.sin(yaw * (Math.PI / 180)) * Math.cos(pitch * (Math.PI / 180));
        const forwardY = -Math.sin(pitch * (Math.PI / 180));
        const forwardZ = Math.cos(yaw * (Math.PI / 180)) * Math.cos(pitch * (Math.PI / 180));

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

    removePeer(peerId: string) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.source?.disconnect();
            peer.gain.disconnect();
            peer.panner.disconnect();
            this.peers.delete(peerId);
        }
    }

    updatePeerPosition(peerId: string, pos: [number, number, number]) {
        const peer = this.peers.get(peerId);
        if (peer) {
            const [x, y, z] = pos;
            if (peer.panner.positionX) {
                peer.panner.positionX.value = x;
                peer.panner.positionY.value = y;
                peer.panner.positionZ.value = z;
            } else {
                peer.panner.setPosition(x, y, z);
            }
        }
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
}
