import { useRef, useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../../../config';

// PERFORMANCE: Singleton socket connection - reuse across components
let socketInstance: Socket | null = null;

const getSocket = (): Socket => {
    if (!socketInstance) {
        socketInstance = io(config.backendUrl, {
            transports: ['websocket'], // Faster than polling
            upgrade: false, // Don't upgrade, stay on WebSocket
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
        });
    }
    return socketInstance;
};

export interface Participant {
    id: string;
    name: string;
    stream: MediaStream | null;
    isMicOn?: boolean;
    isCameraOn?: boolean;
}

interface UseWebRTCProps {
    roomId: string;
    userName: string;
    localStream: MediaStream | null;
}

// PERFORMANCE: Optimized ICE server configuration
const peerConnectionConfig: RTCConfiguration = {
    iceServers: config.iceServers,
    iceCandidatePoolSize: 10, // Pre-gather ICE candidates
    bundlePolicy: 'max-bundle', // Maximize bundling for performance
    rtcpMuxPolicy: 'require', // Multiplex RTP and RTCP
};

export const useWebRTC = ({ roomId, userName, localStream }: UseWebRTCProps) => {
    // PERFORMANCE: Use Map for O(1) lookups
    const [participants, setParticipants] = useState<Participant[]>([]);
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const socket = useRef<Socket>(getSocket());

    const [pendingRequests, setPendingRequests] = useState<{ userId: string; userName: string }[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'waiting' | 'joined' | 'rejected'>('connecting');

    // PERFORMANCE: Batch ICE candidates to reduce signaling overhead
    const iceCandidateQueue = useRef<Map<string, RTCIceCandidate[]>>(new Map());
    const iceCandidateTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const [activeSpeakerId] = useState<string | null>(null);

    const playNotificationSound = useCallback(() => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (e) {
            console.warn('Audio context not available');
        }
    }, []);

    const createPeerConnection = useCallback(async (userId: string, userName: string, isInitiator: boolean, stream: MediaStream) => {
        if (peersRef.current.has(userId)) return;

        const pc = new RTCPeerConnection(peerConnectionConfig);
        peersRef.current.set(userId, pc);

        // PERFORMANCE: Add tracks efficiently
        stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
        });

        // Handle remote tracks
        pc.ontrack = (event) => {
            console.log(`Received track from ${userName}`);
            setParticipants((prev) =>
                prev.map((p) =>
                    p.id === userId ? { ...p, stream: event.streams[0] } : p
                )
            );
        };

        // PERFORMANCE: Batch ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const queue = iceCandidateQueue.current.get(userId) || [];
                queue.push(event.candidate);
                iceCandidateQueue.current.set(userId, queue);

                // Clear existing timer
                const existingTimer = iceCandidateTimers.current.get(userId);
                if (existingTimer) clearTimeout(existingTimer);

                // Send batched candidates after 50ms
                const timer = setTimeout(() => {
                    const candidates = iceCandidateQueue.current.get(userId) || [];
                    if (candidates.length > 0) {
                        // Send all at once
                        candidates.forEach(candidate => {
                            socket.current.emit("ice-candidate", {
                                roomId,
                                to: userId,
                                candidate,
                            });
                        });
                        iceCandidateQueue.current.delete(userId);
                    }
                    iceCandidateTimers.current.delete(userId);
                }, 50);

                iceCandidateTimers.current.set(userId, timer);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${userName}: ${pc.connectionState}`);
            if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
                // Attempt reconnection
                console.warn(`Connection ${pc.connectionState} with ${userName}`);
            }
        };

        if (isInitiator) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.current.emit("offer", {
                    roomId,
                    to: userId,
                    offer,
                    userName: userName,
                });
            } catch (err) {
                console.error("Error creating offer:", err);
            }
        }
    }, [roomId]);

    const replaceTrack = useCallback((newTrack: MediaStreamTrack) => {
        peersRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === newTrack.kind);
            if (sender) {
                sender.replaceTrack(newTrack).catch(err => console.error('Error replacing track:', err));
            }
        });
    }, []);

    const admitUser = useCallback((userId: string) => {
        socket.current.emit("admit-user", { userId, roomId });
        setPendingRequests(prev => prev.filter(req => req.userId !== userId));
    }, [roomId]);

    const rejectUser = useCallback((userId: string) => {
        socket.current.emit("reject-user", { userId, roomId });
        setPendingRequests(prev => prev.filter(req => req.userId !== userId));
    }, [roomId]);

    const toggleMediaStatus = useCallback((kind: 'audio' | 'video', isOn: boolean) => {
        socket.current.emit('toggle-media', { roomId, kind, isOn });
    }, [roomId]);

    const emitScreenShareStatus = useCallback((isSharing: boolean) => {
        socket.current.emit('screen-share-status', { roomId, isSharing });
    }, [roomId]);

    useEffect(() => {
        if (!localStream) return;

        const currentSocket = socket.current;

        currentSocket.connect();
        currentSocket.emit("join-room", { roomId, userName });

        // Waiting Room Logic
        currentSocket.on("waiting-for-approval", () => {
            setConnectionStatus('waiting');
        });

        currentSocket.on("join-approved", () => {
            setConnectionStatus('joined');
            playNotificationSound();
        });

        currentSocket.on("join-rejected", () => {
            setConnectionStatus('rejected');
            currentSocket.disconnect();
        });

        currentSocket.on("join-request", (data: { userId: string; userName: string }) => {
            setPendingRequests(prev => [...prev, data]);
            playNotificationSound();
        });

        currentSocket.on("user-joined", async (data: { userId: string; userName: string }) => {
            console.log("User joined:", data);
            playNotificationSound();
            setParticipants((prev) => {
                if (prev.some(p => p.id === data.userId)) return prev;
                return [...prev, { id: data.userId, name: data.userName, stream: null, isMicOn: true, isCameraOn: true }];
            });
            await createPeerConnection(data.userId, data.userName, true, localStream);
        });

        currentSocket.on("media-status-update", (data: { userId: string; kind: 'audio' | 'video'; isOn: boolean }) => {
            setParticipants((prev) => prev.map(p => {
                if (p.id === data.userId) {
                    return {
                        ...p,
                        [data.kind === 'audio' ? 'isMicOn' : 'isCameraOn']: data.isOn
                    };
                }
                return p;
            }));
        });

        currentSocket.on("offer", async (data: { from: string; offer: RTCSessionDescriptionInit; userName: string }) => {
            console.log("Received offer from:", data.userName);

            setParticipants((prev) => {
                if (prev.some(p => p.id === data.from)) return prev;
                return [...prev, { id: data.from, name: data.userName, stream: null, isMicOn: true, isCameraOn: true }];
            });

            let pc = peersRef.current.get(data.from);
            if (!pc) {
                await createPeerConnection(data.from, data.userName, false, localStream);
                pc = peersRef.current.get(data.from);
            }

            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                currentSocket.emit("answer", {
                    roomId,
                    to: data.from,
                    answer,
                });
            }
        });

        currentSocket.on("answer", async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
            const pc = peersRef.current.get(data.from);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        });

        currentSocket.on("ice-candidate", async (data: { from: string; candidate: RTCIceCandidateInit }) => {
            const pc = peersRef.current.get(data.from);
            if (pc) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error("Error adding ice candidate", e);
                }
            }
        });

        currentSocket.on("user-left", (data: { userId: string; userName: string }) => {
            const pc = peersRef.current.get(data.userId);
            if (pc) {
                pc.close();
                peersRef.current.delete(data.userId);
            }
            setParticipants((prev) => prev.filter((p) => p.id !== data.userId));
        });

        currentSocket.on("existing-users", (users: Array<{ userId: string; userName: string }>) => {
            const uniqueUsers = users.filter((user, index, self) =>
                index === self.findIndex(u => u.userId === user.userId)
            );
            setParticipants(uniqueUsers.map(u => ({ id: u.userId, name: u.userName, stream: null, isMicOn: true, isCameraOn: true })));
            setConnectionStatus('joined');
        });

        return () => {
            currentSocket.off("user-joined");
            currentSocket.off("offer");
            currentSocket.off("answer");
            currentSocket.off("ice-candidate");
            currentSocket.off("user-left");
            currentSocket.off("existing-users");
            currentSocket.off("waiting-for-approval");
            currentSocket.off("join-approved");
            currentSocket.off("join-rejected");
            currentSocket.off("join-request");
            currentSocket.off("media-status-update");

            currentSocket.emit("leave-room", roomId);

            // MEMORY: Clean up peer connections
            peersRef.current.forEach((pc) => pc.close());
            peersRef.current.clear();

            // MEMORY: Clean up ICE candidate queues
            iceCandidateTimers.current.forEach(timer => clearTimeout(timer));
            iceCandidateTimers.current.clear();
            iceCandidateQueue.current.clear();
        };
    }, [roomId, userName, localStream, createPeerConnection, playNotificationSound]);

    return {
        participants,
        replaceTrack,
        pendingRequests,
        admitUser,
        rejectUser,
        connectionStatus,
        toggleMediaStatus,
        activeSpeakerId,
        emitScreenShareStatus,
        socket: socket.current,
    };
};
