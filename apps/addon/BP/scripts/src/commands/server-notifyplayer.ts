import * as mc from "@minecraft/server";
const { world, system } = mc;

export const command: mc.CustomCommand = {
    name: "vcserver:notifyplayer",
    description: "notifies the player of the room code",
    permissionLevel: mc.CommandPermissionLevel.GameDirectors,
    mandatoryParameters: [
        {
            name: "playerName",
            type: mc.CustomCommandParamType.String
        },
        {
            name: "roomId",
            type: mc.CustomCommandParamType.String
        },
        {
            name: "playerCode",
            type: mc.CustomCommandParamType.String
        }
    ]
}

export function execute(ev: mc.CustomCommandOrigin, ...args: any[]): mc.CustomCommandResult {

    system.run(() => {
        const player = world.getPlayers({ name: args[0] })[0];
        if (!player) {
            return;
        }
        player.sendMessage(`Room ID: ${args[1]}\nPlayer Code: ${args[2]}`);
    })

    return {
        status: mc.CustomCommandStatus.Success
    }
}