import { useEffect, useState } from "react";
import { useMediaStream } from "./features/video-call/hooks/useMediaStream";
import { useWebRTC } from "./features/video-call/hooks/useWebRTC";
import { PreJoinScreen } from "./features/video-call/components/PreJoinScreen";
import { VideoTile } from "./features/video-call/components/VideoTile";
import { ControlsBar } from "./features/video-call/components/ControlsBar";
import { DraggableLocalVideo } from "./features/video-call/components/DraggableLocalVideo";
import { motion } from "framer-motion";
import { useIdle } from "react-use";
import { useToast } from "./components/ui/Toast";

interface VideoCallProps {
  roomId: string;
  userName: string;
}

export default function VideoCall({ roomId, userName }: VideoCallProps) {
  const [hasJoined, setHasJoined] = useState(false);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // UI States for Controls
  const isIdle = useIdle(3000); // Hide after 3 seconds of inactivity
  const [isHoveringControls, setIsHoveringControls] = useState(false);


  // Custom hooks
  const {
    stream,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    initializeMedia,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    getCameraVideoTrack,
  } = useMediaStream();

  // We only initialize WebRTC AFTER joining the room to prevent early signaling
  const {
    participants,
    replaceTrack,
    connectionStatus,
    pendingRequests,
    admitUser,
    rejectUser,
    toggleMediaStatus,
    activeSpeakerId,
    emitScreenShareStatus,
  } = useWebRTC({
    roomId,
    userName,
    localStream: hasJoined ? stream : null
  });

  useEffect(() => {
    initializeMedia();
  }, [initializeMedia]);

  const handleMicToggle = () => {
    toggleMic();
    toggleMediaStatus('audio', !isMicOn);
  };

  const handleCamToggle = () => {
    toggleCamera();
    toggleMediaStatus('video', !isCameraOn);
  };

  // Handle Screen Share toggling - OPTIMIZED to prevent disconnection
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing and switch back to camera
      stopScreenShare();

      // Get the original camera video track (no new stream created!)
      const cameraVideoTrack = getCameraVideoTrack();
      if (cameraVideoTrack) {
        // Replace the screen track with the camera track in all peer connections
        replaceTrack(cameraVideoTrack);
        toggleMediaStatus('video', true);

        // Notify other participants that screen sharing stopped
        emitScreenShareStatus(false);
      }
    } else {
      // Start screen sharing
      const screenStream = await startScreenShare();
      if (screenStream) {
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace the camera track with the screen track in all peer connections
        replaceTrack(screenTrack);
        toggleMediaStatus('video', true);

        // Notify other participants that screen sharing started
        emitScreenShareStatus(true);

        // Handle when user clicks "Stop Sharing" in browser UI
        screenTrack.onended = () => {
          stopScreenShare();
          const cameraVideoTrack = getCameraVideoTrack();
          if (cameraVideoTrack) {
            replaceTrack(cameraVideoTrack);
            toggleMediaStatus('video', true);

            // Notify other participants that screen sharing stopped
            emitScreenShareStatus(false);
          }
        };
      }
    }
  };

  const { showToast } = useToast();

  const handlePin = (id: string) => {
    setPinnedId(prev => prev === id ? null : id);
  };

  const handleLeave = () => {
    window.location.href = "/";
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    showToast('Meeting link copied to clipboard!', 'success');
  };

  // Pre-join Room State
  if (!hasJoined) {
    return (
      <PreJoinScreen
        stream={stream}
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        userName={userName}
        roomId={roomId}
        onToggleMic={handleMicToggle}
        onToggleCam={handleCamToggle}
        onJoin={() => setHasJoined(true)} // Transition to main room
      />
    );
  }

  // Waiting Room State
  if (connectionStatus === 'waiting') {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#0F1115] text-white p-4">
        {/* Waiting Room Content */}
        <div className="flex flex-col items-center w-full max-w-md space-y-8 animate-in fade-in duration-700">

          {/* Self View Preview */}
          <div className="relative w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden ring-4 ring-white/5 shadow-2xl">
            <VideoTile
              stream={stream}
              userName=""
              isLocal={true}
              isMuted={true}
              isCameraOff={!isCameraOn}
              onPin={() => { }}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 rounded-full border border-white/10 pointer-events-none" />
          </div>

          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
              <h2 className="text-2xl font-semibold">Waiting for host</h2>
            </div>
            <p className="text-gray-400 max-w-xs mx-auto">
              We've let the host know you're here. You'll join automatically once admitted.
            </p>
          </div>

          <button
            onClick={handleLeave}
            className="px-8 py-3 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all text-sm font-medium"
          >
            Leave Waiting Room
          </button>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'rejected') {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#0F1115] text-white">
        <h2 className="text-3xl font-bold text-red-500 mb-4">Access Denied</h2>
        <p className="text-gray-400 mb-8">The host has denied your request to join.</p>
        <button onClick={handleLeave} className="px-6 py-3 bg-white/10 rounded-lg hover:bg-white/20">
          Return to Home
        </button>
      </div>
    );
  }

  // Active Meeting Room State
  return (
    <div className="relative h-screen w-full bg-[#0F1115] overflow-hidden text-white">

      {/* Host Notifications for Admit/Reject - MOBILE OPTIMIZED */}
      {pendingRequests.length > 0 && (
        <div className="absolute top-4 right-2 md:right-4 z-50 flex flex-col gap-2 w-72 md:w-80 max-w-[calc(100vw-2rem)]">
          {pendingRequests.map((req) => (
            <div key={req.userId} className="flex flex-col bg-[#202124] p-3 md:p-4 rounded-xl shadow-2xl border border-white/10 animate-in slide-in-from-right">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <span className="font-semibold text-xs md:text-sm truncate">{req.userName}</span>
                <span className="text-xs text-blue-400 font-medium">Wants to join</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => rejectUser(req.userId)}
                  className="flex-1 py-1.5 text-xs md:text-sm font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 rounded-lg transition touch-manipulation"
                >
                  Deny
                </button>
                <button
                  onClick={() => admitUser(req.userId)}
                  className="flex-1 py-1.5 text-xs md:text-sm font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/30 rounded-lg transition touch-manipulation"
                >
                  Admit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header Info - MOBILE OPTIMIZED */}
      <div className="absolute top-0 left-0 right-0 z-10 p-2 md:p-4 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
        <div className="flex flex-col pointer-events-auto">
          <h1 className="text-sm md:text-lg font-semibold text-white/90 flex items-center gap-1 md:gap-2">
            <span className="truncate max-w-[150px] md:max-w-none">{roomId}</span>
            <button
              onClick={copyInviteLink}
              className="p-1 md:p-1.5 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors text-white/60 hover:text-white touch-manipulation"
              title="Copy joining info"
            >
              <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </h1>
        </div>
        <div className="px-2 md:px-4 py-1 md:py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-1 md:gap-2 pointer-events-auto">
          <svg className="w-3 h-3 md:w-4 md:h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span className="text-xs md:text-sm font-medium">{participants.length + 1}</span>
        </div>
      </div>

      {/* MOBILE OPTIMIZED: Participant Grid (Remote Only) */}
      <div className="h-full w-full pb-20 md:pb-24">
        {participants.length > 0 ? (
          <div className={`grid h-full w-full gap-1 md:gap-2 p-1 md:p-2 content-center ${participants.length === 1 ? 'grid-cols-1' :
            participants.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
              participants.length <= 4 ? 'grid-cols-2' :
                participants.length <= 9 ? 'grid-cols-2 md:grid-cols-3' :
                  'grid-cols-2 md:grid-cols-4'
            }`}>
            {participants.map(p => (
              <div
                key={p.id}
                className="relative overflow-hidden rounded-xl md:rounded-2xl bg-[#1C1F26] shadow-lg aspect-[3/4] md:aspect-video"
              >
                <VideoTile
                  stream={p.stream}
                  userName={p.name}
                  isLocal={false}
                  isMuted={!p.isMicOn}
                  isCameraOff={!p.isCameraOn}
                  isPinned={pinnedId === p.id}
                  isActiveSpeaker={activeSpeakerId === p.id}
                  onPin={() => handlePin(p.id)}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          // No participants - show welcome message
          <div className="flex flex-col items-center justify-center h-full px-4">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-16 h-16 md:w-20 md:h-20 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 md:w-10 md:h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h2 className="text-xl md:text-2xl font-semibold">Waiting for others to join</h2>
              <p className="text-sm md:text-base text-gray-400">
                Share the meeting link to invite participants
              </p>
              <button
                onClick={copyInviteLink}
                className="px-4 md:px-6 py-2 md:py-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-lg font-medium transition touch-manipulation text-sm md:text-base"
              >
                Copy Invite Link
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DRAGGABLE LOCAL VIDEO - Works on Mobile & Desktop */}
      <DraggableLocalVideo
        stream={stream}
        userName={userName}
        isMicOn={isMicOn}
        isCameraOn={isCameraOn}
        isScreenSharing={isScreenSharing}
      />

      {/* Floating Controls - MOBILE OPTIMIZED */}
      <div
        className="absolute bottom-0 left-0 w-full h-20 md:h-32 z-20 flex items-end justify-center pb-4 md:pb-8 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-500 hover:opacity-100"
        style={{ opacity: isIdle && !isHoveringControls ? 0 : 1 }}
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
        onTouchStart={() => setIsHoveringControls(true)}
      >
        <motion.div
          initial={{ y: 0 }}
          animate={{ y: isIdle && !isHoveringControls ? 100 : 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <ControlsBar
            isMicOn={isMicOn}
            isCameraOn={isCameraOn}
            isScreenSharing={isScreenSharing}
            onToggleMic={handleMicToggle}
            onToggleCam={handleCamToggle}
            onToggleShare={handleToggleScreenShare}
            onLeave={handleLeave}
          />
        </motion.div>
      </div>
    </div>
  );
}
