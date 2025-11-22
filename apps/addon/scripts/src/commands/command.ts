import { CustomCommandRegistry, system } from "@minecraft/server";
import * as sync from "./sync"

export function registerCommands(customCommandRegistry: CustomCommandRegistry) {
    customCommandRegistry.registerCommand(sync.command, sync.callback)
}