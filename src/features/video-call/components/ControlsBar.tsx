import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff } from "lucide-react";
import clsx from "clsx";

interface ControlButtonProps {
    onClick: () => void;
    isActive?: boolean;
    isDestructive?: boolean;
    icon: React.ReactNode;
    label?: string;
    description?: string;
}

const ControlButton = ({ onClick, isActive, isDestructive, icon, description }: ControlButtonProps) => {
    return (
        <button
            onClick={onClick}
            title={description}
            className={clsx(
                // MOBILE OPTIMIZED: Larger touch targets, active states
                "group relative flex items-center justify-center rounded-full transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                "touch-manipulation", // Disable double-tap zoom on mobile
                "active:scale-95", // Touch feedback
                "h-12 w-12 md:h-14 md:w-14", // Responsive sizing
                isDestructive
                    ? "bg-red-500 hover:bg-red-600 active:bg-red-700 text-white"
                    : isActive
                        ? "bg-[#2A2F3A] hover:bg-[#323846] active:bg-[#3A4050] text-white"
                        : "bg-white/10 text-white hover:bg-white/20 active:bg-white/30"
            )}
        >
            <div className={clsx(
                "h-5 w-5 md:h-6 md:w-6", // Responsive icon size
                !isActive && !isDestructive && "text-red-500"
            )}>{icon}</div>
        </button>
    );
};

interface ControlsBarProps {
    isMicOn: boolean;
    isCameraOn: boolean;
    isScreenSharing: boolean;
    onToggleMic: () => void;
    onToggleCam: () => void;
    onToggleShare: () => void;
    onLeave: () => void;
}

export const ControlsBar = ({
    isMicOn,
    isCameraOn,
    isScreenSharing,
    onToggleMic,
    onToggleCam,
    onToggleShare,
    onLeave
}: ControlsBarProps) => {
    return (
        <div className="flex items-center justify-center gap-2 md:gap-4 rounded-full bg-[#1C1F26]/90 px-3 md:px-6 py-3 md:py-4 shadow-2xl backdrop-blur-xl border border-white/5 mx-2 md:mx-4 mb-2 md:mb-6">
            {/* Mic Control */}
            <ControlButton
                onClick={onToggleMic}
                isActive={isMicOn}
                icon={isMicOn ? <Mic className="h-5 w-5 md:h-6 md:w-6" /> : <MicOff className="h-5 w-5 md:h-6 md:w-6" />}
                description={isMicOn ? "Turn off microphone" : "Turn on microphone"}
            />

            {/* Camera Control */}
            <ControlButton
                onClick={onToggleCam}
                isActive={isCameraOn}
                icon={isCameraOn ? <Video className="h-5 w-5 md:h-6 md:w-6" /> : <VideoOff className="h-5 w-5 md:h-6 md:w-6" />}
                description={isCameraOn ? "Turn off camera" : "Turn on camera"}
            />

            {/* Screen Share - Hidden on mobile, visible on desktop */}
            <button
                onClick={onToggleShare}
                className={clsx(
                    "items-center justify-center rounded-full transition-all duration-200",
                    "touch-manipulation active:scale-95",
                    "h-12 w-12 md:h-14 md:w-14",
                    "hidden md:flex", // Hide on mobile
                    isScreenSharing
                        ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] hover:bg-blue-700 active:bg-blue-800"
                        : "bg-[#2A2F3A] hover:bg-[#323846] active:bg-[#3A4050] text-white"
                )}
                title="Share screen"
            >
                <MonitorUp className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            {/* Divider - Hidden on mobile */}
            <div className="mx-1 md:mx-2 h-8 md:h-10 w-[1px] bg-white/10 hidden md:block" />

            {/* Leave Button - MOBILE OPTIMIZED */}
            <button
                onClick={onLeave}
                className={clsx(
                    "flex items-center gap-1 md:gap-2 rounded-full transition-all font-medium",
                    "touch-manipulation active:scale-95",
                    "h-12 md:h-14 px-4 md:px-8",
                    "bg-red-500 hover:bg-red-600 active:bg-red-700 text-white"
                )}
                title="Leave call"
            >
                <PhoneOff className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-sm md:text-base">Leave</span>
            </button>
        </div>
    );
};
