import * as mc from "@minecraft/server";
import { server } from "../server";
import { syncManager } from "../sync";
import { btoa } from "../util/base64";
import { SimplifiedSyncMessage } from "@minecraft/proximity-vc";

export const command: mc.CustomCommand = {
    name: "vcserver:sync",
    description: "Syncs the server with the addon",
    permissionLevel: mc.CommandPermissionLevel.GameDirectors,
    optionalParameters: [
        {
            name: "sync",
            type: mc.CustomCommandParamType.Boolean
        }
    ]
}

export function execute(ev: mc.CustomCommandOrigin, ...args: any[]): mc.CustomCommandResult {
    server.isConnected = true;
    if (args[0] === true) {
        server.sequenceNumber = 0;
    }

    const message: SimplifiedSyncMessage = {
        s: server.sequenceNumber,
        d: btoa(JSON.stringify(syncManager.getSyncData(args[0] as boolean)))
    }
    server.sequenceNumber++;

    return {
        message: JSON.stringify(message),
        status: mc.CustomCommandStatus.Success
    }
}