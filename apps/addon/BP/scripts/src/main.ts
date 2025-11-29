import * as mc from "@minecraft/server";
import { btoa } from "./util/base64";
import { registerAllCommands } from "./commands/commands";

const { world, system } = mc;

system.beforeEvents.startup.subscribe(ev => {
    registerAllCommands(ev.customCommandRegistry);
})

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const rot = player.getRotation();
        player.onScreenDisplay.setActionBar(`Rot: {x: ${Math.floor(rot.x)}, y: ${Math.floor(rot.y)}}`)
    }
})