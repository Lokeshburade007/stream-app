"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  Radio,
  Mic,
  MicOff,
  PhoneOff,
  Headphones
} from "lucide-react";
import { io } from "socket.io-client";
import Hls from "hls.js";
import { API_URL, APP_URL, apiUrl } from "../lib/api";

function resolveMediaUrl(source) {
  if (!source) return null;
  return source.startsWith("http") ? source : apiUrl(source);
}

function parseStoryboardVtt(contents, vttUrl) {
  const cuePattern = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s*\n([^\n]+)/g;
  const toSeconds = (time) => {
    const [hours, minutes, seconds] = time.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  };
  const cues = [];
  let match;

  while ((match = cuePattern.exec(contents)) !== null) {
    const [imagePath, coordinates] = match[3].trim().split("#xywh=");
    const [x, y, width, height] = (coordinates || "").split(",").map(Number);
    if (!imagePath || ![x, y, width, height].every(Number.isFinite)) continue;
    cues.push({
      start: toSeconds(match[1]),
      end: toSeconds(match[2]),
      imageUrl: new URL(imagePath, vttUrl).toString(),
      x,
      y,
      width,
      height
    });
  }

  return cues;
}

export default function CinemaPlayer({
  movie,
  user,
  partyParticipant,
  watchPartyRoom = null,
  onClose,
  initialTime = 0
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const socketRef = useRef(null);
  const hlsRef = useRef(null);
  const usedFallbackRef = useRef(false);
  const localVoiceStreamRef = useRef(null);
  const voicePeersRef = useRef(new Map());
  const remoteVoiceAudioRef = useRef(new Map());
  const voiceJoinedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  // Start closed for a stable first paint. Desktop opens the lounge after mount;
  // phones keep the film visible until the viewer explicitly opens Party Chat.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState(watchPartyRoom?.messages || []);
  const [newMessage, setNewMessage] = useState("");
  const [participants, setParticipants] = useState(watchPartyRoom?.participants || []);
  const [roomState, setRoomState] = useState(watchPartyRoom);
  const [copiedLink, setCopiedLink] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [syncStatus, setSyncStatus] = useState("In Sync");
  const [qualityLevels, setQualityLevels] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [storyboardCues, setStoryboardCues] = useState([]);
  const [scrubPreview, setScrubPreview] = useState(null);
  const [playbackError, setPlaybackError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [sourceOverride, setSourceOverride] = useState(null);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState([]);
  const [voiceError, setVoiceError] = useState("");

  const hideControlsTimer = useRef(null);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 769px)");
    const updateSidebarForViewport = () => setSidebarOpen(Boolean(watchPartyRoom) && desktopQuery.matches);
    const initialViewportUpdate = window.setTimeout(updateSidebarForViewport, 0);
    if (watchPartyRoom) desktopQuery.addEventListener("change", updateSidebarForViewport);
    return () => {
      window.clearTimeout(initialViewportUpdate);
      desktopQuery.removeEventListener("change", updateSidebarForViewport);
    };
  }, [watchPartyRoom]);

  // 1. Initialize Video stream URL
  const primaryVideoSrc = resolveMediaUrl(movie?.videoSource) || apiUrl(`/api/media/stream/${movie?.id || "sample-teaser"}`);
  const fallbackVideoSrc = resolveMediaUrl(movie?.fallbackSource);
  const videoSrc = sourceOverride || primaryVideoSrc;
  const isHlsStream = /\.m3u8(?:[?#]|$)/i.test(videoSrc);
  const externalSubtitleTracks = movie?.subtitleTracks || [];
  const availableSubtitleTracks = subtitleTracks.length ? subtitleTracks : externalSubtitleTracks;

  const removeVoicePeer = useCallback((socketId) => {
    const peer = voicePeersRef.current.get(socketId);
    if (peer) peer.close();
    voicePeersRef.current.delete(socketId);
    const audio = remoteVoiceAudioRef.current.get(socketId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    remoteVoiceAudioRef.current.delete(socketId);
  }, []);

  const createVoicePeer = useCallback((remoteSocketId, shouldOffer = false) => {
    if (!voiceJoinedRef.current || !remoteSocketId || remoteSocketId === socketRef.current?.id) return null;
    const existing = voicePeersRef.current.get(remoteSocketId);
    if (existing) return existing;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    voicePeersRef.current.set(remoteSocketId, peer);
    localVoiceStreamRef.current?.getTracks().forEach((track) => peer.addTrack(track, localVoiceStreamRef.current));
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit("party:voice:signal", { to: remoteSocketId, signal: { candidate } });
    };
    peer.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (!stream) return;
      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = stream;
      remoteVoiceAudioRef.current.set(remoteSocketId, audio);
      audio.play().catch(() => {});
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState)) removeVoicePeer(remoteSocketId);
    };

    if (shouldOffer) {
      peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => socketRef.current?.emit("party:voice:signal", { to: remoteSocketId, signal: { description: peer.localDescription } }))
        .catch(() => setVoiceError("Unable to connect voice chat to a participant."));
    }
    return peer;
  }, [removeVoicePeer]);

  const leaveVoiceChat = useCallback(() => {
    socketRef.current?.emit("party:voice:leave");
    voiceJoinedRef.current = false;
    voicePeersRef.current.forEach((_, socketId) => removeVoicePeer(socketId));
    localVoiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    localVoiceStreamRef.current = null;
    setVoiceJoined(false);
    setVoiceMuted(false);
    setVoiceMembers([]);
  }, [removeVoicePeer]);

  const toggleVoiceChat = useCallback(async () => {
    if (voiceJoinedRef.current) {
      leaveVoiceChat();
      return;
    }
    if (!socketRef.current?.connected) {
      setVoiceError("Join the watch party before starting voice chat.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("This browser does not support microphone access.");
      return;
    }

    try {
      setVoiceError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      localVoiceStreamRef.current = stream;
      voiceJoinedRef.current = true;
      setVoiceJoined(true);
      setVoiceMuted(false);
      socketRef.current.emit("party:voice:join");
    } catch (error) {
      setVoiceError(error.name === "NotAllowedError" ? "Microphone permission was blocked. Allow it in your browser settings." : "Unable to access your microphone.");
    }
  }, [leaveVoiceChat]);

  const toggleVoiceMute = useCallback(() => {
    if (!voiceJoinedRef.current) return;
    const muted = !voiceMuted;
    localVoiceStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    setVoiceMuted(muted);
    socketRef.current?.emit("party:voice:mute", { muted });
  }, [voiceMuted]);

  useEffect(() => {
    usedFallbackRef.current = false;
    const resetTimer = window.setTimeout(() => {
      setSourceOverride(null);
      setPlaybackError("");
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [movie?.id]);

  // HLS playback is attached imperatively. Safari uses native HLS; other
  // browsers use hls.js for adaptive switching and track selection.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    setPlaybackError("");
    setQualityLevels([]);
    setSelectedQuality(-1);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setSelectedSubtitle(-1);

    if (!isHlsStream) {
      video.src = videoSrc;
      video.load();
      return undefined;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoSrc;
      video.load();
      return undefined;
    }

    if (!Hls.isSupported()) {
      const errorTimer = window.setTimeout(() => {
        setPlaybackError("This browser does not support adaptive HLS playback.");
      }, 0);
      return () => window.clearTimeout(errorTimer);
    }

    const hls = new Hls({
      enableWorker: true,
      capLevelToPlayerSize: true,
      startLevel: -1
    });
    hlsRef.current = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      setQualityLevels(data.levels.map((level, index) => ({
        index,
        label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} Mbps`
      })));
    });
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
      setAudioTracks(data.audioTracks.map((track, index) => ({
        index,
        label: track.name || track.lang || `Audio ${index + 1}`
      })));
    });
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
      setSubtitleTracks(data.subtitleTracks.map((track, index) => ({
        index,
        label: track.name || track.lang || `Subtitle ${index + 1}`
      })));
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        setIsLoading(false);
        setPlaybackError(`HLS playback error: ${data.type}`);
      }
    });
    hls.loadSource(videoSrc);
    hls.attachMedia(video);

    return () => {
      hls.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
    };
  }, [videoSrc, isHlsStream]);

  useEffect(() => {
    const vttPath = movie?.thumbnailVtt;
    if (!vttPath) {
      const clearTimer = window.setTimeout(() => setStoryboardCues([]), 0);
      return () => window.clearTimeout(clearTimer);
    }

    const controller = new AbortController();
    const vttUrl = resolveMediaUrl(vttPath);
    fetch(vttUrl, { signal: controller.signal })
      .then((response) => response.ok ? response.text() : "")
      .then((contents) => setStoryboardCues(parseStoryboardVtt(contents, vttUrl)))
      .catch(() => setStoryboardCues([]));

    return () => controller.abort();
  }, [movie]);

  // 2. Setup Watch Party Socket Connection if active
  useEffect(() => {
    if (!watchPartyRoom) return;

    const socket = io(API_URL);
    socketRef.current = socket;

    // Join room on connect
    socket.on("connect", () => {
      socket.emit("party:join", {
        roomCode: watchPartyRoom.code,
        user: partyParticipant || user || { userId: "guest", name: "Viewer" }
      });
    });

    socket.on("party:joined", (data) => {
      setRoomState(data);
      setParticipants(data.participants);
      setChatMessages(data.messages);
      setVoiceMembers(data.participants.filter((participant) => participant.voiceJoined).map((participant) => participant.socketId));
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

    socket.on("party:voice:participants", (socketIds) => {
      setVoiceMembers((previous) => [...new Set([...previous, ...socketIds, socket.id])]);
      socketIds.forEach((socketId) => createVoicePeer(socketId, true));
    });

    socket.on("party:voice:participant_joined", ({ socketId }) => {
      setVoiceMembers((previous) => [...new Set([...previous, socketId])]);
      setParticipants((previous) => previous.map((participant) => participant.socketId === socketId
        ? { ...participant, voiceJoined: true, voiceMuted: false }
        : participant));
    });

    socket.on("party:voice:participant_left", ({ socketId }) => {
      removeVoicePeer(socketId);
      setVoiceMembers((previous) => previous.filter((id) => id !== socketId));
    });

    socket.on("party:voice:state", ({ socketId, muted }) => {
      setParticipants((previous) => previous.map((participant) => participant.socketId === socketId
        ? { ...participant, voiceMuted: muted, voiceJoined: true }
        : participant));
    });

    socket.on("party:voice:signal", async ({ from, signal }) => {
      if (!voiceJoinedRef.current) return;
      try {
        const peer = createVoicePeer(from, false);
        if (!peer) return;
        if (signal.description) {
          await peer.setRemoteDescription(signal.description);
          if (signal.description.type === "offer") {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socket.emit("party:voice:signal", { to: from, signal: { description: peer.localDescription } });
          }
        } else if (signal.candidate) {
          await peer.addIceCandidate(signal.candidate);
        }
      } catch {
        setVoiceError("Voice connection could not be established with a participant.");
      }
    });

    socket.on("party:error", ({ message }) => {
      setSyncStatus(message || "Unable to join watch party");
    });

    socket.on("connect_error", () => {
      setSyncStatus("Party server unavailable");
    });

    return () => {
      leaveVoiceChat();
      socket.disconnect();
    };
  }, [watchPartyRoom, partyParticipant, user, createVoicePeer, leaveVoiceChat, removeVoicePeer]);

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
      startPlayback();
    } else {
      vid.pause();
      setIsPlaying(false);
      emitPartyAction("pause", vid.currentTime);
    }
  };

  const startPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play()
      .then(() => {
        setIsPlaying(true);
        setPlaybackError("");
        emitPartyAction("play", video.currentTime);
      })
      .catch(() => {
        setIsLoading(false);
        setPlaybackError("Unable to start playback. Press Play again after interacting with the page.");
      });
  };

  const handleVideoCanPlay = () => {
    setIsLoading(false);
  };

  const handleVideoError = () => {
    if (fallbackVideoSrc && videoSrc !== fallbackVideoSrc && !usedFallbackRef.current) {
      usedFallbackRef.current = true;
      setPlaybackError("The preferred stream was unavailable. Trying a compatible source…");
      setSourceOverride(fallbackVideoSrc);
      setIsLoading(true);
      return;
    }
    setIsLoading(false);
    setPlaybackError("This video could not be played. Please try another title or refresh the catalogue.");
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

  const handleScrubHover = (e) => {
    if (!storyboardCues.length || !duration || !Number.isFinite(duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = position * duration;
    const cue = storyboardCues.find((item) => targetTime >= item.start && targetTime <= item.end) || storyboardCues.at(-1);
    if (cue) setScrubPreview({ ...cue, position, time: targetTime });
  };

  const selectQuality = (value) => {
    const quality = Number(value);
    setSelectedQuality(quality);
    if (hlsRef.current) hlsRef.current.currentLevel = quality;
  };

  const selectAudioTrack = (value) => {
    const trackIndex = Number(value);
    if (hlsRef.current) hlsRef.current.audioTrack = trackIndex;
  };

  const selectSubtitleTrack = (value) => {
    const trackIndex = Number(value);
    setSelectedSubtitle(trackIndex);
    if (hlsRef.current && subtitleTracks.length) {
      hlsRef.current.subtitleTrack = trackIndex;
      return;
    }

    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    window.setTimeout(() => {
      for (let index = 0; index < tracks.length; index += 1) {
        tracks[index].mode = trackIndex === index ? "showing" : "disabled";
      }
    }, 0);
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
    const url = `${APP_URL || window.location.origin}?room=${watchPartyRoom.code}`;
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
          <div className="player-header-left">
            <button
              id="player-btn-back"
              className="back-btn"
              onClick={onClose}
              title="Back to Catalog (Esc)"
            >
              <ArrowLeft size={18} /> Back
            </button>
            <h2 className="player-title">{movie?.title}</h2>
          </div>

          <div className="player-header-actions">
            {watchPartyRoom && (
              <button
                id="btn-sync-host"
                onClick={requestHostSync}
                className="sync-host-button"
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
                onClick={() => setSidebarOpen((open) => !open)}
                aria-expanded={sidebarOpen}
                aria-controls="watch-party-sidebar"
                className="party-sidebar-toggle"
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
                <span className="party-sidebar-toggle-label">Party Chat ({participants.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Video Element */}
        <div className="player-main" onClick={togglePlay}>
          <video
            ref={videoRef}
            className="cinema-video"
            playsInline
            preload="metadata"
            poster={resolveMediaUrl(movie?.backdrop || movie?.poster) || undefined}
            crossOrigin={isHlsStream ? "anonymous" : undefined}
            onLoadStart={() => setIsLoading(true)}
            onWaiting={() => setIsLoading(true)}
            onCanPlay={handleVideoCanPlay}
            onPlaying={() => {
              setIsLoading(false);
              setIsPlaying(true);
            }}
            onPause={() => setIsPlaying(false)}
            onError={handleVideoError}
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
          >
            {externalSubtitleTracks.map((track, index) => (
              <track
                key={track.id || track.src}
                kind="subtitles"
                srcLang={track.language || "und"}
                label={track.label || `Subtitle ${index + 1}`}
                src={resolveMediaUrl(track.src)}
              />
            ))}
          </video>

          {isLoading && !playbackError && (
            <div className="player-loading-overlay" aria-live="polite">
              <span className="player-loading-spinner" />
              <span>Loading {movie?.title}…</span>
            </div>
          )}

          {!isLoading && !isPlaying && !playbackError && (
            <button
              type="button"
              className="player-center-play"
              onClick={(event) => {
                event.stopPropagation();
                startPlayback();
              }}
              aria-label={`Play ${movie?.title || "video"}`}
            >
              <Play size={34} fill="#000" />
              <span>Play</span>
            </button>
          )}

          {playbackError && (
            <div className="player-playback-error" role="alert">
              <span>{playbackError}</span>
              {!isLoading && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    startPlayback();
                  }}
                >
                  Try again
                </button>
              )}
            </div>
          )}

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
          <div
            className="scrub-container"
            onClick={handleSeek}
            onMouseMove={handleScrubHover}
            onMouseLeave={() => setScrubPreview(null)}
            id="player-scrub-bar"
          >
            {scrubPreview && (
              <div
                className="scrub-thumbnail-preview"
                style={{ left: `${scrubPreview.position * 100}%` }}
              >
                <div
                  className="scrub-thumbnail-image"
                  style={{
                    width: scrubPreview.width,
                    height: scrubPreview.height,
                    backgroundImage: `url(${scrubPreview.imageUrl})`,
                    backgroundPosition: `-${scrubPreview.x}px -${scrubPreview.y}px`
                  }}
                />
                <span>{formatTime(scrubPreview.time)}</span>
              </div>
            )}
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
              {isHlsStream && qualityLevels.length > 0 && (
                <label className="stream-picker" title="Adaptive playback quality">
                  <span>Quality</span>
                  <select value={selectedQuality} onChange={(event) => selectQuality(event.target.value)}>
                    <option value={-1}>Auto</option>
                    {qualityLevels.map((level) => (
                      <option key={level.index} value={level.index}>{level.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {audioTracks.length > 1 && (
                <label className="stream-picker" title="Audio track">
                  <span>Audio</span>
                  <select onChange={(event) => selectAudioTrack(event.target.value)} defaultValue={0}>
                    {audioTracks.map((track) => (
                      <option key={track.index} value={track.index}>{track.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {availableSubtitleTracks.length > 0 && (
                <label className="stream-picker" title="Subtitle track">
                  <span>Subs</span>
                  <select value={selectedSubtitle} onChange={(event) => selectSubtitleTrack(event.target.value)}>
                    <option value={-1}>Off</option>
                    {availableSubtitleTracks.map((track, index) => (
                      <option key={track.id || track.index || index} value={track.index ?? index}>
                        {track.label || `Subtitle ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

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
            <button
              type="button"
              className="mobile-party-back"
              onClick={() => setSidebarOpen(false)}
              aria-label="Back to video"
            >
              <ArrowLeft size={18} /> Back to video
            </button>
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
            {watchPartyRoom.hostId === (partyParticipant?.userId || partyParticipant?.id || user?.id || user?.userId) && (
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

          {/* Optional peer-to-peer voice chat. Movie sound remains controlled by
              the player; this only controls the viewer's microphone. */}
          <div className="voice-chat-panel">
            <div>
              <div className="voice-chat-title"><Headphones size={15} /> Party voice</div>
              <div className="voice-chat-status">
                {voiceJoined ? `${voiceMembers.length || 1} in voice` : "Join to speak with friends"}
              </div>
            </div>
            <div className="voice-chat-actions">
              {voiceJoined && (
                <button
                  type="button"
                  className={`voice-action-button ${voiceMuted ? "muted" : ""}`}
                  onClick={toggleVoiceMute}
                  title={voiceMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {voiceMuted ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
              <button
                type="button"
                className={`voice-join-button ${voiceJoined ? "leave" : ""}`}
                onClick={toggleVoiceChat}
              >
                {voiceJoined ? <><PhoneOff size={15} /> Leave</> : <><Mic size={15} /> Join voice</>}
              </button>
            </div>
          </div>
          {voiceError && <div className="voice-chat-error">{voiceError}</div>}

          {/* Connected Participants List */}
          <div className="participants-bar">
            {participants.map((p) => (
              <div key={p.socketId || p.userId} className="participant-chip">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.isHost ? "#E50914" : "#46d369" }} />
                <span>{p.name}</span>
                {p.voiceJoined && (p.voiceMuted ? <MicOff size={11} color="#aaa" /> : <Mic size={11} color="#46d369" />)}
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
