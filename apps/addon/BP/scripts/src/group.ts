import { Entity, Player, world } from "@minecraft/server";
import { GroupData, GroupTypes } from "@minecraft/proximity-vc";

class GroupManager {
    constructor() { }

    createGroup(name: string, type: keyof GroupTypes, password: string): GroupData {
        const groupData: GroupData = {
            name,
            type,
            password
        }

        world.setDynamicProperty(`vc_group_${name}`, JSON.stringify(groupData));

        return groupData
    }

    getGroup(name: string): GroupData | null {
        const groupData = world.getDynamicProperty(`vc_group_${name}`);
        if (!groupData) return null;
        return JSON.parse(groupData as string) as GroupData;
    }

    deleteGroup(name: string) {
        world.setDynamicProperty(`vc_group_${name}`, undefined);
    }

    getAllGroups(): GroupData[] {
        const groups: GroupData[] = [];
        for (const group of world.getDynamicPropertyIds()) {
            if (group.startsWith("vc_group_")) {
                groups.push(JSON.parse(world.getDynamicProperty(group) as string) as GroupData);
            }
        }
        return groups;
    }

    getGroupsByPlayer(player: Player | Entity): GroupData[] {
        const groups: GroupData[] = [];
        for (const group of this.getAllGroups()) {
            if (player.hasTag(`vc_group_${group.name}`)) {
                groups.push(group);
            }
        }
        return groups;
    }
}

world.afterEvents.playerSpawn.subscribe(ev => {
    const { initialSpawn, player } = ev;
    if (initialSpawn) {
        for (const tag of player.getTags()) {
            if (tag.startsWith("vc_group_")) {
                player.removeTag(tag);
            }
        }
    }
})

export const groupManager = new GroupManager();