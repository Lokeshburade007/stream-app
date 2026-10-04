"use client";

import { useState, useEffect } from "react";
import { X, Users, Play, Plus, Radio, Shield, Key } from "lucide-react";

export default function WatchPartyModal({
  isOpen,
  onClose,
  catalog = [],
  onJoinRoom,
  onCreateRoom
}) {
  const [activeTab, setActiveTab] = useState("host"); // "host" | "join"
  const [selectedMovieId, setSelectedMovieId] = useState(catalog[0]?.id || "");
  const [joinCode, setJoinCode] = useState("");
  const [hostOnlyControl, setHostOnlyControl] = useState(false);
  const [activeRooms, setActiveRooms] = useState([]);

  useEffect(() => {
    if (isOpen) {
      // Fetch active rooms from server
      fetch("http://localhost:5001/api/rooms/active")
        .then((res) => res.json())
        .then((data) => {
          if (data?.rooms) setActiveRooms(data.rooms);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = (e) => {
    e.preventDefault();
    onCreateRoom(selectedMovieId || catalog[0]?.id, hostOnlyControl);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (joinCode.trim()) {
      onJoinRoom(joinCode.trim().toUpperCase());
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(229,9,20,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={20} color="#E50914" />
            </div>
            <div>
              <h2 className="modal-title">Watch Party</h2>
              <p style={{ fontSize: 13, color: "#888" }}>Stream together in real-time with friends</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab switch */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 4 }}>
          <button
            id="tab-host-party"
            onClick={() => setActiveTab("host")}
            style={{
              flex: 1,
              padding: "8px 12px",
              background: activeTab === "host" ? "#E50914" : "transparent",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            Host New Room
          </button>
          <button
            id="tab-join-party"
            onClick={() => setActiveTab("join")}
            style={{
              flex: 1,
              padding: "8px 12px",
              background: activeTab === "join" ? "#E50914" : "transparent",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            Join with Code
          </button>
        </div>

        {/* Tab 1: Host Party */}
        {activeTab === "host" ? (
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Select Title to Watch</label>
              <select
                id="select-movie-party"
                value={selectedMovieId}
                onChange={(e) => setSelectedMovieId(e.target.value)}
                className="form-input"
                style={{ background: "#222" }}
              >
                {catalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({m.durationFormatted})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", padding: 12, borderRadius: 8 }}>
              <input
                type="checkbox"
                id="chk-host-only"
                checked={hostOnlyControl}
                onChange={(e) => setHostOnlyControl(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#E50914" }}
              />
              <label htmlFor="chk-host-only" style={{ fontSize: 13, color: "#ddd", cursor: "pointer" }}>
                <strong>Host-only playback controls</strong>
                <div style={{ fontSize: 12, color: "#888" }}>Only you can play, pause, or seek</div>
              </label>
            </div>

            <button
              id="btn-create-party-submit"
              type="submit"
              className="btn-party"
              style={{ justifyContent: "center", width: "100%", padding: "14px" }}
            >
              <Users size={18} /> Launch Watch Party Room
            </button>
          </form>
        ) : (
          /* Tab 2: Join with Code */
          <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Enter 6-Character Room Code</label>
              <input
                id="input-party-code"
                type="text"
                placeholder="e.g. NET892"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="form-input"
                style={{
                  fontSize: 22,
                  letterSpacing: 4,
                  textAlign: "center",
                  fontWeight: 800
                }}
              />
            </div>

            <button
              id="btn-join-party-submit"
              type="submit"
              className="btn-primary"
              style={{ justifyContent: "center", width: "100%", padding: "14px" }}
            >
              <Play size={18} fill="#000" /> Enter Room
            </button>
          </form>
        )}

        {/* Active Public Rooms Section */}
        {activeRooms.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#aaa", marginBottom: 10 }}>
              <Radio size={14} color="#46d369" />
              <span>Live Rooms Playing Now ({activeRooms.length})</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 150, overflowY: "auto" }}>
              {activeRooms.map((room) => (
                <div
                  key={room.code}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(255,255,255,0.05)",
                    padding: "8px 12px",
                    borderRadius: 6
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{room.mediaTitle}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      Hosted by {room.hostName} • {room.viewersCount} watching
                    </div>
                  </div>
                  <button
                    onClick={() => onJoinRoom(room.code)}
                    style={{
                      background: "#E50914",
                      color: "#fff",
                      border: "none",
                      padding: "5px 12px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    Join {room.code}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
