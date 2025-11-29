import { PlayerPanel } from './PlayerPanel'

interface PlayerGridProps {
    players: string[]
    playerStatuses: Record<string, 'online' | 'offline'>
    onVolumeChange: (playerName: string, volume: number) => void
}

export function PlayerGrid({ players, playerStatuses, onVolumeChange }: PlayerGridProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full max-w-7xl mx-auto p-4">
            {players.map((player) => (
                <PlayerPanel
                    key={player}
                    playerName={player}
                    volume={100} // Default volume, maybe we should track state in App? Yes, better.
                    onVolumeChange={(vol) => onVolumeChange(player, vol)}
                    status={playerStatuses[player] || 'offline'}
                />
            ))}
        </div>
    )
}
