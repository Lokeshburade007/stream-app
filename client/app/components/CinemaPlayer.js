"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ArrowLeft,
  Users,
  MessageSquare,
  Send,
  Copy,
  Check,
  Zap,
  Lock,
  Unlock,
  Radio
} from "lucide-react";
import { io } from "socket.io-client";
import { API_URL, apiUrl } from "../lib/api";

export default function CinemaPlayer({
  movie,
  user,
  watchPartyRoom = null,
  onClose,
  initialTime = 0
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const socketRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(Boolean(watchPartyRoom));
  const [chatMessages, setChatMessages] = useState(watchPartyRoom?.messages || []);
  const [newMessage, setNewMessage] = useState("");
  const [participants, setParticipants] = useState(watchPartyRoom?.participants || []);
  const [roomState, setRoomState] = useState(watchPartyRoom);
  const [copiedLink, setCopiedLink] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [syncStatus, setSyncStatus] = useState("In Sync");

  const hideControlsTimer = useRef(null);

  // 1. Initialize Video stream URL
  const videoSrc = movie?.videoSource
    ? movie.videoSource.startsWith("http")
      ? movie.videoSource
      : apiUrl(movie.videoSource)
    : apiUrl(`/api/media/stream/${movie?.id || "sample-teaser"}`);

  // 2. Setup Watch Party Socket Connection if active
  useEffect(() => {
    if (!watchPartyRoom) return;

    const socket = io(API_URL);
    socketRef.current = socket;

    // Join room on connect
    socket.on("connect", () => {
      socket.emit("party:join", {
        roomCode: watchPartyRoom.code,
        user: user || { userId: "guest", name: "Viewer" }
      });
    });

    socket.on("party:joined", (data) => {
      setRoomState(data);
      setParticipants(data.participants);
      setChatMessages(data.messages);
      if (videoRef.current && Number.isFinite(data.currentTime) && data.currentTime > 0) {
        videoRef.current.currentTime = data.currentTime;
      }
    });

    socket.on("party:sync_action", ({ action, currentTime, initiatedBy }) => {
      const vid = videoRef.current;
      if (!vid) return;

      // Check drift
      if (Number.isFinite(currentTime)) {
        const drift = Math.abs(vid.currentTime - currentTime);
        if (drift > 1.2) {
          vid.currentTime = currentTime;
        }
      }

      if (action === "play" && vid.paused) {
        vid.play().catch(() => {});
        setIsPlaying(true);
      } else if (action === "pause" && !vid.paused) {
        vid.pause();
        setIsPlaying(false);
      }
      setSyncStatus(`Synced (${initiatedBy})`);
      setTimeout(() => setSyncStatus("In Sync"), 3000);
    });

    socket.on("party:participant_joined", ({ participant, participantsCount, messages }) => {
      setParticipants((prev) => [...prev.filter((p) => p.socketId !== participant.socketId), participant]);
      if (messages) setChatMessages(messages);
    });

    socket.on("party:participant_left", ({ leavingUser, participants }) => {
      if (participants) setParticipants(participants);
    });

    socket.on("party:new_message", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    socket.on("party:emoji_reaction", ({ id, emoji, senderName }) => {
      setFloatingEmojis((prev) => [...prev, { id, emoji, senderName }]);
      setTimeout(() => {
        setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
      }, 2200);
    });

    socket.on("party:control_updated", ({ hostOnlyControl }) => {
      setRoomState((prev) => ({ ...prev, hostOnlyControl }));
    });

    return () => {
      socket.disconnect();
    };
  }, [watchPartyRoom, user]);

  // 3. Auto-save progress to backend every 5 seconds for cross-device resume
  useEffect(() => {
    const saveInterval = setInterval(() => {
      const vid = videoRef.current;
      if (vid && !vid.paused && user && movie) {
        fetch(apiUrl("/api/user/progress"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id || user.userId || "demo_user",
            mediaId: movie.id,
            positionSeconds: vid.currentTime,
            durationSeconds: vid.duration || movie.duration || 600,
            device: "Next.js Web Cinema"
          })
        }).catch(() => {});
      }
    }, 5000);

    return () => clearInterval(saveInterval);
  }, [user, movie]);

  useEffect(() => {
    if (Number.isFinite(initialTime) && initialTime > 0 && videoRef.current) {
      videoRef.current.currentTime = initialTime;
    }
  }, [initialTime]);

  // 5. Controls inactivity timeout
  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3500);
  };

  // 6. Playback handlers
  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;

    if (vid.paused) {
      vid.play().catch(() => {});
      setIsPlaying(true);
      emitPartyAction("play", vid.currentTime);
    } else {
      vid.pause();
      setIsPlaying(false);
      emitPartyAction("pause", vid.currentTime);
    }
  };

  const handleSeek = (e) => {
    const vid = videoRef.current;
    if (!vid || !duration || !Number.isFinite(duration)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const targetTime = pos * duration;

    if (Number.isFinite(targetTime) && targetTime >= 0) {
      vid.currentTime = targetTime;
      setCurrentTime(targetTime);
      emitPartyAction("seek", targetTime);
    }
  };

  const skipSeconds = (seconds) => {
    const vid = videoRef.current;
    if (!vid) return;
    const current = Number.isFinite(vid.currentTime) ? vid.currentTime : 0;
    const maxDur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : (movie?.duration || 600);
    const newTime = Math.max(0, Math.min(maxDur, current + seconds));
    if (Number.isFinite(newTime)) {
      vid.currentTime = newTime;
      setCurrentTime(newTime);
      emitPartyAction("seek", newTime);
    }
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const emitPartyAction = (action, time) => {
    if (socketRef.current && watchPartyRoom) {
      socketRef.current.emit("party:action", {
        action,
        currentTime: time
      });
    }
  };

  const requestHostSync = () => {
    if (socketRef.current) {
      socketRef.current.emit("party:request_sync");
    }
  };

  // 7. Watch Party Chat & Reactions
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socketRef.current) return;

    socketRef.current.emit("party:chat", { text: newMessage });
    setNewMessage("");
  };

  const sendReaction = (emoji) => {
    if (socketRef.current) {
      socketRef.current.emit("party:reaction", { emoji });
    }
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}?room=${watchPartyRoom.code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const formatTime = (secs) => {
    if (isNaN(secs)) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        skipSeconds(-10);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        skipSeconds(10);
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "Escape" && !document.fullscreenElement) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, duration]);

  return (
    <div
      ref={containerRef}
      className="player-overlay"
      onMouseMove={handleMouseMove}
      style={{ display: "flex", flexDirection: "row" }}
    >
      {/* Main Video Viewport */}
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", background: "#000" }}>
        {/* Top Header Bar */}
        <div className={`player-header ${!showControls ? "hidden-controls" : ""}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              id="player-btn-back"
              className="back-btn"
              onClick={onClose}
              title="Back to Catalog (Esc)"
            >
              <ArrowLeft size={18} /> Back
            </button>
            <h2 style={{ fontSize: "18px", fontWeight: 700 }}>{movie?.title}</h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {watchPartyRoom && (
              <button
                id="btn-sync-host"
                onClick={requestHostSync}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(70, 211, 105, 0.2)",
                  border: "1px solid #46d369",
                  color: "#46d369",
                  padding: "6px 12px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                <Zap size={14} /> Sync with Host
              </button>
            )}

            {watchPartyRoom && (
              <button
                id="btn-toggle-sidebar"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: sidebarOpen ? "#E50914" : "rgba(255,255,255,0.15)",
                  color: "#fff",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                <Users size={16} />
                <span>Party Chat ({participants.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Video Element */}
        <div className="player-main" onClick={togglePlay}>
          <video
            ref={videoRef}
            src={videoSrc}
            className="cinema-video"
            playsInline
            onTimeUpdate={() => {
              if (videoRef.current) {
                setCurrentTime(videoRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
              }
            }}
            onEnded={() => setIsPlaying(false)}
          />

          {/* Floating Emoji Reactions */}
          {floatingEmojis.map((rx) => (
            <div key={rx.id} className="floating-emoji">
              {rx.emoji}
            </div>
          ))}
        </div>

        {/* Custom Video Controls Bar */}
        <div className={`player-controls ${!showControls ? "hidden-controls" : ""}`}>
          {/* Progress Scrub Bar */}
          <div className="scrub-container" onClick={handleSeek} id="player-scrub-bar">
            <div
              className="scrub-fill"
              style={{
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`
              }}
            />
          </div>

          <div className="controls-row">
            <div className="controls-left">
              <button
                id="player-play-toggle"
                className="icon-btn"
                onClick={togglePlay}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} fill="#fff" />}
              </button>

              <button
                id="player-skip-back"
                className="icon-btn"
                onClick={() => skipSeconds(-10)}
                title="Rewind 10s (Left Arrow)"
              >
                <RotateCcw size={20} />
              </button>

              <button
                id="player-skip-forward"
                className="icon-btn"
                onClick={() => skipSeconds(10)}
                title="Forward 10s (Right Arrow)"
              >
                <RotateCw size={20} />
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  id="player-mute-toggle"
                  className="icon-btn"
                  onClick={toggleMute}
                  title="Mute/Unmute (M)"
                >
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  style={{ width: 80, accentColor: "#E50914", cursor: "pointer" }}
                />
              </div>

              <span className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="controls-right">
              {watchPartyRoom && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#46d369" }}>
                  <div className="sync-dot" />
                  <span>{syncStatus}</span>
                </div>
              )}

              <button
                id="player-fullscreen-toggle"
                className="icon-btn"
                onClick={toggleFullscreen}
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Watch Party Side Lounge */}
      {watchPartyRoom && sidebarOpen && (
        <aside className="party-sidebar" id="watch-party-sidebar">
          <div className="sidebar-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="room-badge">{watchPartyRoom.code}</span>
                <button
                  onClick={copyRoomLink}
                  style={{
                    background: "none",
                    border: "none",
                    color: copiedLink ? "#46d369" : "#aaa",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12
                  }}
                  title="Copy room link for friends"
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  {copiedLink ? "Copied Link!" : "Copy Invite"}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                Real-Time Watch Party Sync
              </div>
            </div>

            {/* Host Controls Lock Toggle */}
            {watchPartyRoom.hostId === (user?.id || user?.userId) && (
              <button
                onClick={() => {
                  const newMode = !roomState?.hostOnlyControl;
                  socketRef.current?.emit("party:toggle_control", { hostOnlyControl: newMode });
                }}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer"
                }}
                title={roomState?.hostOnlyControl ? "Controls locked to Host" : "Anyone can pause/seek"}
              >
                {roomState?.hostOnlyControl ? <Lock size={12} color="#E50914" /> : <Unlock size={12} color="#46d369" />}
                {roomState?.hostOnlyControl ? "Host Only" : "Collaborative"}
              </button>
            )}
          </div>

          {/* Connected Participants List */}
          <div className="participants-bar">
            {participants.map((p) => (
              <div key={p.socketId || p.userId} className="participant-chip">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.isHost ? "#E50914" : "#46d369" }} />
                <span>{p.name}</span>
                {p.isHost && <span style={{ fontSize: 10, color: "#ffb703" }}>★ Host</span>}
              </div>
            ))}
          </div>

          {/* Live Chat Message Feed */}
          <div className="chat-message-list">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`chat-msg ${msg.system ? "system" : ""}`}>
                {!msg.system && <div className="chat-author">{msg.senderName}</div>}
                <div className={msg.system ? "" : "chat-bubble"}>{msg.text}</div>
              </div>
            ))}
          </div>

          {/* Floating Reaction Bar */}
          <div className="reactions-bar">
            {["🍿", "🔥", "😱", "😂", "❤️", "👏"].map((emoji) => (
              <button
                key={emoji}
                className="reaction-btn"
                onClick={() => sendReaction(emoji)}
                title={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Chat Message Input */}
          <form onSubmit={handleSendMessage} className="chat-input-row">
            <input
              id="party-chat-input"
              type="text"
              className="chat-input"
              placeholder="Chat with friends..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button type="submit" className="chat-send-btn" id="party-chat-send">
              <Send size={16} />
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
