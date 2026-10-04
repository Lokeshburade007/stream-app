"use client";

import { Play, Users, Plus, Check } from "lucide-react";

export default function MovieRow({
  title,
  subtitle,
  items = [],
  onPlay,
  onStartWatchParty,
  onOpenInfo,
  isContinueWatching = false
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="row-container">
      <div className="row-header">
        <h2 className="row-title">{title}</h2>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </div>

      <div className="movie-cards-track">
        {items.map((item) => {
          const movie = isContinueWatching ? item.media : item;
          if (!movie) return null;

          return (
            <div
              key={movie.id}
              id={`card-${movie.id}`}
              className="movie-card"
              style={{
                backgroundImage: `url(${movie.backdrop || movie.poster})`
              }}
              onClick={() => onPlay(movie)}
            >
              <div className="movie-card-overlay">
                <div className="card-title">{movie.title}</div>
                <div className="card-meta-row">
                  <span className="card-match">{movie.matchScore || 95}% Match</span>
                  <span className="card-badge">{movie.maturityRating || "TV-MA"}</span>
                  <span style={{ color: "#aaa" }}>{movie.durationFormatted || "1h 45m"}</span>
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlay(movie);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "#fff",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer"
                    }}
                    title="Play"
                  >
                    <Play size={14} fill="#000" color="#000" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartWatchParty(movie);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "rgba(229, 9, 20, 0.9)",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer"
                    }}
                    title="Start Watch Party"
                  >
                    <Users size={14} color="#fff" />
                  </button>
                </div>
              </div>

              {/* Continue Watching Red Progress Bar */}
              {isContinueWatching && item.percentage > 0 && (
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
