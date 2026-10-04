"use client";

import { X, Play, Users, Sparkles, ExternalLink } from "lucide-react";

export default function InfoModal({ movie, isOpen, onClose, onPlay, onStartWatchParty }) {
  if (!isOpen || !movie) return null;
  const canPlay = movie.playable !== false;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "680px",
          padding: 0,
          overflow: "hidden",
          background: "#181818"
        }}
      >
        {/* Header Backdrop */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "260px",
            backgroundImage: `url(${movie.backdrop || movie.poster})`,
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(0deg, #181818 0%, rgba(24,24,24,0.4) 60%, rgba(0,0,0,0.7) 100%)"
            }}
          />

          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 10
            }}
          >
            <X size={18} />
          </button>

          <div
            style={{
              position: "absolute",
              bottom: 20,
              left: 24,
              right: 24,
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}
          >
            <h2 style={{ fontSize: "28px", fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>
              {movie.title}
            </h2>
            <div style={{ display: "flex", gap: 12 }}>
              {canPlay ? (
                <>
                  <button
                    id="modal-info-play"
                    className="btn-primary"
                    onClick={() => {
                      onClose();
                      onPlay(movie);
                    }}
                    style={{ padding: "8px 20px", fontSize: "14px" }}
                  >
                    <Play size={16} fill="#000" /> Play
                  </button>

                  <button
                    id="modal-info-party"
                    className="btn-party"
                    onClick={() => {
                      onClose();
                      onStartWatchParty(movie);
                    }}
                    style={{ padding: "8px 20px", fontSize: "14px" }}
                  >
                    <Users size={16} /> Watch Party
                  </button>
                </>
              ) : movie.externalUrl ? (
                <a
                  className="btn-primary"
                  href={movie.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ padding: "8px 20px", fontSize: "14px", textDecoration: "none", width: "fit-content" }}
                >
                  <ExternalLink size={16} /> Official show page
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "14px" }}>
            <span style={{ color: "#46d369", fontWeight: 700 }}>{movie.matchScore || 98}% Match</span>
              <span style={{ color: "#aaa" }}>{movie.year || "—"}</span>
            <span className="card-badge">{movie.maturityRating || "TV-MA"}</span>
            <span style={{ color: "#aaa" }}>{movie.durationFormatted || "1h 54m"}</span>
            <span className="card-badge" style={{ borderColor: "#E50914", color: "#E50914" }}>
              {movie.resolution || "4K Ultra HD"}
            </span>
          </div>

          <p style={{ color: "#ddd", fontSize: "15px", lineHeight: 1.6 }}>{movie.synopsis}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: "13px", color: "#aaa", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
            <div>
              <span style={{ color: "#666" }}>Cast: </span>
              <span style={{ color: "#eee" }}>{movie.cast?.length ? movie.cast.join(", ") : movie.provider || "N/A"}</span>
            </div>
            <div>
              <span style={{ color: "#666" }}>Director: </span>
              <span style={{ color: "#eee" }}>{movie.director || "Marcus Lin"}</span>
            </div>
            <div>
              <span style={{ color: "#666" }}>Genres: </span>
              <span style={{ color: "#eee" }}>{movie.genres ? movie.genres.join(", ") : "Sci-Fi"}</span>
            </div>
            <div>
              <span style={{ color: "#666" }}>Audio: </span>
              <span style={{ color: "#eee" }}>{movie.audio || "Dolby Atmos 5.1"}</span>
            </div>
          </div>

          {/* Availability information */}
          <div style={{ background: canPlay ? "rgba(229, 9, 20, 0.08)" : "rgba(124, 58, 237, 0.12)", border: `1px solid ${canPlay ? "rgba(229,9,20,0.3)" : "rgba(167,139,250,0.35)"}`, borderRadius: "8px", padding: "14px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ background: "#E50914", borderRadius: "50%", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={16} color="#fff" />
            </div>
            <div>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
                {canPlay ? "Free multi-device streaming" : "Live series information"}
              </h4>
              <p style={{ fontSize: "12px", color: "#bbb", lineHeight: 1.5 }}>
                {canPlay
                  ? "This title is resolved from Internet Archive when you press Play. Start a Watch Party to synchronize it with friends."
                  : movie.availabilityNote || "Streaming availability is controlled by the title’s rights holder."}
              </p>
              {!canPlay && movie.attributionUrl && (
                <a
                  href={movie.attributionUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd", display: "inline-block", fontSize: "12px", marginTop: "8px" }}
                >
                  Availability data source
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
