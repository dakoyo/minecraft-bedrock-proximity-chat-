import * as mc from "@minecraft/server";
import * as serverSync from "./server-sync";
import * as notifyPlayer from "./server-notifyplayer";
import * as settings from "./settings";

export function registerAllCommands(customCommandRegistry: mc.CustomCommandRegistry) {
    customCommandRegistry.registerCommand(serverSync.command, serverSync.execute);
    customCommandRegistry.registerCommand(notifyPlayer.command, notifyPlayer.execute);
    customCommandRegistry.registerCommand(settings.command, settings.execute);
}