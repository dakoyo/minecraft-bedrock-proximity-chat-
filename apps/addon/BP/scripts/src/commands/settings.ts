import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui"
import { defaultSettings, getSetting, setSetting, SliderSetting, ToggleSetting } from "../setting";
import { syncManager } from "../sync";
const { world, system } = mc;

export const command: mc.CustomCommand = {
    name: "vc:settings",
    description: "Changes the settings of the addon",
    permissionLevel: mc.CommandPermissionLevel.GameDirectors,
}

export function execute(ev: mc.CustomCommandOrigin, ...args: any[]): mc.CustomCommandResult {
    const player = ev.sourceEntity;
    if (!(player instanceof mc.Player)) return {
        status: mc.CustomCommandStatus.Failure
    }

    system.run(() => {
        const modal = new ui.ModalFormData()
            .title("Settings")
            .submitButton("Save")

        for (const settingId in defaultSettings) {
            const setting = defaultSettings[settingId as keyof typeof defaultSettings] as SliderSetting | ToggleSetting;
            const currentValue = getSetting(settingId as keyof typeof defaultSettings);
            switch (setting.type) {
                case "slider":
                    modal.slider(setting.name, setting.min, setting.max, {
                        defaultValue: currentValue as number,
                        valueStep: setting.step
                    });
                    break;
                case "toggle":
                    modal.toggle(setting.name, {
                        defaultValue: currentValue as boolean
                    });
                    break;
            }
        }

        modal.show(player).then((result) => {
            if (result.canceled) return;
            if (!result.formValues) return;

            for (let i = 0; i < result.formValues.length; i++) {
                const settingId = Object.keys(defaultSettings)[i];
                setSetting(settingId as keyof typeof defaultSettings, result.formValues[i] as number | boolean);
            }
            syncManager.addEvent("settingsUpdate");
        })


    })
    return {
        status: mc.CustomCommandStatus.Success
    }
}