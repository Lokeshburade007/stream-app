"use client";

import { Play, Users, Info } from "lucide-react";
import { mediaUrl } from "../lib/api";

export default function MovieRow({
  id,
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
    <div className="row-container" id={id}>
      <div className="row-header">
        <h2 className="row-title">{title}</h2>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </div>

      <div className="movie-cards-track">
        {items.map((item) => {
          const movie = isContinueWatching ? item.media : item;
          if (!movie) return null;
          const canPlay = movie.playable !== false;

          return (
            <div
              key={movie.id}
              id={`card-${movie.id}`}
              className="movie-card"
              style={{
                backgroundImage: `url(${mediaUrl(movie.backdrop || movie.poster)})`
              }}
              onClick={() => (canPlay ? onPlay(movie) : onOpenInfo(movie))}
            >
              <div className="movie-card-overlay">
                <div className="source-badge-row">
                  <span className={`source-badge ${canPlay ? "streamable" : "series"}`}>
                    {canPlay ? "FREE STREAM" : movie.availabilityLabel || "SERIES INFO"}
                  </span>
                  {movie.provider && <span className="source-provider">{movie.provider}</span>}
                </div>
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
                      if (canPlay) onPlay(movie);
                      else onOpenInfo(movie);
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
                    title={canPlay ? "Play" : "View series details"}
                  >
                    {canPlay ? <Play size={14} fill="#000" color="#000" /> : <Info size={14} color="#000" />}
                  </button>

                  {canPlay && (
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
                  )}
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
