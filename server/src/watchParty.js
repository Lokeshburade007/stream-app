// Real-time Watch Party Engine for synchronized multi-device streaming

export function setupWatchParty(io, tokenService, getMediaById) {
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

  function normalizeUser(user, socket, fallbackName) {
    return {
      userId: user?.userId || user?.id || `guest_${socket.id.substring(0, 5)}`,
      name: user?.name || fallbackName,
      email: user?.email || "guest@streamhub.io"
    };
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
    socket.on("party:create", async ({ mediaId, user, hostOnlyControl = false }) => {
      let media = null;
      try {
        media = await getMediaById?.(mediaId);
      } catch (error) {
        socket.emit("party:error", { message: "The live catalogue could not be reached. Please try again." });
        return;
      }

      if (!media || !media.playable) {
        socket.emit("party:error", { message: "Choose a currently playable Internet Archive movie for a watch party." });
        return;
      }
      const roomCode = generateRoomCode();
      const userData = normalizeUser(user || currentUser, socket, "Host User");

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
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
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

      rooms.set(roomCode, room);

      const serializedRoom = serializeRoom(room);
      socket.emit("party:created", serializedRoom);
      io.emit("party:public_list_update", getActiveRoomsSummary());
    });

    // 2. Join an existing Watch Party Room
    socket.on("party:join", ({ roomCode, user }) => {
      const code = (roomCode || "").toUpperCase().trim();
      const room = rooms.get(code);

      if (!room || room.expiresAt <= Date.now()) {
        rooms.delete(code);
        socket.emit("party:error", { message: `Watch Party room "${code}" does not exist or has expired.` });
        return;
      }

      const userData = normalizeUser(user || currentUser, socket, `Friend ${room.participants.size + 1}`);

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

    // 9. Voice chat signaling. Audio travels browser-to-browser over WebRTC;
    // the server only relays offer/answer/ICE messages to room members.
    socket.on("party:voice:join", () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      const participant = room?.participants.get(socket.id);
      if (!room || !participant) return;

      participant.voiceJoined = true;
      participant.voiceMuted = false;
      socket.emit("party:voice:participants", Array.from(room.participants.values())
        .filter((item) => item.socketId !== socket.id && item.voiceJoined)
        .map((item) => item.socketId));
      socket.to(currentRoomCode).emit("party:voice:participant_joined", {
        socketId: socket.id,
        name: participant.name
      });
    });

    socket.on("party:voice:mute", ({ muted }) => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      const participant = room?.participants.get(socket.id);
      if (!participant?.voiceJoined) return;
      participant.voiceMuted = Boolean(muted);
      io.to(currentRoomCode).emit("party:voice:state", {
        socketId: socket.id,
        muted: participant.voiceMuted
      });
    });

    socket.on("party:voice:leave", () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      const participant = room?.participants.get(socket.id);
      if (!participant?.voiceJoined) return;
      participant.voiceJoined = false;
      participant.voiceMuted = false;
      socket.to(currentRoomCode).emit("party:voice:participant_left", { socketId: socket.id });
    });

    socket.on("party:voice:signal", ({ to, signal }) => {
      if (!currentRoomCode || !to || !signal) return;
      const room = rooms.get(currentRoomCode);
      if (!room?.participants.has(socket.id) || !room.participants.has(to)) return;
      io.to(to).emit("party:voice:signal", { from: socket.id, signal });
    });

    // 10. Disconnect & cleanup
    socket.on("disconnect", () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      const leavingUser = room.participants.get(socket.id);
      room.participants.delete(socket.id);
      if (leavingUser?.voiceJoined) {
        socket.to(currentRoomCode).emit("party:voice:participant_left", { socketId: socket.id });
      }

      if (room.participants.size === 0) {
        // Keep the invite valid while a player reconnects or changes devices.
        // Rooms remain intentionally short-lived and are pruned after 12 hours.
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
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.expiresAt <= now) rooms.delete(code);
    }

    return Array.from(rooms.values()).filter((r) => r.participants.size > 0).map((r) => ({
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
    getActiveRoomsSummary,
    getRoom(roomCode) {
      const code = (roomCode || "").toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.expiresAt <= Date.now()) {
        rooms.delete(code);
        return null;
      }
      return serializeRoom(room);
    }
  };
}
