import { useState } from 'react'
import { Button } from './ui/button'
import { Mic, MicOff, Headphones, PhoneOff } from 'lucide-react'

interface ControlBarProps {
    playerName: string
    onDisconnect: () => void
}

export function ControlBar({ playerName, onDisconnect }: ControlBarProps) {
    const [isMuted, setIsMuted] = useState(false)
    const [isDeafened, setIsDeafened] = useState(false)

    return (
        <div className="fixed bottom-0 left-0 right-0 h-20 bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)] flex items-center justify-between px-8 z-50">
            <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {playerName.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{playerName}</span>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant={isMuted ? "destructive" : "secondary"}
                    size="icon"
                    onClick={() => setIsMuted(!isMuted)}
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                <Button
                    variant={isDeafened ? "destructive" : "secondary"}
                    size="icon"
                    onClick={() => setIsDeafened(!isDeafened)}
                    title={isDeafened ? "Undeafen" : "Deafen"}
                >
                    {isDeafened ? <Headphones className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
                </Button>

                <div className="h-8 w-px bg-border mx-2" />

                <Button
                    variant="destructive"
                    size="icon"
                    onClick={onDisconnect}
                    title="Disconnect"
                >
                    <PhoneOff className="h-5 w-5" />
                </Button>
            </div>
        </div>
    )
}
