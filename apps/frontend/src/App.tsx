import { useState, useEffect, useRef } from 'react'
import { AudioManager } from './lib/audio'
import { Button } from './components/ui/button'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card'
import { PlayerGrid } from './components/PlayerGrid'
import { ControlBar } from './components/ControlBar'
import { Copy, Check, Settings } from 'lucide-react'
import { CodeInput } from './components/ui/code-input'
import { Toast, type ToastType } from './components/ui/toast'
import { ConfirmationModal } from './components/ui/confirmation-modal'
import { SettingsModal } from './components/SettingsModal'
import { NoiseSuppressionProcessor } from '@shiguredo/noise-suppression'

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
  const playerCodesRef = useRef<Record<string, string>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const isIntentionalDisconnect = useRef(false)

  // Toast State
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)

  // Modal State
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false)

  // Join Room State
  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinPlayerCode, setJoinPlayerCode] = useState('')
  const [, setAudioContextState] = useState<AudioContextState>('suspended')
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [streamMapping, setStreamMapping] = useState<Record<string, string>>({}) // StreamID -> PlayerName

  // WebRTC State
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const remoteStreams = useRef<Map<string, MediaStream>>(new Map())
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map())
  const audioManager = useRef<AudioManager | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const processorRef = useRef<NoiseSuppressionProcessor | null>(null)

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputId, setSelectedInputId] = useState('')
  const [selectedOutputId, setSelectedOutputId] = useState('')
  const [inputVolume, setInputVolume] = useState(1.0)
  const [outputVolume, setOutputVolume] = useState(1.0)
  const [noiseSuppression, setNoiseSuppression] = useState(true)

  // Input Audio Chain Refs
  const inputAudioContext = useRef<AudioContext | null>(null)
  const inputSource = useRef<MediaStreamAudioSourceNode | null>(null)
  const inputGain = useRef<GainNode | null>(null)
  const inputDestination = useRef<MediaStreamAudioDestinationNode | null>(null)

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

  useEffect(() => {
    audioManager.current = new AudioManager()
    setAudioContextState(audioManager.current.getAudioContextState())

    // Parse URL parameters
    const params = new URLSearchParams(window.location.search)
    const roomIdParam = params.get('roomid')
    if (roomIdParam) {
      setJoinRoomId(roomIdParam)
      setView('join')
    }

    const interval = setInterval(() => {
      if (audioManager.current) {
        setAudioContextState(audioManager.current.getAudioContextState())
      }
    }, 1000)

    return () => {
      clearInterval(interval)
      if (wsRef.current) {
        wsRef.current.close()
      }
      cleanupConnections()
      if (audioManager.current) {
        audioManager.current.dispose()
      }
      if (inputAudioContext.current) {
        inputAudioContext.current.close()
      }
    }
  }, [])

  // Device Enumeration
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permission first to get labels
        // await navigator.mediaDevices.getUserMedia({ audio: true }) // We do this in create/join, but for settings we might need it earlier?
        // Actually, enumerateDevices returns empty labels if no permission.
        // We assume permission is granted when joining/creating.
        // If settings is opened before, labels might be empty.

        const devices = await navigator.mediaDevices.enumerateDevices()
        const inputs = devices.filter(d => d.kind === 'audioinput')
        const outputs = devices.filter(d => d.kind === 'audiooutput')
        setInputDevices(inputs)
        setOutputDevices(outputs)

        // Set defaults if not set
        if (!selectedInputId && inputs.length > 0) setSelectedInputId(inputs[0].deviceId)
        if (!selectedOutputId && outputs.length > 0) setSelectedOutputId(outputs[0].deviceId)
      } catch (e) {
        console.error('Failed to enumerate devices', e)
      }
    }

    navigator.mediaDevices.addEventListener('devicechange', getDevices)
    getDevices()

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getDevices)
    }
  }, [selectedInputId, selectedOutputId])

  // Apply Output Volume
  useEffect(() => {
    if (audioManager.current) {
      audioManager.current.setMasterVolume(outputVolume)
    }
  }, [outputVolume])

  // Apply Output Device
  useEffect(() => {
    if (audioManager.current && selectedOutputId) {
      audioManager.current.setSinkId(selectedOutputId)
    }
  }, [selectedOutputId])

  // Apply Input Volume
  useEffect(() => {
    if (inputGain.current) {
      inputGain.current.gain.value = inputVolume
    }
  }, [inputVolume])

  // Helper to update local stream based on settings
  const updateLocalStream = async () => {
    try {
      // 1. Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputId ? { exact: selectedInputId } : undefined,
          channelCount: 1,
          echoCancellation: false, // We handle processing manually or via Shiguredo
          noiseSuppression: false,
          autoGainControl: false
        }
      })

      // 2. Setup Input Chain (Gain)
      if (!inputAudioContext.current) {
        inputAudioContext.current = new AudioContext()
      }
      const ctx = inputAudioContext.current

      // Cleanup old nodes
      if (inputSource.current) inputSource.current.disconnect()
      if (inputGain.current) inputGain.current.disconnect()
      // inputDestination stays connected usually, but let's recreate to be safe or just reuse
      if (!inputDestination.current) {
        inputDestination.current = ctx.createMediaStreamDestination()
        inputDestination.current.channelCount = 1
      }

      inputSource.current = ctx.createMediaStreamSource(stream)
      inputGain.current = ctx.createGain()
      inputGain.current.gain.value = inputVolume

      inputSource.current.connect(inputGain.current)
      inputGain.current.connect(inputDestination.current)

      let processedStream = inputDestination.current.stream

      // 3. Apply Noise Suppression (Shiguredo)
      if (noiseSuppression) {
        if (!processorRef.current) {
          processorRef.current = new NoiseSuppressionProcessor()
        }
        const track = processedStream.getAudioTracks()[0]
        if (processorRef.current.isProcessing()) {
          processorRef.current.stopProcessing()
        }
        await processorRef.current.startProcessing(track)
        processedStream = new MediaStream([processorRef.current.getProcessedTrack()])
      } else {
        if (processorRef.current && processorRef.current.isProcessing()) {
          processorRef.current.stopProcessing()
        }
      }

      // 4. Update Local Stream Ref
      localStream.current = processedStream

      // 5. Update Peer Connections
      // Replace track in all senders
      peerConnections.current.forEach(pc => {
        const senders = pc.getSenders()
        const audioSender = senders.find(s => s.track?.kind === 'audio')
        if (audioSender && processedStream.getAudioTracks()[0]) {
          audioSender.replaceTrack(processedStream.getAudioTracks()[0])
        }
      })

    } catch (e) {
      console.error('Failed to update local stream', e)
      showToast('Failed to update audio settings', 'error')
    }
  }

  // Trigger stream update when relevant settings change
  // Note: We only want to trigger this when connected or previewing?
  // For now, let's trigger if we have an active session (isConnected)
  useEffect(() => {
    if (isConnected) {
      updateLocalStream()
    }
  }, [selectedInputId, noiseSuppression, isConnected])


  // Keep playerCodesRef in sync
  useEffect(() => {
    playerCodesRef.current = playerCodes
  }, [playerCodes])

  // Transition to connected view when players join
  useEffect(() => {
    if (players.length > 0 && view === 'create') {
      setView('connected')
    }
  }, [players, view])

  // Identify peers whenever streamMapping or audioManager changes
  useEffect(() => {
    if (audioManager.current) {
      Object.entries(streamMapping).forEach(([streamId, playerName]) => {
        audioManager.current?.identifyPeer(streamId, playerName)
      })
    }
  }, [streamMapping])

  // Broadcast updates whenever players or statuses change
  useEffect(() => {
    if (players.length > 0) {
      broadcastPlayers(players, playerStatuses, playerData, vcSettings, streamMapping)
    }
  }, [players, playerStatuses, playerData, vcSettings, streamMapping])

  // Update Audio Manager with sync data for spatial audio
  useEffect(() => {
    if (audioManager.current && players.length > 0) {
      audioManager.current.processSyncData({
        pl: players,
        pd: playerData,
        s: vcSettings
      } as any, myPlayerName || '')
    }
  }, [players, playerData, vcSettings, myPlayerName])

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type })
  }

  const broadcastPlayers = (currentPlayers: string[], currentStatuses: Record<string, 'online' | 'offline'>, currentPlayerData: any[], currentVcSettings: any, currentStreamMapping: Record<string, string>) => {
    const message = JSON.stringify({
      type: 'update',
      players: currentPlayers,
      statuses: currentStatuses,
      playerData: currentPlayerData,
      vcSettings: currentVcSettings,
      streamMapping: currentStreamMapping
    })
    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') {
        dc.send(message)
      }
    })
  }

  // TURN Credentials State
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([])

  useEffect(() => {
    const fetchTurnCredentials = async () => {
      try {
        const response = await fetch(`${backendUrl}/turn-credentials`)
        const servers = await response.json()
        setIceServers(servers)
      } catch (e) {
        console.error('Failed to fetch TURN credentials', e)
        // Fallback to Google STUN
        setIceServers([{ urls: 'stun:stun.l.google.com:19302' }])
      }
    }
    fetchTurnCredentials()
  }, [])

  const setupPeerConnection = async (targetPeerId: string, isInitiator: boolean, ws: WebSocket) => {
    const pc = new RTCPeerConnection({
      iceServers: iceServers.length > 0 ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    pc.onnegotiationneeded = async () => {
      try {
        console.log(`Negotiation needed for ${targetPeerId}`)
        const offer = await pc.createOffer()
        if (offer.sdp) {
          offer.sdp = setOpusBitrate(offer.sdp, 128000)
        }
        await pc.setLocalDescription(offer)
        ws.send(JSON.stringify({
          type: 'signal',
          target: targetPeerId === 'owner' ? 'owner' : targetPeerId,
          payload: offer
        }))
      } catch (err) {
        console.error(`Error during negotiation with ${targetPeerId}:`, err)
      }
    }

    if (localStream.current) {
      console.log(`Adding local tracks to ${targetPeerId}`)
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!)
      })
    } else {
      console.warn(`No local stream to add for ${targetPeerId}`)
    }

    // If we are Owner, add existing remote streams from OTHER peers to this new peer
    if (targetPeerId !== 'owner') {
      console.log(`Checking for existing remote streams to relay to ${targetPeerId}`)
      remoteStreams.current.forEach((stream, streamPeerId) => {
        if (streamPeerId !== targetPeerId) {
          console.log(`Relaying existing stream from ${streamPeerId} to ${targetPeerId}`)
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream)
          })
        }
      })
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0]
        const streamId = stream.id
        console.log(`Received remote stream from ${targetPeerId} (${streamId})`)

        // Use stream.id as the unique identifier for audio to allow multiple streams from the same peer (e.g. Owner relaying)
        remoteStreams.current.set(targetPeerId, stream) // This might overwrite on Peer side, but fine for now
        audioManager.current?.addStream(streamId, stream)

        // If we are Owner, we need to map this stream to the player
        if (targetPeerId !== 'owner') {
          // We need to know who this targetPeerId belongs to.
          // We have playerCodes: Code -> Name
          // targetPeerId IS the playerCode for peers connecting to owner.
          const playerName = playerCodesRef.current[targetPeerId]
          if (playerName) {
            console.log(`Mapping stream ${streamId} to player ${playerName}`)
            setStreamMapping(prev => ({ ...prev, [streamId]: playerName }))
          } else {
            console.warn(`Could not map stream ${streamId} to player: ${targetPeerId} not found in playerCodes`, playerCodesRef.current)
          }
        }

        // Cleanup when tracks end
        stream.getTracks().forEach(track => {
          track.onended = () => {
            console.log(`Track ${track.id} ended for stream ${streamId}`)
            audioManager.current?.removePeer(streamId)
          }
        })

        // Relay to other peers if we are the Owner
        if (targetPeerId !== 'owner') { // We are Owner
          console.log(`Relaying stream from ${targetPeerId} to other peers`)
          peerConnections.current.forEach((otherPc, otherPeerId) => {
            if (otherPeerId !== targetPeerId && otherPc.connectionState !== 'closed') {
              event.streams[0].getTracks().forEach(track => {
                const senders = otherPc.getSenders()
                const alreadyHasTrack = senders.some(sender => sender.track?.id === track.id)

                if (!alreadyHasTrack) {
                  console.log(`Adding track ${track.id} from ${targetPeerId} to ${otherPeerId}`)
                  try {
                    otherPc.addTrack(track, event.streams[0])
                  } catch (e) {
                    console.error(`Failed to add track to ${otherPeerId}`, e)
                  }
                } else {
                  console.log(`Peer ${otherPeerId} already has track ${track.id}`)
                }
              })
            }
          })
        }
      }
    }

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
        // Use ref to get latest codes
        const codes = playerCodesRef.current
        const playerName = codes[targetPeerId]
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
          if (msg.streamMapping) {
            setStreamMapping(msg.streamMapping)
            // console.log('Received stream mapping:', msg.streamMapping)
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
            dc.send(JSON.stringify({
              type: 'update',
              players: prev,
              statuses: prevStatuses,
              playerData: playerData,
              vcSettings: vcSettings,
              streamMapping: streamMapping
            }))
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
      if (answer.sdp) {
        answer.sdp = setOpusBitrate(answer.sdp, 128000)
      }
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

  const createRoom = async () => {
    isIntentionalDisconnect.current = false

    // Peer Connection
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })

      // Downmix to mono using AudioContext
      if (!inputAudioContext.current) {
        inputAudioContext.current = new AudioContext()
      }
      const ctx = inputAudioContext.current
      const source = ctx.createMediaStreamSource(stream)
      const destination = ctx.createMediaStreamDestination()
      destination.channelCount = 1
      source.connect(destination)

      // Update refs
      inputSource.current = source
      inputDestination.current = destination

      const processor = new NoiseSuppressionProcessor()
      processorRef.current = processor
      const track = destination.stream.getAudioTracks()[0]
      await processor.startProcessing(track)
      localStream.current = new MediaStream([processor.getProcessedTrack()])

    } catch (err) {
      console.error('Failed to get local stream', err)
      showToast('Microphone access denied', 'error')
      return
    }

    setView('create')
    const ws = new WebSocket(`${import.meta.env.VITE_WS_URL}/frontendws`)
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
        setMyPlayerName((prev) => {
          if (!prev && localStream.current) {
            // If this is the first time we get our name, map our local stream
            const streamId = localStream.current.id
            setStreamMapping(m => ({ ...m, [streamId]: newPlayer }))
          }
          return prev || newPlayer
        })

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
          // Sync data might not contain streamMapping if it's from MC mod directly?
          // Actually sync data is usually from MC.
          // The 'update' message is from Owner via DataChannel.
          // This 'sync' message is from Backend (relayed from MC or Owner?).
          // If it's from Owner via WebSocket (which we don't do for 'update'), it might be different.
          // 'update' is P2P. 'sync' is WS.
          // We only use 'update' for streamMapping.
        } catch (e) {
          console.error('Failed to parse sync data', e)
        }
      }
    }

    ws.onclose = () => {
      console.log('Disconnected')
      setIsConnected(false)
      if (!isIntentionalDisconnect.current) {
        showToast('Disconnected from server', 'error')
      }
    }
  }

  const joinRoom = async () => {
    isIntentionalDisconnect.current = false
    const rId = joinRoomId.trim()
    const pCode = joinPlayerCode.trim()
    if (!rId || !pCode) return

    // Peer Connection
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })

      // Downmix to mono using AudioContext
      if (!inputAudioContext.current) {
        inputAudioContext.current = new AudioContext()
      }
      const ctx = inputAudioContext.current
      const source = ctx.createMediaStreamSource(stream)
      const destination = ctx.createMediaStreamDestination()
      destination.channelCount = 1
      source.connect(destination)

      // Update refs
      inputSource.current = source
      inputDestination.current = destination

      const processor = new NoiseSuppressionProcessor()
      processorRef.current = processor
      const track = destination.stream.getAudioTracks()[0]
      await processor.startProcessing(track)
      localStream.current = new MediaStream([processor.getProcessedTrack()])

    } catch (err) {
      console.error('Failed to get local stream', err)
      showToast('Microphone access denied', 'error')
      return
    }

    const ws = new WebSocket(`${import.meta.env.VITE_WS_URL}/frontendws?roomId=${rId}&playerCode=${pCode}`)
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
        if (localStream.current) {
          const streamId = localStream.current.id
          // Map my own stream so I can identify it (though I don't play it back usually, but good for consistency)
          // Actually, peers send their stream to Owner. Owner maps it.
          // But if I want to visualize or debug, knowing my stream ID helps.
          // Also, if we ever implement local loopback for testing.
          setStreamMapping(m => ({ ...m, [streamId]: message.data.playerName }))
        }
        setRoomCode(message.data.roomId)
        setView('connected')
        showToast('Joined room successfully', 'success')

        // Initiate WebRTC connection to Owner
        // We don't create offer here manually anymore, we let onnegotiationneeded handle it
        // BUT for the initial connection, we might need to trigger it or just add tracks (which triggers it)
        await setupPeerConnection('owner', true, ws) // true = initiator

        // Adding tracks in setupPeerConnection should trigger onnegotiationneeded
        // But sometimes it fires too early or we miss it?
        // Let's rely on onnegotiationneeded.

      } else if (message.type === 'signal') {
        await handleSignal(ws, message.sender, message.payload)
      }
    }
  }

  const copyCommand = () => {
    if (roomCode) {
      const wsUrl = import.meta.env.VITE_WS_URL.replace(/^ws:\/\/|^wss:\/\//, '')
      navigator.clipboard.writeText(`/connect ${wsUrl}/mcws/${roomCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      showToast('Command copied to clipboard', 'success')
    }
  }

  const cleanupConnections = () => {
    peerConnections.current.forEach(pc => pc.close())
    peerConnections.current.clear()
    remoteStreams.current.clear()
    dataChannels.current.forEach(dc => dc.close())
    dataChannels.current.clear()
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop())
      localStream.current = null
    }
    if (processorRef.current) {
      processorRef.current.stopProcessing()
      processorRef.current = null
    }
    // We might want to clear audio peers too, but AudioManager doesn't have a clear method exposed yet.
    // But removePeer is available.
    // Ideally we should track added peers in AudioManager or just rely on it being recreated or peers removed.
    // Since we re-create AudioManager on mount (which is only once), we should probably clear it.
    // But for now, just stopping tracks is enough to stop audio.
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

  const toggleMute = () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted
      })
    }
  }

  const toggleDeafen = () => {
    const newDeafened = !isDeafened
    setIsDeafened(newDeafened)
    if (audioManager.current) {
      audioManager.current.setMasterVolume(newDeafened ? 0 : 1)
    }
  }

  return (
    <div className={`min-h-screen bg-background text-foreground flex justify-center p-4 ${view === 'connected' ? 'items-start pt-8' : 'items-center'}`}>
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
                /connect {backendUrl}/mcws/{roomCode || '...'}
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
        <div className="w-full max-w-7xl space-y-8 animate-in fade-in duration-500 pb-24">
          {/* Share Link */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-sm font-semibold text-slate-500 whitespace-nowrap">Room Link:</span>
              <code className="text-sm bg-slate-50 px-2 py-1 rounded text-slate-700 truncate">
                {`${window.location.origin}?roomid=${roomCode}`}
              </code>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => {
              const url = `${window.location.origin}?roomid=${roomCode}`
              navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
              showToast('Link copied to clipboard', 'success')
            }}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
          </div>

          <div className="flex items-center justify-between bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div>
              <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{myPlayerName?.toUpperCase()}</h2>
              <p className="text-slate-500 mt-1">Manage your proximity chat session</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setIsSettingsOpen(true)}>
                <Settings className="h-6 w-6 text-slate-600" />
              </Button>
            </div>
          </div>

          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            inputDevices={inputDevices}
            outputDevices={outputDevices}
            selectedInputId={selectedInputId}
            selectedOutputId={selectedOutputId}
            inputVolume={inputVolume}
            outputVolume={outputVolume}
            noiseSuppression={noiseSuppression}
            onInputDeviceChange={setSelectedInputId}
            onOutputDeviceChange={setSelectedOutputId}
            onInputVolumeChange={setInputVolume}
            onOutputVolumeChange={setOutputVolume}
            onNoiseSuppressionChange={setNoiseSuppression}
          />

          <PlayerGrid players={players.filter(p => p !== myPlayerName)} playerStatuses={playerStatuses} />

          <ControlBar
            playerName={myPlayerName || 'Unknown'}
            isMuted={isMuted}
            isDeafened={isDeafened}
            onToggleMute={toggleMute}
            onToggleDeafen={toggleDeafen}
            onDisconnect={handleDisconnectClick}
          />

          {/* Debug Buttons - To be removed */}
          {/* <div className="flex gap-2 mt-8 opacity-50 hover:opacity-100 transition-opacity">
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
          </div> */}
        </div>
      )}

    </div >
  )
}


// Helper to set Opus bitrate
function setOpusBitrate(sdp: string, bitrate: number): string {
  const lines = sdp.split(/\r\n|\r|\n/);

  // Let's do the two-pass approach.
  let opusPayloadType = -1;
  for (const line of lines) {
    if (line.startsWith('a=rtpmap:') && line.toLowerCase().includes('opus/48000')) {
      const parts = line.split(' ');
      const pt = parts[0].split(':')[1];
      opusPayloadType = parseInt(pt, 10);
      break;
    }
  }

  if (opusPayloadType === -1) return sdp;

  let fmtpFound = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`a=fmtp:${opusPayloadType}`)) {
      fmtpFound = true;
      let line = lines[i];
      if (line.includes('maxaveragebitrate')) {
        line = line.replace(/maxaveragebitrate=\d+/, `maxaveragebitrate=${bitrate}`);
      } else {
        line += `;maxaveragebitrate=${bitrate}`;
      }
      lines[i] = line;
      break;
    }
  }

  if (!fmtpFound) {
    // Insert after rtpmap
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`a=rtpmap:${opusPayloadType}`)) {
        lines.splice(i + 1, 0, `a=fmtp:${opusPayloadType} maxaveragebitrate=${bitrate}`);
        break;
      }
    }
  }


  return lines.join('\r\n');
}

export default App


