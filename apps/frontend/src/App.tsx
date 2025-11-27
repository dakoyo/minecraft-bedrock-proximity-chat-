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
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, 'online' | 'offline'>>({})
  const [playerCodes, setPlayerCodes] = useState<Record<string, string>>({}) // Code -> Name (Owner only)
  const wsRef = useRef<WebSocket | null>(null)

  // Join Room State
  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinPlayerCode, setJoinPlayerCode] = useState('')

  // WebRTC State
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map())

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      peerConnections.current.forEach(pc => pc.close())
      peerConnections.current.clear()
      dataChannels.current.forEach(dc => dc.close())
      dataChannels.current.clear()
    }
  }, [])

  // Transition to connected view when players join
  useEffect(() => {
    if (players.length > 0 && view === 'create') {
      setView('connected')
    }
  }, [players, view])

  // Broadcast updates whenever players or statuses change
  useEffect(() => {
    if (players.length > 0) {
      broadcastPlayers(players, playerStatuses)
    }
  }, [players, playerStatuses])

  const broadcastPlayers = (currentPlayers: string[], currentStatuses: Record<string, 'online' | 'offline'>) => {
    const message = JSON.stringify({ type: 'update', players: currentPlayers, statuses: currentStatuses })
    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') {
        dc.send(message)
      }
    })
  }

  const setupPeerConnection = async (targetPeerId: string, isInitiator: boolean, ws: WebSocket) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    peerConnections.current.set(targetPeerId, pc)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(JSON.stringify({
          type: 'signal',
          target: targetPeerId === 'owner' ? 'owner' : targetPeerId,
          payload: { candidate: event.candidate }
        }))
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${targetPeerId}: ${pc.connectionState}`)
      if (targetPeerId === 'owner') {
        // Peer side: Update Owner status? 
        // Actually, Peer just receives statuses from Owner.
        // But if Owner disconnects, maybe mark everyone offline?
      } else {
        // Owner side: Update Peer status
        setPlayerCodes(prevCodes => {
          const playerName = prevCodes[targetPeerId]
          if (playerName) {
            setPlayerStatuses(prevStatuses => {
              const newStatuses = {
                ...prevStatuses,
                [playerName]: (pc.connectionState === 'connected' ? 'online' : 'offline') as 'online' | 'offline'
              }
              // Need to broadcast this update, but we are inside a callback.
              // We can't easily access the latest 'players' state here without a ref or functional update side-effect.
              // A simple way is to trigger a broadcast in a useEffect dependent on playerStatuses.
              return newStatuses
            })
          }
          return prevCodes
        })
      }
    }

    if (isInitiator) {
      // Peer creates DataChannel
      const dc = pc.createDataChannel('sync')
      dc.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'update') {
          setPlayers(msg.players)
          setPlayerStatuses(msg.statuses || {})
        }
      }
    } else {
      // Owner receives DataChannel
      pc.ondatachannel = (event) => {
        const dc = event.channel
        dataChannels.current.set(targetPeerId, dc)
        // Send initial state immediately
        setPlayers(prev => {
          // We need statuses too. Using functional update to access latest.
          setPlayerStatuses(prevStatuses => {
            dc.send(JSON.stringify({ type: 'update', players: prev, statuses: prevStatuses }))
            return prevStatuses
          })
          return prev
        })
      }
    }

    return pc
  }

  const handleSignal = async (ws: WebSocket, sender: string, payload: any) => {
    const targetId = sender === 'owner' ? 'owner' : sender

    let pc = peerConnections.current.get(targetId)

    // If no PC yet and we received an Offer (we are Owner)
    if (!pc && payload.type === 'offer') {
      pc = await setupPeerConnection(targetId, false, ws) // false = not initiator of DC (Peer does it)
    } else if (!pc && sender === 'owner') {
      // We are Peer, receiving answer/candidate from Owner. PC should exist if we initiated.
      // If not, something is wrong or we are doing Owner initiates?
      // Let's assume Peer initiates.
      return
    }

    if (!pc) return

    if (payload.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      ws.send(JSON.stringify({
        type: 'signal',
        target: sender,
        payload: answer
      }))
    } else if (payload.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload))
    } else if (payload.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
    }
  }

  const createRoom = () => {
    setView('create')
    const ws = new WebSocket('ws://localhost:3000/frontendws')
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Connected to backend')
      setIsConnected(true)
    }

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      if (message.code) {
        setRoomCode(message.code)
      } else if (message.type === 'playerJoin') {
        const newPlayer: string = message.data.playerName
        const newPlayerCode: string = message.data.playerCode
        setMyPlayerName((prev) => prev || newPlayer)

        // Update Player Codes (Owner only)
        if (newPlayerCode) {
          setPlayerCodes(prev => ({ ...prev, [newPlayerCode]: newPlayer }))
        }

        setPlayers((prev) => {
          if (prev.includes(newPlayer)) return prev
          const updated = [...prev, newPlayer]
          // Broadcast with current statuses (using functional update in setPlayerStatuses would be better but complex here)
          // We will trigger broadcast via useEffect or just pass current statuses
          // For now, let's just pass the current state + default for new player
          setPlayerStatuses(prevStatuses => {
            const updatedStatuses: Record<string, 'online' | 'offline'> = { ...prevStatuses, [newPlayer]: 'offline' }
            if (prev.length === 0) { // If it's the first player (Owner), mark online
              updatedStatuses[newPlayer] = 'online'
            }
            return updatedStatuses
          })
          return updated
        })
      } else if (message.type === 'playerLeave') {
        const leavingPlayer = message.data.playerName
        setPlayers((prev) => {
          const updated = prev.filter(p => p !== leavingPlayer)
          setPlayerStatuses(prevStatuses => {
            const updatedStatuses = { ...prevStatuses }
            delete updatedStatuses[leavingPlayer]
            return updatedStatuses
          })
          return updated
        })
      } else if (message.type === 'signal') {
        await handleSignal(ws, message.sender, message.payload)
      }
    }

    ws.onclose = () => {
      console.log('Disconnected')
      setIsConnected(false)
    }
  }

  const joinRoom = () => {
    const rId = joinRoomId.trim()
    const pCode = joinPlayerCode.trim()
    if (!rId || !pCode) return

    // Peer Connection
    const ws = new WebSocket(`ws://localhost:3000/frontendws?roomId=${rId}&playerCode=${pCode}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Connected to backend as peer')
    }

    ws.onclose = (event) => {
      console.log('Peer connection closed', event.code, event.reason)
      alert(`Connection failed: ${event.reason || 'Unknown error'}`)
    }

    ws.onmessage = async (event) => {
      console.log('Peer received message:', event.data)
      const message = JSON.parse(event.data)
      if (message.type === 'joinResponse') {
        setMyPlayerName(message.data.playerName)
        setRoomCode(message.data.roomId)
        setView('connected')

        // Initiate WebRTC connection to Owner
        const pc = await setupPeerConnection('owner', true, ws) // true = initiator
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        ws.send(JSON.stringify({
          type: 'signal',
          target: 'owner', // Backend handles routing to owner
          payload: offer
        }))

      } else if (message.type === 'signal') {
        await handleSignal(ws, message.sender, message.payload)
      }
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
    if (wsRef.current) {
      wsRef.current.close()
    }
    setView('home')
    setRoomCode(null)
    setPlayers([])
    setPlayerStatuses({})
    setPlayerCodes({})
    setIsConnected(false)
    setMyPlayerName(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center p-4">
      {view === 'home' && (
        <Card className="w-full max-w-md bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              Proximity Chat
            </CardTitle>
            <CardDescription className="text-center text-lg">
              Minecraft Bedrock Edition
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full h-12 text-lg font-medium transition-all hover:scale-[1.02]" onClick={createRoom}>
              Create Room
            </Button>
            <Button variant="secondary" className="w-full h-12 text-lg font-medium transition-all hover:scale-[1.02]" onClick={() => setView('join')}>
              Join Room
            </Button>
          </CardContent>
        </Card>
      )}

      {view === 'create' && (
        <Card className="w-full max-w-md bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle>Create Room</CardTitle>
            <CardDescription>Run this command in Minecraft to connect</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-black/40 rounded-lg border border-primary/20 relative group">
              <code className="text-primary font-mono text-sm break-all">
                /connect localhost:3000/mcws/{roomCode || '...'}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={copyCommand}
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                {isConnected ? 'Waiting for Minecraft connection...' : 'Connecting to server...'}
              </div>
            </div>

            <Button variant="ghost" className="w-full" onClick={handleDisconnect}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {view === 'join' && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Join Room</CardTitle>
            <CardDescription>Enter the Room ID and your Player Code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="roomId" className="text-sm font-medium">Room ID</label>
              <Input
                id="roomId"
                placeholder="Enter Room ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="playerCode" className="text-sm font-medium">Player Code</label>
              <Input
                id="playerCode"
                placeholder="Enter Player Code"
                value={joinPlayerCode}
                onChange={(e) => setJoinPlayerCode(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={joinRoom} disabled={!joinRoomId || !joinPlayerCode}>
              Join Room
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setView('home')}>
              Back
            </Button>
          </CardContent>
        </Card>
      )}

      {view === 'connected' && (
        <div className="w-full max-w-7xl space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Connected Players</h2>
            <Button variant="destructive" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>

          <PlayerGrid players={players.filter(p => p !== myPlayerName)} playerStatuses={playerStatuses} />

          <ControlBar
            playerName={myPlayerName || 'Unknown'}
            onDisconnect={handleDisconnect}
          />

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

    </div >
  )
}

export default App
