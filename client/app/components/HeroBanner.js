"use client";

import { Play, Users, Info, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { mediaUrl } from "../lib/api";

export default function HeroBanner({ movie, onPlay, onStartWatchParty, onOpenInfo }) {
  if (!movie) return null;

  return (
    <section
      id="featured"
      className="hero-container"
      style={{
        backgroundImage: `url(${mediaUrl(movie.backdrop)})`,
      }}
    >
      <div className="hero-vignette" />

      <div className="hero-content">
        <div className="hero-badge-row">
          <span className="top-badge">TOP 10 TODAY</span>
          <span className="hero-quality">{movie.resolution || "4K Ultra HD"}</span>
          <span className="hero-quality">{movie.audio || "Dolby Atmos 5.1"}</span>
          <span className="hero-match">{movie.matchScore || 99}% Match</span>
        </div>

        <h1 className="hero-title">{movie.title}</h1>

        {movie.tagline && <p className="hero-tagline">{movie.tagline}</p>}

        <p className="hero-synopsis">{movie.synopsis}</p>

        <div className="hero-actions">
          <button
            id="hero-btn-play"
            className="btn-primary"
            onClick={() => onPlay(movie)}
          >
            <Play size={20} fill="#000" /> Play
          </button>

          <button
            id="hero-btn-party"
            className="btn-party"
            onClick={() => onStartWatchParty(movie)}
          >
            <Users size={20} /> Watch Party
          </button>

          <button
            id="hero-btn-info"
            className="btn-secondary"
            onClick={() => onOpenInfo(movie)}
          >
            <Info size={20} /> More Info
          </button>
        </div>
      </div>
    </section>
  );
}
