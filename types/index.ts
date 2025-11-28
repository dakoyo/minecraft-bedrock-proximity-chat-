export interface GroupTypes {
    Normal: "Normal";
    Isorated: "Isorated";
    Open: "Open";
}

export interface VCSettings {
    voiceRange: number;
    canHearSpectator: boolean;
}

export interface SimplifiedGroupTypes {
    Normal: "n";
    Isorated: "i";
    Open: "o";
}

export interface GroupData {
    type: keyof GroupTypes;
    name: string;
    password: string;
}

export interface SimplifiedGroupData {
    t: keyof SimplifiedGroupTypes;
    n: string; // Group Name
    p: string; // Group Password
}

export interface SimplifiedSyncMessage {
    s: number; // sequence number
    d: string; // base64 SimplifiedSyncData
}

export interface SimplifiedSyncData {
    g: SimplifiedGroupData[]; // groups
    pl?: string[] // player names
    s?: VCSettings // settings
    pd: number[][][] // player data
}

export type ServerMessageTypes = "sync" | "playerjoin" | "playerleave";

export interface ServerMessage {
    type: ServerMessageTypes;
    data: any;
}