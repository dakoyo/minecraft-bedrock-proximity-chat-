import * as mc from "@minecraft/server";
const { world, system } = mc;
import { SyncManager } from "../syncManager";
const syncManager = new SyncManager();

world.afterEvents.playerSpawn.subscribe(ev => {
    syncManager.addEvent("join", ev.player, { dim: ev.player.dimension.id });
});

world.afterEvents.playerLeave.subscribe(ev => {
    syncManager.addEvent("leave", { name: ev.playerId } as any);
});

const lastPosMap = new Map<string, string>();

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        const loc = player.location;
        const rot = player.getRotation();

        const posKey = `${loc.x.toFixed(1)},${loc.y.toFixed(1)},${loc.z.toFixed(1)},${rot.x.toFixed(0)},${rot.y.toFixed(0)}`;

        if (lastPosMap.get(player.name) !== posKey) {
            lastPosMap.set(player.name, posKey);

            syncManager.addEvent("move", player, {
                x: Math.round(loc.x * 100) / 100,
                y: Math.round(loc.y * 100) / 100,
                z: Math.round(loc.z * 100) / 100,
                rx: Math.round(rot.x * 100) / 100,
                ry: Math.round(rot.y * 100) / 100
            });
        }
    }
}, 2);

export const command: mc.CustomCommand = {
    name: "vc:sync",
    description: "test",
    permissionLevel: mc.CommandPermissionLevel.GameDirectors
}

export function callback(origin: mc.CustomCommandOrigin, ...args: any[]): mc.CustomCommandResult {
    const lastSeq = parseInt(args[0]) || -1;
    const result = syncManager.getEventsSince(lastSeq);

    return {
        message: JSON.stringify(result),
        status: mc.CustomCommandStatus.Success
    };
}