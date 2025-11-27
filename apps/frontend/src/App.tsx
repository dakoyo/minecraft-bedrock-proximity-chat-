import { useState, useEffect, useRef } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Copy, Check } from 'lucide-react'

function App() {
  const [view, setView] = useState<'home' | 'create' | 'join'>('home')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [playerName, setPlayerName] = useState<string | null>(null)
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
        setPlayerName(message.data.playerName)
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
                <div className="flex items-center space-x-2">
                  <Input
                    readOnly
                    value={roomCode ? `/connect localhost:3000/mcws/${roomCode}` : 'Loading...'}
                    className="font-mono text-xs md:text-sm"
                  />
                  <Button size="icon" variant="outline" onClick={copyCommand} disabled={!roomCode}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                {playerName ? (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                    <p className="text-green-600 font-medium">Connected as {playerName}</p>
                    <p className="text-xs text-muted-foreground mt-1">You can now use voice chat</p>
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground animate-pulse">
                    Waiting for Minecraft connection...
                  </div>
                )}

                <Button variant="ghost" className="w-full" onClick={() => {
                  wsRef.current?.close()
                  setView('home')
                  setRoomCode(null)
                  setPlayerName(null)
                }}>
                  Cancel
                </Button>
              </>
            )}
          </CardContent>
        </Card>
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
