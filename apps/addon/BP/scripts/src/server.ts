import { SimplifiedSyncData, SimplifiedSyncMessage } from "@minecraft/proximity-vc";

class Server {
    sequenceNumber: number = 0;
    data: SimplifiedSyncData = {
        g: [],
        pl: [],
        pd: []
    };
    isConnected: boolean = false;

    constructor() { }
}

export const server = new Server();