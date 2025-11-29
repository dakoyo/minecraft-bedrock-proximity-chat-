import { world } from "@minecraft/server";

export const debug = false;

export const defaultSettings = {
    voiceRange: {
        type: "slider",
        name: "Voice Range",
        value: 10,
        min: 1,
        max: 100,
        step: 1
    },
    canHearSpectator: {
        type: "toggle",
        name: "Can Hear Spectator",
        value: false
    }
}

export interface SliderSetting {
    type: "slider",
    name: string,
    value: number,
    min: number,
    max: number,
    step: number
}

export interface ToggleSetting {
    type: "toggle",
    name: string,
    value: boolean
}

world.afterEvents.worldLoad.subscribe(() => {
    if (!world.getDynamicProperty("vc_settings")) {
        resetSettings();
    }
})

export function resetSettings() {
    const settings = Object.keys(defaultSettings).map(s => defaultSettings[s as keyof typeof defaultSettings].value);
    world.setDynamicProperty("vc_settings", JSON.stringify(settings));
}

export function getSetting(key: keyof typeof defaultSettings) {
    const settings = JSON.parse(world.getDynamicProperty("vc_settings") as string) as (string | number | boolean)[];
    const settingIndex = Object.keys(defaultSettings).indexOf(key as string);
    if (settingIndex === -1) {
        throw new Error("Setting not found");
    }
    return settings[settingIndex];
}

export function setSetting(key: keyof typeof defaultSettings, value: typeof defaultSettings[keyof typeof defaultSettings]["value"]) {
    const settings = JSON.parse(world.getDynamicProperty("vc_settings") as string) as (string | number | boolean)[];
    const settingIndex = Object.keys(defaultSettings).indexOf(key as string);
    if (settingIndex === -1) {
        throw new Error("Setting not found");
    }
    settings[settingIndex] = value;
    world.setDynamicProperty("vc_settings", JSON.stringify(settings));
}