import * as mc from "@minecraft/server";
import { btoa } from "./util/base64";
import { registerAllCommands } from "./commands/commands";

const { world, system } = mc;

system.beforeEvents.startup.subscribe(ev => {
    registerAllCommands(ev.customCommandRegistry);
})