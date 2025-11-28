import { useState, useEffect, useRef } from 'react'
import { Button } from './components/ui/button'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card'
import { PlayerGrid } from './components/PlayerGrid'
import { ControlBar } from './components/ControlBar'
import { Copy, Check } from 'lucide-react'
import { CodeInput } from './components/ui/code-input'
import { Toast, type ToastType } from './components/ui/toast'
import { ConfirmationModal } from './components/ui/confirmation-modal'

function App() {
  const [view, setView] = useState<'home' | 'create' | 'join' | 'connected'>('home')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [players, setPlayers] = useState<string[]>([])
  const [myPlayerName, setMyPlayerName] = useState<string | null>(null)
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, 'online' | 'offline'>>({})
  const [playerData, setPlayerData] = useState<any[]>([])
  const [vcSettings, setVcSettings] = useState<any>(null)
  const [playerCodes, setPlayerCodes] = useState<Record<string, string>>({}) // Code -> Name (Owner only)
  const wsRef = useRef<WebSocket | null>(null)
  const isIntentionalDisconnect = useRef(false)

  // Toast State
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)

  // Modal State
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false)

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
      cleanupConnections()
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
      broadcastPlayers(players, playerStatuses, playerData, vcSettings)
    }
  }, [players, playerStatuses, playerData, vcSettings])

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type })
  }

  const broadcastPlayers = (currentPlayers: string[], currentStatuses: Record<string, 'online' | 'offline'>, currentPlayerData: any[], currentVcSettings: any) => {
    const message = JSON.stringify({ type: 'update', players: currentPlayers, statuses: currentStatuses, playerData: currentPlayerData, vcSettings: currentVcSettings })
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
              const isOnline = pc.connectionState === 'connected'
              const newStatuses = {
                ...prevStatuses,
                [playerName]: (isOnline ? 'online' : 'offline') as 'online' | 'offline'
              }
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
          if (msg.playerData) {
            setPlayerData(msg.playerData)
            console.log('Received player data:', msg.playerData)
          }
          if (msg.vcSettings) {
            setVcSettings(msg.vcSettings)
            console.log('Received vc settings:', msg.vcSettings)
          }
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
            dc.send(JSON.stringify({ type: 'update', players: prev, statuses: prevStatuses, playerData: playerData, vcSettings: vcSettings }))
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
    isIntentionalDisconnect.current = false
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
            if (newPlayer === myPlayerName || prev.length === 0) {
              updatedStatuses[newPlayer] = 'online'
            }
            return updatedStatuses
          })
          return updated
        })
        showToast(`${newPlayer} joined the room`, 'success')
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
        showToast(`${leavingPlayer} left the room`, 'info')
      } else if (message.type === 'signal') {
        await handleSignal(ws, message.sender, message.payload)
      } else if (message.type === 'peerDisconnect') {
        const disconnectedPlayer = message.data.playerName
        setPlayerStatuses(prevStatuses => ({
          ...prevStatuses,
          [disconnectedPlayer]: 'offline'
        }))
        showToast(`${disconnectedPlayer} disconnected`, 'info')
      } else if (message.type === 'sync') {
        try {
          const syncDataRaw = atob(message.data)
          const syncData = JSON.parse(syncDataRaw)
          if (syncData.pd) {
            setPlayerData(syncData.pd)
            // console.log('Updated player data:', syncData.pd)
          }
          if (syncData.s) {
            setVcSettings(syncData.s)
            // console.log('Updated vc settings:', syncData.s)
          }
        } catch (e) {
          console.error('Failed to parse sync data', e)
        }
      }
    }

    ws.onclose = (event) => {
      console.log('Disconnected')
      setIsConnected(false)
      if (!isIntentionalDisconnect.current) {
        showToast('Disconnected from server', 'error')
      }
    }
  }

  const joinRoom = () => {
    isIntentionalDisconnect.current = false
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
      if (isIntentionalDisconnect.current) return
      if (event.code !== 1000 && event.code !== 1001) {
        showToast(`Connection failed: ${event.reason || 'Unknown error'}`, 'error')
      }
    }

    ws.onmessage = async (event) => {
      console.log('Peer received message:', event.data)
      const message = JSON.parse(event.data)
      if (message.type === 'joinResponse') {
        setMyPlayerName(message.data.playerName)
        setRoomCode(message.data.roomId)
        setView('connected')
        showToast('Joined room successfully', 'success')

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
      showToast('Command copied to clipboard', 'success')
    }
  }

  const cleanupConnections = () => {
    peerConnections.current.forEach(pc => pc.close())
    peerConnections.current.clear()
    dataChannels.current.forEach(dc => dc.close())
    dataChannels.current.clear()
  }

  const handleDisconnectClick = () => {
    setIsDisconnectModalOpen(true)
  }

  const handleDisconnect = () => {
    isIntentionalDisconnect.current = true
    if (wsRef.current) {
      wsRef.current.close()
    }
    cleanupConnections()
    setView('home')
    setRoomCode(null)
    setPlayers([])
    setPlayerStatuses({})
    setPlayerCodes({})
    setIsConnected(false)
    setMyPlayerName(null)
    showToast('Disconnected', 'info')
  }

  const confirmDisconnect = () => {
    handleDisconnect()
    setIsDisconnectModalOpen(false)
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmationModal
        isOpen={isDisconnectModalOpen}
        title="Disconnect?"
        description="Are you sure you want to disconnect? You will leave the room."
        confirmText="Disconnect"
        variant="destructive"
        onConfirm={confirmDisconnect}
        onCancel={() => setIsDisconnectModalOpen(false)}
      />

      {view === 'home' && (
        <Card className="w-full max-w-md border-0 shadow-xl bg-white">
          <CardHeader className="space-y-1 pb-8">
            <CardTitle className="text-4xl font-bold text-center text-primary tracking-tight">
              Proximity Chat
            </CardTitle>
            <CardDescription className="text-center text-lg text-muted-foreground font-light">
              Minecraft Bedrock Edition
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full h-14 text-lg font-semibold shadow-md hover:shadow-lg transition-all" onClick={createRoom}>
              Create Room
            </Button>
            <Button variant="outline" className="w-full h-14 text-lg font-medium border-2 hover:bg-slate-50 transition-all" onClick={() => setView('join')}>
              Join Room
            </Button>
          </CardContent>
        </Card>
      )}

      {view === 'create' && (
        <Card className="w-full max-w-md border-0 shadow-xl bg-white">
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl font-bold text-center">Create Room</CardTitle>
            <CardDescription className="text-center">Run this command in Minecraft to connect</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 relative group transition-all hover:border-primary/20">
              <code className="text-primary font-mono text-sm break-all font-medium block text-center">
                /connect localhost:3000/mcws/{roomCode || '...'}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                onClick={copyCommand}
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-slate-400" />}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3 text-sm font-medium">
                <div className={`w-3 h-3 rounded-full shadow-sm ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-orange-300'}`} />
                <span className={isConnected ? 'text-green-600' : 'text-slate-500'}>
                  {isConnected ? 'Waiting for Minecraft connection...' : 'Connecting to server...'}
                </span>
              </div>
            </div>

            <Button variant="ghost" className="w-full text-slate-500 hover:text-slate-700 hover:bg-slate-50" onClick={handleDisconnectClick}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {view === 'join' && (
        <Card className="w-full max-w-md border-0 shadow-xl bg-white">
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl font-bold text-center">Join Room</CardTitle>
            <CardDescription className="text-center">Enter the Room ID and your Player Code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="roomId" className="text-sm font-semibold text-slate-700">Room ID</label>
              <CodeInput
                value={joinRoomId}
                onChange={setJoinRoomId}
                length={5}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="playerCode" className="text-sm font-semibold text-slate-700">Player Code</label>
              <CodeInput
                value={joinPlayerCode}
                onChange={setJoinPlayerCode}
                length={4}
                className="w-full"
              />
            </div>
            <Button className="w-full h-12 text-lg font-semibold shadow-md mt-2" onClick={joinRoom} disabled={!joinRoomId || !joinPlayerCode}>
              Join Room
            </Button>
            <Button variant="ghost" className="w-full text-slate-500 hover:text-slate-700 hover:bg-slate-50" onClick={() => setView('home')}>
              Back
            </Button>
          </CardContent>
        </Card>
      )}

      {view === 'connected' && (
        <div className="w-full max-w-7xl space-y-8 animate-in fade-in duration-500">
          <div className="flex items-center justify-between bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div>
              <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{myPlayerName?.toUpperCase()}</h2>
              <p className="text-slate-500 mt-1">Manage your proximity chat session</p>
            </div>
            <Button variant="destructive" size="lg" className="shadow-sm hover:shadow-md transition-all" onClick={handleDisconnectClick}>
              Disconnect
            </Button>
          </div>

          <PlayerGrid players={players.filter(p => p !== myPlayerName)} playerStatuses={playerStatuses} />

          <ControlBar
            playerName={myPlayerName || 'Unknown'}
            onDisconnect={handleDisconnectClick}
          />

          {/* Debug Buttons - To be removed */}
          <div className="flex gap-2 mt-8 opacity-50 hover:opacity-100 transition-opacity">
            <Button
              variant="outline"
              size="sm"
              className="border-dashed border-yellow-500 text-yellow-600 hover:bg-yellow-50"
              onClick={() => {
                const fakeName = `Player${Math.floor(Math.random() * 1000)}`
                setPlayers(prev => [...prev, fakeName])
              }}
            >
              [Debug] + Join
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-dashed border-red-500 text-red-600 hover:bg-red-50"
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
