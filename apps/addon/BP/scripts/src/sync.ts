import { world } from "@minecraft/server";
import { SimplifiedSyncData } from "@minecraft/proximity-vc";
import { groupManager } from "./group";

type EventTypes = "playerUpdate" | "groupUpdate";

class SyncManager {
    constructor() { }
    events: EventTypes[] = [];

    addEvent(type: EventTypes) {
        this.events.push(type);
    }

    clearEvents() {
        this.events = [];
    }

    getSyncData(getAll: boolean = false) {
        const data: SimplifiedSyncData = {
            g: [],
            pd: []
        };
        const groups = groupManager.getAllGroups();
        const players = world.getPlayers();

        if (getAll || this.events.includes("playerUpdate")) {
            data.pl = players.map(player => player.name);
        }

        if (getAll || this.events.includes("groupUpdate")) {
            data.g = groups.map(group => ({
                t: group.type,
                n: group.name,
                p: group.password
            }))
        }

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

export const syncManager = new SyncManager();