import { useState, useEffect, useCallback, useRef } from 'react';

export const useMediaStream = () => {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    // Store the original camera stream to reuse when stopping screen share
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);

    const initializeMedia = useCallback(async () => {
        try {
            // If we already have a camera stream, return it
            if (cameraStreamRef.current && cameraStreamRef.current.active) {
                setStream(cameraStreamRef.current);
                setIsMicOn(true);
                setIsCameraOn(true);
                return cameraStreamRef.current;
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            });

            cameraStreamRef.current = mediaStream;
            setStream(mediaStream);
            setIsMicOn(true);
            setIsCameraOn(true);
            return mediaStream;
        } catch (error) {
            console.error("Error accessing media:", error);
            throw error;
        }
    }, []);

    const toggleMic = useCallback(() => {
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMicOn(audioTrack.enabled);
            }
        }
    }, [stream]);

    const toggleCamera = useCallback(() => {
        if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOn(videoTrack.enabled);
            }
        }
    }, [stream]);

    const startScreenShare = useCallback(async () => {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });

            screenStreamRef.current = screenStream;
            const screenTrack = screenStream.getVideoTracks()[0];

            setIsScreenSharing(true);

            // Handle when user clicks "Stop Sharing" in browser UI
            screenTrack.onended = () => {
                setIsScreenSharing(false);
            };

            return screenStream;
        } catch (error) {
            console.error("Error starting screen share:", error);
            return null;
        }
    }, []);

    const stopScreenShare = useCallback(() => {
        // Stop the screen sharing track
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }
        setIsScreenSharing(false);
    }, []);

    const getCameraVideoTrack = useCallback(() => {
        return cameraStreamRef.current?.getVideoTracks()[0] || null;
    }, []);

    useEffect(() => {
        return () => {
            // Cleanup all tracks on unmount
            cameraStreamRef.current?.getTracks().forEach(track => track.stop());
            screenStreamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, []);

    return {
        stream,
        isMicOn,
        isCameraOn,
        isScreenSharing,
        initializeMedia,
        toggleMic,
        toggleCamera,
        startScreenShare,
        stopScreenShare,
        getCameraVideoTrack, // New method to get the original camera track
        cameraStream: cameraStreamRef.current, // Expose camera stream
    };
};
