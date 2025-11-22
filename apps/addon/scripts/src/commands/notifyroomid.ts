import * as mc from "@minecraft/server";
const { world, system } = mc;

export const command: mc.CustomCommand = {
    name: "vc:notifyroomid",
    description: "Notify room ID",
    mandatoryParameters: [
        {
            "name": "roomid",
            "type": mc.CustomCommandParamType.String,
        }
    ],
    permissionLevel: mc.CommandPermissionLevel.GameDirectors
}

export function callback(origin: mc.CustomCommandOrigin, ...args: any[]): mc.CustomCommandResult {
    world.sendMessage(`ルームID: §a${args[0]}§r`)

    return {
        status: mc.CustomCommandStatus.Success
    };
}