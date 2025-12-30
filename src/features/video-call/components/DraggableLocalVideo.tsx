import { useRef, useState, useEffect } from 'react';
import { VideoTile } from './VideoTile';

interface DraggableLocalVideoProps {
    stream: MediaStream | null;
    userName: string;
    isMicOn: boolean;
    isCameraOn: boolean;
    isScreenSharing?: boolean;
}

export const DraggableLocalVideo = ({
    stream,
    userName,
    isMicOn,
    isCameraOn,
    isScreenSharing = false,
}: DraggableLocalVideoProps) => {
    // FIXED: Initialize to bottom-right position
    const getInitialPosition = () => {
        const isMobile = window.innerWidth < 768;
        const videoWidth = isMobile ? 120 : 240;
        const videoHeight = isMobile ? 160 : 180;

        // Bottom-right with padding from edges and controls
        return {
            x: window.innerWidth - videoWidth - (isMobile ? 8 : 20),
            y: window.innerHeight - videoHeight - (isMobile ? 90 : 140), // Extra space for controls
        };
    };

    const [position, setPosition] = useState(getInitialPosition());
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isMinimized, setIsMinimized] = useState(false);
    const videoRef = useRef<HTMLDivElement>(null);

    // MOBILE: Touch and mouse support
    const handleStart = (clientX: number, clientY: number) => {
        if (!videoRef.current) return;

        const rect = videoRef.current.getBoundingClientRect();
        setDragOffset({
            x: clientX - rect.left,
            y: clientY - rect.top,
        });
        setIsDragging(true);
    };

    const handleMove = (clientX: number, clientY: number) => {
        if (!isDragging) return;

        const isMobile = window.innerWidth < 768;
        const videoWidth = isMinimized ? (isMobile ? 100 : 120) : (isMobile ? 140 : 240);
        const videoHeight = isMinimized ? (isMobile ? 100 : 120) : (isMobile ? 180 : 180);

        // FIXED: Account for controls bar height (mobile: 80px, desktop: 128px)
        const controlsHeight = isMobile ? 80 : 128;
        const padding = isMobile ? 8 : 20;

        const newX = clientX - dragOffset.x;
        const newY = clientY - dragOffset.y;

        // OPTIMIZATION: Constrain to viewport with controls space
        const maxX = window.innerWidth - videoWidth - padding;
        const maxY = window.innerHeight - videoHeight - controlsHeight - padding;

        setPosition({
            x: Math.max(padding, Math.min(newX, maxX)),
            y: Math.max(padding, Math.min(newY, maxY)),
        });
    };

    const handleEnd = () => {
        setIsDragging(false);
    };

    // Mouse events
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        handleStart(e.clientX, e.clientY);
    };

    // Touch events for mobile
    const handleTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length > 0) {
                e.preventDefault(); // Prevent scrolling while dragging
                handleMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleEnd);
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleEnd);

            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleEnd);
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleEnd);
            };
        }
    }, [isDragging, dragOffset]);

    // FIXED: Reposition on resize and minimize toggle
    useEffect(() => {
        const handleResize = () => {
            setPosition(getInitialPosition());
        };

        handleResize(); // Set initial position
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isMinimized]);

    const isMobile = window.innerWidth < 768;
    const videoSize = isMinimized
        ? { width: isMobile ? 100 : 120, height: isMobile ? 100 : 120 }
        : { width: isMobile ? 140 : 240, height: isMobile ? 180 : 180 };

    return (
        <div
            ref={videoRef}
            className={`fixed z-40 transition-all duration-200 ${isDragging ? 'cursor-grabbing scale-105 shadow-2xl' : 'cursor-grab shadow-xl'
                }`}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${videoSize.width}px`,
                height: `${videoSize.height}px`,
                touchAction: 'none', // Prevent scrolling while dragging on mobile
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
        >
            {/* Draggable Container with Glassmorphism */}
            <div className="relative h-full w-full group">
                {/* Drag Handle - Visible indicator */}
                <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-black/40 to-transparent rounded-t-2xl z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-1 bg-white/40 rounded-full" />
                </div>

                {/* Video Container */}
                <div className="h-full w-full rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl backdrop-blur-sm bg-black/40">
                    <VideoTile
                        stream={stream}
                        userName={isMinimized ? '' : userName}
                        isLocal={true}
                        isMuted={true}
                        isCameraOff={!isCameraOn}
                        onPin={() => { }}
                        className="h-full w-full object-cover"
                    />

                    {/* Screen Sharing Indicator */}
                    {isScreenSharing && !isMinimized && (
                        <div className="absolute top-2 left-2 bg-blue-500/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-medium text-white flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" />
                            </svg>
                            Sharing
                        </div>
                    )}

                    {/* Mic Status Indicator */}
                    {!isMicOn && !isMinimized && (
                        <div className="absolute bottom-2 left-2 bg-red-500/90 backdrop-blur-sm p-1.5 rounded-full">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Minimize/Maximize Button - Always visible on mobile */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsMinimized(!isMinimized);
                    }}
                    className={`absolute -top-2 -right-2 bg-white/90 hover:bg-white active:bg-gray-100 text-gray-800 rounded-full p-1.5 shadow-lg transition-all ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                    style={{ touchAction: 'auto' }}
                >
                    {isMinimized ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                    ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
};
