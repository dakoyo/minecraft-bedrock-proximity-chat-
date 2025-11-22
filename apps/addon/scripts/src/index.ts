import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
const { world, system } = mc;

import { registerCommands } from "./commands/command";

system.beforeEvents.startup.subscribe(ev => {
    registerCommands(ev.customCommandRegistry);
})