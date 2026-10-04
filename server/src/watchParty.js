// Real-time Watch Party Engine for synchronized multi-device streaming
import { MEDIA_CATALOG } from "./catalog.js";

export function setupWatchParty(io, tokenService) {
  // In-memory store of active watch party rooms
  const rooms = new Map();

  function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Namespace or root io connection
  io.on("connection", (socket) => {
    let currentRoomCode = null;
    let currentUser = null;

    // Authenticate socket using securepool token if provided
    socket.on("auth", async (token) => {
      try {
        if (token && tokenService) {
          const payload = await tokenService.verifyAccessToken(token);
          currentUser = {
            userId: payload.sub,
            email: payload.email || "Viewer",
            name: (payload.email || "Friend").split("@")[0],
          };
          socket.emit("auth:success", currentUser);
        }
      } catch (err) {
        socket.emit("auth:error", "Invalid authentication token");
      }
    });

    // 1. Create a new Watch Party Room
    socket.on("party:create", ({ mediaId, user, hostOnlyControl = false }) => {
      const media = MEDIA_CATALOG.find((m) => m.id === mediaId) || MEDIA_CATALOG[0];
      const roomCode = generateRoomCode();
      const userData = user || currentUser || {
        userId: `guest_${socket.id.substring(0, 5)}`,
        name: "Host User",
        email: "host@streamhub.io"
      };

      const room = {
        code: roomCode,
        mediaId: media.id,
        mediaTitle: media.title,
        mediaBackdrop: media.backdrop,
        duration: media.duration,
        hostId: userData.userId,
        hostName: userData.name,
        hostOnlyControl: Boolean(hostOnlyControl),
        currentTime: 0,
        isPlaying: false,
        lastUpdate: Date.now(),
        participants: new Map(),
        messages: [
          {
            id: `msg_${Date.now()}`,
            system: true,
            text: `🎉 Watch Party room ${roomCode} created for "${media.title}". Share the link with friends to watch together!`,
            timestamp: new Date().toISOString()
          }
        ]
      };

      // Add host as first participant
      room.participants.set(socket.id, {
        socketId: socket.id,
        userId: userData.userId,
        name: userData.name,
        isHost: true,
        isBuffering: false,
        joinedAt: new Date().toISOString()
      });

      rooms.set(roomCode, room);
      currentRoomCode = roomCode;
      currentUser = userData;

      socket.join(roomCode);

      const serializedRoom = serializeRoom(room);
      socket.emit("party:created", serializedRoom);
      io.emit("party:public_list_update", getActiveRoomsSummary());
    });

    // 2. Join an existing Watch Party Room
    socket.on("party:join", ({ roomCode, user }) => {
      const code = (roomCode || "").toUpperCase().trim();
      const room = rooms.get(code);

      if (!room) {
        socket.emit("party:error", { message: `Watch Party room "${code}" does not exist or has expired.` });
        return;
      }

      const userData = user || currentUser || {
        userId: `guest_${socket.id.substring(0, 5)}`,
        name: `Friend ${room.participants.size + 1}`,
        email: "friend@streamhub.io"
      };

      currentRoomCode = code;
      currentUser = userData;

      socket.join(code);

      const isHost = room.hostId === userData.userId;
      room.participants.set(socket.id, {
        socketId: socket.id,
        userId: userData.userId,
        name: userData.name,
        isHost,
        isBuffering: false,
        joinedAt: new Date().toISOString()
      });

      // System notification message
      room.messages.push({
        id: `msg_${Date.now()}`,
        system: true,
        text: `🍿 ${userData.name} joined the watch party`,
        timestamp: new Date().toISOString()
      });

      const serialized = serializeRoom(room);
      socket.emit("party:joined", serialized);

      // Notify others in room
      socket.to(code).emit("party:participant_joined", {
        participant: room.participants.get(socket.id),
        participantsCount: room.participants.size,
        messages: room.messages.slice(-50)
      });
    });

    // 3. Playback Synchronization Actions (play, pause, seek, rate)
    socket.on("party:action", ({ action, currentTime, playbackRate = 1 }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant) return;

      // Check host-only lock
      if (room.hostOnlyControl && !participant.isHost) {
        socket.emit("party:notification", {
          type: "warning",
          message: "Controls are currently locked to Host only."
        });
        return;
      }

      // Update room playback state
      room.currentTime = typeof currentTime === "number" ? Math.max(0, currentTime) : room.currentTime;
      room.isPlaying = action === "play";
      room.lastUpdate = Date.now();

      // Broadcast to ALL sockets in the room (including sender to verify server sync)
      io.to(currentRoomCode).emit("party:sync_action", {
        action,
        currentTime: room.currentTime,
        playbackRate,
        initiatedBy: participant.name,
        timestamp: Date.now()
      });
    });

    // 4. Manual Sync Request (user asks to jump to current room timestamp)
    socket.on("party:request_sync", () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      socket.emit("party:sync_action", {
        action: room.isPlaying ? "play" : "pause",
        currentTime: room.currentTime,
        playbackRate: 1,
        initiatedBy: "System Sync",
        timestamp: Date.now()
      });
    });

    // 5. Host toggles control lock (allow anyone vs host only)
    socket.on("party:toggle_control", ({ hostOnlyControl }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant || !participant.isHost) return;

      room.hostOnlyControl = Boolean(hostOnlyControl);
      io.to(currentRoomCode).emit("party:control_updated", {
        hostOnlyControl: room.hostOnlyControl,
        updatedBy: participant.name
      });
    });

    // 6. Real-time Live Chat
    socket.on("party:chat", ({ text }) => {
      if (!currentRoomCode || !text || !text.trim()) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      const senderName = participant ? participant.name : (currentUser?.name || "Friend");

      const messageObj = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        system: false,
        senderId: participant?.userId || socket.id,
        senderName,
        text: text.trim().substring(0, 500),
        timestamp: new Date().toISOString()
      };

      room.messages.push(messageObj);
      if (room.messages.length > 200) room.messages.shift(); // keep last 200 messages

      io.to(currentRoomCode).emit("party:new_message", messageObj);
    });

    // 7. Instant Floating Emoji Reactions (🍿 🔥 😱 😂 ❤️ 👏)
    socket.on("party:reaction", ({ emoji }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      io.to(currentRoomCode).emit("party:emoji_reaction", {
        id: `rx_${Date.now()}_${Math.random()}`,
        emoji: emoji || "🍿",
        senderName: participant?.name || "Viewer"
      });
    });

    // 8. Buffering status indicator
    socket.on("party:buffering", ({ isBuffering }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (participant) {
        participant.isBuffering = Boolean(isBuffering);
        socket.to(currentRoomCode).emit("party:user_buffering", {
          userId: participant.userId,
          name: participant.name,
          isBuffering: participant.isBuffering
        });
      }
    });

    // 9. Disconnect & cleanup
    socket.on("disconnect", () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const leavingUser = room.participants.get(socket.id);
      room.participants.delete(socket.id);

      if (room.participants.size === 0) {
        // Room empty: delete after grace period
        rooms.delete(currentRoomCode);
        io.emit("party:public_list_update", getActiveRoomsSummary());
      } else {
        // If host disconnected, promote first participant to host
        if (leavingUser && leavingUser.isHost) {
          const nextHost = room.participants.values().next().value;
          if (nextHost) {
            nextHost.isHost = true;
            room.hostId = nextHost.userId;
            room.hostName = nextHost.name;
          }
        }

        io.to(currentRoomCode).emit("party:participant_left", {
          leavingUser,
          participants: Array.from(room.participants.values()),
          participantsCount: room.participants.size
        });
      }
    });
  });

  function serializeRoom(room) {
    return {
      code: room.code,
      mediaId: room.mediaId,
      mediaTitle: room.mediaTitle,
      mediaBackdrop: room.mediaBackdrop,
      duration: room.duration,
      hostId: room.hostId,
      hostName: room.hostName,
      hostOnlyControl: room.hostOnlyControl,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      participants: Array.from(room.participants.values()),
      messages: room.messages.slice(-50)
    };
  }

  function getActiveRoomsSummary() {
    return Array.from(rooms.values()).map((r) => ({
      code: r.code,
      mediaId: r.mediaId,
      mediaTitle: r.mediaTitle,
      mediaBackdrop: r.mediaBackdrop,
      hostName: r.hostName,
      viewersCount: r.participants.size,
      isPlaying: r.isPlaying
    }));
  }

  return {
    rooms,
    getActiveRoomsSummary
  };
}
