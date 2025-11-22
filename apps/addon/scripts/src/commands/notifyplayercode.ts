import * as mc from "@minecraft/server";
const { world, system } = mc;

export const command: mc.CustomCommand = {
    name: "vc:notifyplayercode",
    description: "Notify player code",
    mandatoryParameters: [
        {
            "name": "playername",
            "type": mc.CustomCommandParamType.String,
        },
        {
            "name": "playercode",
            "type": mc.CustomCommandParamType.String,
        }
    ],
    permissionLevel: mc.CommandPermissionLevel.GameDirectors
}

export function callback(origin: mc.CustomCommandOrigin, ...args: any[]): mc.CustomCommandResult {
    const player = world.getPlayers().find(p => p.name === args[0])

    if (player) player.sendMessage(`コード: §a${args[1]}§r`)

    return {
        status: mc.CustomCommandStatus.Success
    };
}