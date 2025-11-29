import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card'
import { X, Mic, Speaker, Volume2, Volume1, Sparkles } from 'lucide-react'

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void

    inputDevices: MediaDeviceInfo[]
    outputDevices: MediaDeviceInfo[]

    selectedInputId: string
    selectedOutputId: string
    inputVolume: number
    outputVolume: number
    noiseSuppression: boolean

    onInputDeviceChange: (deviceId: string) => void
    onOutputDeviceChange: (deviceId: string) => void
    onInputVolumeChange: (volume: number) => void
    onOutputVolumeChange: (volume: number) => void
    onNoiseSuppressionChange: (enabled: boolean) => void
}

export function SettingsModal({
    isOpen,
    onClose,
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    inputVolume,
    outputVolume,
    noiseSuppression,
    onInputDeviceChange,
    onOutputDeviceChange,
    onInputVolumeChange,
    onOutputVolumeChange,
    onNoiseSuppressionChange
}: SettingsModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-lg shadow-2xl border-0 bg-white relative">
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
                    onClick={onClose}
                >
                    <X className="h-5 w-5" />
                </Button>

                <CardHeader>
                    <CardTitle className="text-2xl font-bold">Settings</CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Input Device */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <Mic className="h-4 w-4" /> Input Device
                        </label>
                        <select
                            className="w-full p-2 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            value={selectedInputId}
                            onChange={(e) => onInputDeviceChange(e.target.value)}
                        >
                            {inputDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Output Device */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <Speaker className="h-4 w-4" /> Output Device
                        </label>
                        <select
                            className="w-full p-2 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            value={selectedOutputId}
                            onChange={(e) => onOutputDeviceChange(e.target.value)}
                            disabled={outputDevices.length === 0}
                        >
                            {outputDevices.length === 0 && <option>Default (Browser Controlled)</option>}
                            {outputDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Speaker ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                        {outputDevices.length === 0 && (
                            <p className="text-xs text-slate-400">Output device selection is not supported in this browser.</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Input Volume */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Volume2 className="h-4 w-4" /> Input Volume
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={inputVolume * 100}
                                    onChange={(e) => onInputVolumeChange(Number(e.target.value) / 100)}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                                <span className="text-sm font-mono w-12 text-right">{Math.round(inputVolume * 100)}%</span>
                            </div>
                        </div>

                        {/* Output Volume */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Volume1 className="h-4 w-4" /> Output Volume
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={outputVolume * 100}
                                    onChange={(e) => onOutputVolumeChange(Number(e.target.value) / 100)}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                                <span className="text-sm font-mono w-12 text-right">{Math.round(outputVolume * 100)}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Noise Suppression */}
                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-purple-500" />
                                <div>
                                    Noise Suppression
                                    <p className="text-xs text-slate-400 font-normal">Powered by Shiguredo (WASM)</p>
                                </div>
                            </label>
                            <div
                                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${noiseSuppression ? 'bg-primary' : 'bg-slate-200'}`}
                                onClick={() => onNoiseSuppressionChange(!noiseSuppression)}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${noiseSuppression ? 'translate-x-6' : 'translate-x-0'}`} />
                            </div>
                        </div>
                    </div>

                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button onClick={onClose}>Done</Button>
                </CardFooter>
            </Card>
        </div>
    )
}
