"use client";

import { useState, useEffect } from "react";
import { X, Play, Users, Sparkles, ExternalLink, Film, Tv, Clock, CheckCircle } from "lucide-react";
import { apiUrl, mediaUrl } from "../lib/api";

export default function InfoModal({ movie, isOpen, onClose, onPlay, onStartWatchParty }) {
  const [episodesData, setEpisodesData] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

  const isSeries = movie?.mediaType === "series" || movie?.hasEpisodes || movie?.id?.startsWith("series_") || movie?.id?.startsWith("tvmaze_");
  const canPlay = movie?.playable !== false;

  useEffect(() => {
    if (!isOpen || !movie || !isSeries) {
      setEpisodesData(null);
      return;
    }

    let isMounted = true;
    setIsLoadingEpisodes(true);

    fetch(apiUrl(`/api/series/${encodeURIComponent(movie.id)}/episodes`))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load episodes");
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setEpisodesData(data);
        if (data.seasons && data.seasons.length > 0) {
          setSelectedSeason(data.seasons[0].seasonNumber);
        }
      })
      .catch((err) => {
        console.warn("Could not load episodes:", err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingEpisodes(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, movie, isSeries]);

  if (!isOpen || !movie) return null;

  const currentSeasonEpisodes = episodesData?.seasons?.find(
    (s) => s.seasonNumber === selectedSeason
  )?.episodes || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "760px",
          maxHeight: "90vh",
          padding: 0,
          overflowY: "auto",
          background: "#181818",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)"
        }}
      >
        {/* Header Backdrop */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "280px",
            backgroundImage: `url(${mediaUrl(movie.backdrop || movie.poster)})`,
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
              gap: 12
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {isSeries && (
                <span
                  style={{
                    background: "#E50914",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}
                >
                  TV Series
                </span>
              )}
              {movie.category && (
                <span style={{ color: "#aaa", fontSize: "12px", fontWeight: 600 }}>
                  {movie.category}
                </span>
              )}
            </div>

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
                  style={{ padding: "8px 20px", fontSize: "14px", textDecoration: "none", width: "fit-content", display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <ExternalLink size={16} /> Official Show Page
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "14px", flexWrap: "wrap" }}>
            <span style={{ color: "#46d369", fontWeight: 700 }}>{movie.matchScore || 98}% Match</span>
            <span style={{ color: "#aaa" }}>{movie.year || "—"}</span>
            <span className="card-badge">{movie.maturityRating || "TV-MA"}</span>
            <span style={{ color: "#aaa" }}>{movie.durationFormatted || "Feature"}</span>
            <span className="card-badge" style={{ borderColor: "#E50914", color: "#E50914" }}>
              {movie.resolution || "HD Master"}
            </span>
          </div>

          <p style={{ color: "#ddd", fontSize: "15px", lineHeight: 1.6 }}>{movie.synopsis}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: "13px", color: "#aaa", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
            <div>
              <span style={{ color: "#666" }}>Cast: </span>
              <span style={{ color: "#eee" }}>{movie.cast?.length ? movie.cast.join(", ") : movie.provider || "N/A"}</span>
            </div>
            <div>
              <span style={{ color: "#666" }}>Network / Director: </span>
              <span style={{ color: "#eee" }}>{movie.director || "Series Production"}</span>
            </div>
            <div>
              <span style={{ color: "#666" }}>Genres: </span>
              <span style={{ color: "#eee" }}>{movie.genres ? movie.genres.join(", ") : "Drama, Series"}</span>
            </div>
            <div>
              <span style={{ color: "#666" }}>Audio: </span>
              <span style={{ color: "#eee" }}>{movie.audio || "Dolby 5.1"}</span>
            </div>
          </div>

          {/* Series Episodes Breakdown Drawer */}
          {isSeries && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tv size={20} color="#E50914" />
                  <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>
                    Episodes & Guide
                  </h3>
                  {episodesData?.totalEpisodes && (
                    <span style={{ color: "#888", fontSize: "13px" }}>
                      ({episodesData.totalEpisodes} Episodes)
                    </span>
                  )}
                </div>

                {/* Season Tabs / Selector */}
                {episodesData?.seasons && episodesData.seasons.length > 1 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {episodesData.seasons.map((s) => (
                      <button
                        key={s.seasonNumber}
                        onClick={() => setSelectedSeason(s.seasonNumber)}
                        style={{
                          background: selectedSeason === s.seasonNumber ? "#E50914" : "rgba(255,255,255,0.1)",
                          color: "#fff",
                          border: "none",
                          padding: "6px 14px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "background 0.2s"
                        }}
                      >
                        Season {s.seasonNumber}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isLoadingEpisodes ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#888", fontSize: "14px" }}>
                  Loading episodes from TV directory...
                </div>
              ) : currentSeasonEpisodes.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {currentSeasonEpisodes.map((ep) => {
                    const isPlayableEpisode = Boolean(ep.videoSource);
                    return (
                      <div
                        key={ep.id}
                        style={{
                          display: "flex",
                          gap: 16,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: "8px",
                          padding: "12px",
                          alignItems: "flex-start",
                          transition: "background 0.2s"
                        }}
                      >
                        {/* Episode Still */}
                        <div
                          style={{
                            position: "relative",
                            width: "140px",
                            height: "80px",
                            flexShrink: 0,
                            borderRadius: "6px",
                            overflow: "hidden",
                            backgroundImage: `url(${ep.image})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            backgroundColor: "#222"
                          }}
                        >
                          {isPlayableEpisode && (
                            <button
                              onClick={() => {
                                onClose();
                                onPlay({
                                  ...movie,
                                  id: ep.id,
                                  title: `${movie.title}: ${ep.title}`,
                                  tagline: `Season ${ep.season} Episode ${ep.number}`,
                                  synopsis: ep.synopsis,
                                  videoSource: ep.videoSource,
                                  durationFormatted: ep.duration,
                                  playable: true
                                });
                              }}
                              style={{
                                position: "absolute",
                                inset: 0,
                                background: "rgba(0,0,0,0.45)",
                                border: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                color: "#fff"
                              }}
                              title="Play Episode"
                            >
                              <Play size={24} fill="#fff" />
                            </button>
                          )}
                        </div>

                        {/* Episode Details */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                              {ep.number ? `${ep.number}. ` : ""}{ep.title}
                            </h4>
                            <span style={{ fontSize: "12px", color: "#aaa" }}>
                              {ep.duration}
                            </span>
                          </div>
                          <p style={{ fontSize: "12px", color: "#999", lineHeight: 1.5, margin: "4px 0 8px" }}>
                            {ep.synopsis}
                          </p>

                          <div style={{ display: "flex", gap: 10 }}>
                            {isPlayableEpisode && (
                              <>
                                <button
                                  className="btn-primary"
                                  onClick={() => {
                                    onClose();
                                    onPlay({
                                      ...movie,
                                      id: ep.id,
                                      title: `${movie.title}: ${ep.title}`,
                                      tagline: `Season ${ep.season} Episode ${ep.number}`,
                                      synopsis: ep.synopsis,
                                      videoSource: ep.videoSource,
                                      durationFormatted: ep.duration,
                                      playable: true
                                    });
                                  }}
                                  style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: 4 }}
                                >
                                  <Play size={12} fill="#000" /> Play S{ep.season}:E{ep.number}
                                </button>
                                <button
                                  className="btn-party"
                                  onClick={() => {
                                    onClose();
                                    onStartWatchParty({
                                      ...movie,
                                      id: ep.id,
                                      title: `${movie.title}: ${ep.title}`,
                                      tagline: `Season ${ep.season} Episode ${ep.number}`,
                                      synopsis: ep.synopsis,
                                      videoSource: ep.videoSource,
                                      durationFormatted: ep.duration,
                                      playable: true
                                    });
                                  }}
                                  style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: 4 }}
                                >
                                  <Users size={12} /> Watch Party
                                </button>
                              </>
                            )}
                            {ep.airdate && (
                              <span style={{ fontSize: "11px", color: "#666", alignSelf: "center" }}>
                                Air Date: {ep.airdate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: "20px", color: "#888", fontSize: "13px" }}>
                  Detailed episode guides are updated when available by the network.
                </div>
              )}
            </div>
          )}

          {/* Availability Information */}
          <div style={{ background: canPlay ? "rgba(229, 9, 20, 0.08)" : "rgba(124, 58, 237, 0.12)", border: `1px solid ${canPlay ? "rgba(229,9,20,0.3)" : "rgba(167,139,250,0.35)"}`, borderRadius: "8px", padding: "14px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ background: "#E50914", borderRadius: "50%", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={16} color="#fff" />
            </div>
            <div>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
                {canPlay ? "Free multi-device streaming" : "Live Series Information"}
              </h4>
              <p style={{ fontSize: "12px", color: "#bbb", lineHeight: 1.5 }}>
                {canPlay
                  ? "This title and its episodes are streamed directly to your browser with full Watch Party synchronization."
                  : movie.availabilityNote || "Series schedule and details provided by TVMaze live API."}
              </p>
              {!canPlay && movie.externalUrl && (
                <a
                  href={movie.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd", display: "inline-block", fontSize: "12px", marginTop: "8px" }}
                >
                  Visit Official Series Site
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
