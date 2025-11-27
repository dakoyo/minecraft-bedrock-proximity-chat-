import { useState, useEffect, useRef } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card'
import { PlayerGrid } from './components/PlayerGrid'
import { ControlBar } from './components/ControlBar'
import { Copy, Check } from 'lucide-react'

function App() {
  const [view, setView] = useState<'home' | 'create' | 'join' | 'connected'>('home')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [players, setPlayers] = useState<string[]>([])
  const [myPlayerName, setMyPlayerName] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Join Room State
  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinPlayerCode, setJoinPlayerCode] = useState('')

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  // Transition to connected view when players join
  useEffect(() => {
    if (players.length > 0 && view === 'create') {
      setView('connected')
    }
  }, [players, view])

  const createRoom = () => {
    setView('create')
    const ws = new WebSocket('ws://localhost:3000/frontendws')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Connected to backend')
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.code) {
        setRoomCode(message.code)
      } else if (message.type === 'playerJoin') {
        const newPlayer = message.data.playerName
        setMyPlayerName((prev) => prev || newPlayer) // First player is likely self in this simple implementation
        setPlayers((prev) => {
          if (prev.includes(newPlayer)) return prev
          return [...prev, newPlayer]
        })
      } else if (message.type === 'playerLeave') {
        const leavingPlayer = message.data.playerName
        setPlayers((prev) => prev.filter(p => p !== leavingPlayer))
      }
    }

    ws.onclose = () => {
      console.log('Disconnected')
      setIsConnected(false)
    }
  }

  const copyCommand = () => {
    if (roomCode) {
      navigator.clipboard.writeText(`/connect localhost:3000/mcws/${roomCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDisconnect = () => {
    wsRef.current?.close()
    setView('home')
    setRoomCode(null)
    setPlayers([])
    setMyPlayerName(null)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {view === 'home' && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Minecraft Proximity VC</CardTitle>
            <CardDescription className="text-center">Select an option to get started</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button size="lg" onClick={createRoom}>Create Room</Button>
            <Button variant="outline" size="lg" onClick={() => setView('join')}>Join Room</Button>
          </CardContent>
        </Card>
      )}

      {view === 'create' && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Create Room</CardTitle>
            <CardDescription>Run this command in Minecraft to connect</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isConnected ? (
              <div className="text-center text-muted-foreground">Connecting to server...</div>
            ) : (
              <>
                <div className="flex items-center space-x-2 justify-center mb-6">
                  <Input
                    readOnly
                    value={roomCode ? `/connect localhost:3000/mcws/${roomCode}` : 'Loading...'}
                    className="font-mono text-xs md:text-sm max-w-[300px]"
                  />
                  <Button size="icon" variant="outline" onClick={copyCommand} disabled={!roomCode}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="text-center text-sm text-muted-foreground animate-pulse py-12">
                  Waiting for players to join...
                </div>

                <Button variant="ghost" className="w-full" onClick={handleDisconnect}>
                  Cancel
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {view === 'connected' && (
        <div className="w-full h-full flex flex-col items-center justify-center pb-20">
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Connected</h2>
            <p className="text-muted-foreground">Room Code: <span className="font-mono">{roomCode}</span></p>
          </div>

          <PlayerGrid players={players.filter(p => p !== myPlayerName)} />

          {myPlayerName && (
            <ControlBar
              playerName={myPlayerName}
              onDisconnect={handleDisconnect}
            />
          )}

          {/* Debug Buttons - To be removed */}
          <div className="flex gap-2 mt-8">
            <Button
              variant="outline"
              className="border-dashed border-yellow-500 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50"
              onClick={() => {
                const fakeName = `Player${Math.floor(Math.random() * 1000)}`
                setPlayers(prev => [...prev, fakeName])
              }}
            >
              [Debug] + Join
            </Button>
            <Button
              variant="outline"
              className="border-dashed border-red-500 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => {
                setPlayers(prev => {
                  if (prev.length === 0) return prev
                  const newPlayers = [...prev]
                  newPlayers.pop()
                  return newPlayers
                })
              }}
            >
              [Debug] - Leave
            </Button>
          </div>
        </div>
      )}

      {view === 'join' && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Join Room</CardTitle>
            <CardDescription>Enter the room details provided by the host</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Room ID</label>
              <Input
                placeholder="Enter Room ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Player Code</label>
              <Input
                placeholder="Enter Player Code"
                value={joinPlayerCode}
                onChange={(e) => setJoinPlayerCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 pt-4">
              <Button disabled={!joinRoomId || !joinPlayerCode}>Join</Button>
              <Button variant="ghost" onClick={() => setView('home')}>Back</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default App
