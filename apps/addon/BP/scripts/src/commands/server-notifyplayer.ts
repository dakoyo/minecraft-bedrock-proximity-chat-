import * as mc from "@minecraft/server";
import { debug } from "../setting";
import { ActionFormData } from "@minecraft/server-ui";
const { world, system } = mc;

export const command: mc.CustomCommand = {
    name: "vc:notifyplayer",
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
        if (debug) world.sendMessage(`Name: ${args[0]}\n   Room ID: ${args[1]}\n    Player Code: ${args[2]}`);

        const player = world.getPlayers({ name: args[0] })[0];
        if (!player) {
            return;
        }

        const form = new ActionFormData();
        form.title("Proximity Voice Chat");
        form.body([
            "Room ID: §a" + args[1],
            "Player Code: §a" + args[2]
        ].join("§r\n"));
        form.button("§aOK");
        form.show(player).then(r => {
            player.sendMessage([
                "§l====================",
                "§aProximity Voice Chat",
                "§7Room ID: §a" + args[1],
                "§7Player Code: §a" + args[2],
                "§l===================="
            ].join("§r\n"))
        })
    })

    return {
        status: mc.CustomCommandStatus.Success
    }
}