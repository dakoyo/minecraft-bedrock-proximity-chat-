import { PlayerPanel } from './PlayerPanel'

interface PlayerGridProps {
    players: string[]
}

export function PlayerGrid({ players }: PlayerGridProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-6xl p-4">
            {players.map((player) => (
                <PlayerPanel key={player} playerName={player} />
            ))}
        </div>
    )
}
