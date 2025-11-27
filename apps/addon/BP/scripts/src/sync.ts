import * as mc from "@minecraft/server";
const { world } = mc;
import { SimplifiedSyncData } from "@minecraft/proximity-vc";
import { groupManager } from "./group";
import { debug } from "./setting";

type EventTypes = "playerUpdate" | "groupUpdate";

class SyncManager {
    constructor() { }
    events: EventTypes[] = [];

    addEvent(type: EventTypes) {
        this.events.push(type);
    }
    lastPlayerNumber: number = 0;

    clearEvents() {
        this.events = [];
    }

    getSyncData(getAll: boolean = false) {
        const data: SimplifiedSyncData = {
            g: [],
            pd: []
        };
        const groups = groupManager.getAllGroups();
        let players: (mc.Player | mc.Entity)[] = world.getPlayers();
        if (debug) {
            players = [...players, ...world.getDimension("overworld").getEntities({ type: "minecraft:armor_stand" })];
        }

        if (this.lastPlayerNumber !== players.length) {
            this.lastPlayerNumber = players.length;
            this.addEvent("playerUpdate");
        }

        if (getAll || this.events.includes("playerUpdate")) {
            data.pl = players.map(player => {
                if (player instanceof mc.Player) {
                    return player.name;
                } else {
                    return player.nameTag;
                }
            });
        }

        if (getAll || this.events.includes("groupUpdate")) {
            data.g = groups.map(group => ({
                t: group.type,
                n: group.name,
                p: group.password
            }))
        }

        this.clearEvents();

        for (const player of players) {
            const loc = player.location;
            const rot = player.getRotation();

            const playerData: number[][] = [];

            playerData.push([
                Math.round(loc.x * 10) / 10,
                Math.round(loc.y * 10) / 10,
                Math.round(loc.z * 10) / 10
            ])

            playerData.push([
                Math.round(rot.x),
                Math.round(rot.y)
            ])

            const playerGroupIndexes: number[] = []
            for (const group of groupManager.getGroupsByPlayer(player)) {
                const groupIndex = groups.findIndex(g => g.name === group.name);
                if (groupIndex !== -1) {
                    playerGroupIndexes.push(groupIndex);
                }
            }

            playerData.push(playerGroupIndexes);
            data.pd.push(playerData);
        }

        return data;
    }
}

// world.afterEvents.playerJoin.subscribe(ev => {
//     syncManager.addEvent("playerUpdate");
// })

// world.afterEvents.playerLeave.subscribe(ev => {
//     syncManager.addEvent("playerUpdate");
// })

// if (debug) {
//     world.afterEvents.entitySpawn.subscribe(ev => {
//         if (ev.entity.typeId === "minecraft:armor_stand") {
//             syncManager.addEvent("playerUpdate");
//         }
//     })

//     world.afterEvents.entityDie.subscribe(ev => {
//         if (ev.deadEntity.typeId === "minecraft:armor_stand") {
//             console.warn("TEST2")
//             syncManager.addEvent("playerUpdate");
//         }
//     })
// }

export const syncManager = new SyncManager();