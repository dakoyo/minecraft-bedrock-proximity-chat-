import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Volume2, VolumeX } from 'lucide-react'

interface PlayerPanelProps {
  playerName: string
  volume: number
  onVolumeChange: (value: number) => void
  isOwner?: boolean
  status?: 'online' | 'offline'
}

export function PlayerPanel({ playerName, volume: initialVolume, onVolumeChange, isOwner = false, status = 'offline' }: PlayerPanelProps) {
  const [volume, setVolume] = useState(initialVolume)

  return (
    <Card className="w-full bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-medium text-center truncate" title={playerName}>
              {playerName}
            </CardTitle>
            {isOwner && <span className="px-2 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground rounded-full">Owner</span>}
          </div>
          <div className={`w-3 h-3 rounded-full ${status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-500'}`} title={status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span>Volume</span>
            </div>
            <span className="font-mono">{volume}%</span>
          </div>

          <div className="relative flex items-center w-full h-4">
            <input
              type="range"
              min="0"
              max="200"
              value={volume}
              onChange={(e) => {
                const val = Number(e.target.value)
                setVolume(val)
                onVolumeChange(val)
              }}
              className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
