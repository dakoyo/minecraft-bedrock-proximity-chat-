import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Volume2, VolumeX } from 'lucide-react'

interface PlayerPanelProps {
  playerName: string
}

export function PlayerPanel({ playerName }: PlayerPanelProps) {
  const [volume, setVolume] = useState(100)

  return (
    <Card className="w-full bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium text-center truncate" title={playerName}>
          {playerName}
        </CardTitle>
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
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
