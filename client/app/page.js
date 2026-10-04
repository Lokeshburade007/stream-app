"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "./components/Navbar";
import HeroBanner from "./components/HeroBanner";
import MovieRow from "./components/MovieRow";
import CinemaPlayer from "./components/CinemaPlayer";
import WatchPartyModal from "./components/WatchPartyModal";
import AuthModal from "./components/AuthModal";
import InfoModal from "./components/InfoModal";
import { Users, Film, Radio, Shield, Server, RefreshCw } from "lucide-react";
import { io } from "socket.io-client";
import { API_URL, apiUrl } from "./lib/api";

export default function Home() {
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [continueWatching, setContinueWatching] = useState([]);
  const [activeRooms, setActiveRooms] = useState([]);
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState(null);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [tmdbConfigured, setTmdbConfigured] = useState(false);
  const hasJoinedRoomLink = useRef(false);

  // Modals & Player State
  const [activePlayingMovie, setActivePlayingMovie] = useState(null);
  const [watchPartyRoom, setWatchPartyRoom] = useState(null);
  const [partyParticipant, setPartyParticipant] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [infoModalMovie, setInfoModalMovie] = useState(null);
  const [tvMode, setTvMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Load User session from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem("stream_user");
    const savedToken = localStorage.getItem("stream_auth_token");
    let restoreTimer;
    if (savedUser && savedToken) {
      try {
        const restoredUser = JSON.parse(savedUser);
        restoreTimer = window.setTimeout(() => {
          setUser(restoredUser);
          setAuthToken(savedToken);
        }, 0);
      } catch (e) {
        localStorage.removeItem("stream_user");
      }
    }
    return () => window.clearTimeout(restoreTimer);
  }, []);

  // 2. Fetch Media Catalog & Active Rooms from Server
  const fetchMedia = async ({ forceRefresh = false } = {}) => {
    if (forceRefresh) setIsRefreshingCatalog(true);
    try {
      const res = await fetch(apiUrl(`/api/media${forceRefresh ? "?refresh=1" : ""}`));
      if (!res.ok) throw new Error(`Catalogue request failed (${res.status})`);
      const data = await res.json();
      if (data?.all) {
        setCatalog(data.all);
        setFeatured(data.featured);
        setCategories(data.categories);
        setCatalogUpdatedAt(data.updatedAt || new Date().toISOString());
        setTmdbConfigured(Boolean(data.tmdbConfigured));
      }
    } catch (err) {
      console.warn("Live media catalogue unavailable:", err.message);
    } finally {
      if (forceRefresh) setIsRefreshingCatalog(false);
    }
  };

  const fetchContinueWatching = async (userId) => {
    if (!userId) return;
    try {
      const res = await fetch(apiUrl(`/api/user/continue-watching?userId=${encodeURIComponent(userId)}`));
      const data = await res.json();
      if (data?.continueWatching) {
        setContinueWatching(data.continueWatching);
      }
    } catch (err) {}
  };

  const fetchActiveRooms = async () => {
    try {
      const res = await fetch(apiUrl("/api/rooms/active"));
      const data = await res.json();
      if (data?.rooms) {
        setActiveRooms(data.rooms);
      }
    } catch (err) {}
  };

  useEffect(() => {
    const initialRequest = window.setTimeout(() => {
      fetchMedia();
      fetchActiveRooms();
    }, 0);
    const roomsInterval = setInterval(fetchActiveRooms, 10000);
    const catalogueInterval = setInterval(fetchMedia, 10 * 60 * 1000);
    return () => {
      window.clearTimeout(initialRequest);
      clearInterval(roomsInterval);
      clearInterval(catalogueInterval);
    };
  }, []);

  useEffect(() => {
    if (user) {
      const progressRequest = window.setTimeout(() => {
        fetchContinueWatching(user.id || user.userId);
      }, 0);
      return () => window.clearTimeout(progressRequest);
    }
  }, [user]);

  // 4. Playback Actions
  const handlePlayMovie = (movie) => {
    if (!movie?.playable) {
      setInfoModalMovie(movie);
      return;
    }
    setWatchPartyRoom(null); // Solo playback
    setPartyParticipant(null);
    setActivePlayingMovie(movie);
  };

  const getPartyParticipant = useCallback(() => {
    if (user) return { ...user, userId: user.userId || user.id };

    const storageKey = "stream_party_guest";
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}

    const guest = {
      userId: `guest_${crypto.randomUUID()}`,
      name: `Guest ${Math.floor(Math.random() * 900 + 100)}`,
      email: "guest@streamhub.io"
    };
    localStorage.setItem(storageKey, JSON.stringify(guest));
    return guest;
  }, [user]);

  const handleStartWatchParty = (movie, hostOnlyControl = false) => {
    if (!movie?.playable) {
      setInfoModalMovie(movie);
      return;
    }

    const socket = io(API_URL);
    const currentUser = getPartyParticipant();

    socket.emit("party:create", {
      mediaId: movie.id,
      user: currentUser,
      hostOnlyControl
    });

    socket.on("party:created", (room) => {
      setWatchPartyRoom(room);
      setPartyParticipant(currentUser);
      setActivePlayingMovie(movie);
      setIsPartyModalOpen(false);
      socket.disconnect();
    });

    socket.on("party:error", ({ message }) => {
      alert(message || "Unable to start a watch party.");
      socket.disconnect();
    });
  };

  const handleJoinRoom = useCallback((roomCode) => {
    const openRoom = async () => {
      try {
        const roomResponse = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(roomCode)}`));
        if (!roomResponse.ok) throw new Error("This watch party does not exist or has expired.");
        const room = await roomResponse.json();
      let targetMovie = catalog.find((m) => m.id === room.mediaId);
      if (!targetMovie) {
          const response = await fetch(apiUrl(`/api/media/${encodeURIComponent(room.mediaId)}`));
          if (response.ok) targetMovie = await response.json();
      }
      if (!targetMovie) {
        alert("This title is no longer available to stream.");
        return;
      }
      setWatchPartyRoom(room);
        setPartyParticipant(getPartyParticipant());
      setActivePlayingMovie(targetMovie);
      setIsPartyModalOpen(false);
      } catch (error) {
        alert(error.message || "Unable to join this watch party.");
      }
    };
    openRoom();
  }, [catalog, getPartyParticipant]);

  // 3. Handle Direct Room Link (e.g. ?room=XYZ) once the catalogue is ready.
  useEffect(() => {
    const roomParam = new URLSearchParams(window.location.search).get("room");
    if (!roomParam || !catalog.length || hasJoinedRoomLink.current) return;
    hasJoinedRoomLink.current = true;
    const joinTimer = window.setTimeout(() => handleJoinRoom(roomParam), 0);
    return () => window.clearTimeout(joinTimer);
  }, [catalog, handleJoinRoom]);

  const handleLogout = () => {
    localStorage.removeItem("stream_user");
    localStorage.removeItem("stream_auth_token");
    setUser(null);
    setAuthToken(null);
    setContinueWatching([]);
  };

  const [onlineSearchResults, setOnlineSearchResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  // Dynamic Free Movies Search via Archive.org API
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      const clearTimer = window.setTimeout(() => setOnlineSearchResults([]), 0);
      return () => window.clearTimeout(clearTimer);
    }

    const timer = setTimeout(async () => {
      setIsSearchingOnline(true);
      try {
        const res = await fetch(apiUrl(`/api/movies/search?q=${encodeURIComponent(searchQuery)}`));
        if (!res.ok) throw new Error("Search is temporarily unavailable");
        const data = await res.json();
        if (data?.results) setOnlineSearchResults(data.results);
      } catch (err) {
        console.error("Free movie search error:", err);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter local catalog based on search
  const filteredCatalog = searchQuery.trim()
    ? catalog.filter(
        (m) =>
          m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.genres.some((g) => g.toLowerCase().includes(searchQuery.toLowerCase())) ||
          m.synopsis.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const searchResults = Array.from(
    new Map([...(filteredCatalog || []), ...onlineSearchResults].map((movie) => [movie.id, movie])).values()
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-main)", position: "relative" }}>
      {/* Navigation */}
      <Navbar
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenWatchPartyModal={() => setIsPartyModalOpen(true)}
        tvMode={tvMode}
        onToggleTvMode={() => setTvMode(!tvMode)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Hero Banner (Only when not actively searching) */}
      {!searchQuery.trim() && featured && (
        <HeroBanner
          movie={featured}
          onPlay={handlePlayMovie}
          onStartWatchParty={handleStartWatchParty}
          onOpenInfo={(m) => setInfoModalMovie(m)}
        />
      )}

      {/* Main Content Rows Section */}
      <section className="catalog-section" style={{ marginTop: searchQuery.trim() ? "90px" : "-60px" }}>
        {/* Search Results Display */}
        {searchQuery.trim() && (
          <div className="row-container">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 className="row-title">{`Search Results for “${searchQuery}”`}</h2>
              {isSearchingOnline && (
                <span style={{ fontSize: 12, color: "#ffb703" }}>Searching Free Movies API...</span>
              )}
            </div>

            {/* Combined Results Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {searchResults.map((movie) => {
                const isOnline = movie.playable;
                return (
                  <div
                    key={movie.id}
                    className="movie-card"
                    style={{
                      flex: "none",
                      height: 160,
                      backgroundImage: `url(${movie.backdrop || movie.poster})`,
                      border: isOnline ? "1px solid rgba(0, 128, 255, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)"
                    }}
                    onClick={() => handlePlayMovie(movie)}
                  >
                    <div className="movie-card-overlay">
                      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                        {isOnline ? (
                          <span style={{ background: "#0080ff", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 3 }}>
                            FREE STREAM
                          </span>
                        ) : (
                          <span style={{ background: "#7c3aed", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 3 }}>
                            {movie.availabilityLabel || "SERIES INFO"}
                          </span>
                        )}
                        <span className="card-badge">{movie.year}</span>
                      </div>
                      <div className="card-title">{movie.title}</div>
                      <div className="card-meta-row">
                        <span className="card-match">{movie.matchScore}% Match</span>
                        <span className="card-badge">{movie.resolution}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {(!filteredCatalog || filteredCatalog.length === 0) && onlineSearchResults.length === 0 && !isSearchingOnline && (
              <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
                {"No movies found. Try searching for “horror”, “space”, “action”, or “classic”."}
              </div>
            )}
          </div>
        )}

        {/* Live Active Watch Party Rooms Row */}
        {!searchQuery.trim() && activeRooms.length > 0 && (
          <div className="row-container" style={{ background: "rgba(229, 9, 20, 0.05)", padding: 18, borderRadius: 12, border: "1px solid rgba(229, 9, 20, 0.2)" }}>
            <div className="row-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Radio size={18} color="#E50914" />
                <h2 className="row-title">Friends Streaming Now (Live Watch Parties)</h2>
              </div>
              <span className="row-subtitle">Click to jump straight into their synchronized player</span>
            </div>

            <div className="movie-cards-track">
              {activeRooms.map((r) => (
                <div
                  key={r.code}
                  className="movie-card"
                  style={{
                    backgroundImage: `url(${r.mediaBackdrop || "/backdrops/cyber_amsterdam.jpg"})`,
                    border: "1px solid #E50914"
                  }}
                  onClick={() => handleJoinRoom(r.code)}
                >
                  <div className="movie-card-overlay">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: "#E50914", color: "#fff", fontSize: 11, fontWeight: 800, padding: "2px 6px", borderRadius: 4 }}>
                        ROOM {r.code}
                      </span>
                      <span style={{ fontSize: 11, color: "#46d369", fontWeight: 700 }}>
                        {r.viewersCount} Watching
                      </span>
                    </div>
                    <div className="card-title" style={{ marginTop: 6 }}>{r.mediaTitle}</div>
                    <div style={{ fontSize: 12, color: "#aaa" }}>Host: {r.hostName}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Continue Watching Row (Cross-Device Resume) */}
        {!searchQuery.trim() && continueWatching.length > 0 && (
          <MovieRow
            title="Continue Watching"
            subtitle="Resumes automatically across your TV, Laptop, and Phone"
            items={continueWatching}
            onPlay={handlePlayMovie}
            onStartWatchParty={handleStartWatchParty}
            onOpenInfo={(m) => setInfoModalMovie(m)}
            isContinueWatching={true}
          />
        )}

        {/* Live source status */}
        {!searchQuery.trim() && (
          <div className="live-catalog-status">
            <div>
              <span className="live-dot" />
              <strong>India-first live catalogue</strong> · Archive movies and TVMaze schedules
            </div>
            <button
              type="button"
              className="live-refresh-button"
              onClick={() => fetchMedia({ forceRefresh: true })}
              disabled={isRefreshingCatalog}
            >
              <RefreshCw size={14} className={isRefreshingCatalog ? "spin" : ""} />
              {isRefreshingCatalog ? "Refreshing…" : "Refresh"}
            </button>
            {catalogUpdatedAt && (
              <span className="live-catalog-time">
                Updated {new Date(catalogUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {!tmdbConfigured && (
              <span className="live-catalog-time">Add <code>TMDB_API_KEY</code> on the server to enable Netflix-in-India guides.</span>
            )}
          </div>
        )}

        {/* Category Rows from live catalog */}
        {!searchQuery.trim() &&
          categories.map((cat) => (
            <MovieRow
              key={cat.id}
              title={cat.title}
              items={cat.items}
              onPlay={handlePlayMovie}
              onStartWatchParty={handleStartWatchParty}
              onOpenInfo={(m) => setInfoModalMovie(m)}
            />
          ))}
      </section>

      {/* Multi-Device Architecture Banner */}
      <section style={{ margin: "40px 4% 80px", padding: "28px", borderRadius: "14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "24px" }}>
        <div style={{ display: "flex", gap: "16px" }}>
          <div style={{ background: "rgba(229,9,20,0.15)", borderRadius: "10px", width: "46px", height: "46px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Server size={22} color="#E50914" />
          </div>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>Internet Archive Playback</h3>
            <p style={{ fontSize: "13px", color: "#888", lineHeight: 1.5 }}>
              The player resolves the actual public Archive video file at playback time instead of relying on fixed demo URLs.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "16px" }}>
          <div style={{ background: "rgba(0,128,255,0.15)", borderRadius: "10px", width: "46px", height: "46px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Shield size={22} color="#0080ff" />
          </div>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>SecurePool Auth</h3>
            <p style={{ fontSize: "13px", color: "#888", lineHeight: 1.5 }}>
              RS256 JWT tokens, multi-device session management, and encrypted token rotation built with your npm package.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "16px" }}>
          <div style={{ background: "rgba(70,211,105,0.15)", borderRadius: "10px", width: "46px", height: "46px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Users size={22} color="#46d369" />
          </div>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>Multi-Device Watch Party</h3>
            <p style={{ fontSize: "13px", color: "#888", lineHeight: 1.5 }}>
              Real-time playback lockstep (±0.2s drift sync), live chat, and floating emoji reactions for friends.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "40px 4%", color: "#666", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Film size={20} color="#E50914" />
          <span style={{ fontWeight: 700, color: "#aaa" }}>STREAMHUB MEDIA PLATFORM</span>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <span>Next.js 16 + Node.js</span>
          <span>SecurePool @1.1.3</span>
          <span>Socket.io Engine</span>
        </div>
      </footer>

      {/* Cinema Fullscreen Player */}
      {activePlayingMovie && (
        <CinemaPlayer
          movie={activePlayingMovie}
          user={user}
          partyParticipant={partyParticipant}
          watchPartyRoom={watchPartyRoom}
          onClose={() => {
            setActivePlayingMovie(null);
            setWatchPartyRoom(null);
            setPartyParticipant(null);
            if (user) fetchContinueWatching(user.id || user.userId);
          }}
        />
      )}

      {/* Watch Party Modal */}
      <WatchPartyModal
        isOpen={isPartyModalOpen}
        onClose={() => setIsPartyModalOpen(false)}
          catalog={catalog.filter((movie) => movie.playable)}
        onJoinRoom={handleJoinRoom}
        onCreateRoom={(movieId, hostOnly) => {
          const m = catalog.find((item) => item.id === movieId) || catalog[0];
          handleStartWatchParty(m, hostOnly);
        }}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={(loggedUser, token) => {
          setUser(loggedUser);
          setAuthToken(token);
          fetchContinueWatching(loggedUser.id || loggedUser.userId);
        }}
      />

      {/* Info Modal */}
      <InfoModal
        movie={infoModalMovie}
        isOpen={Boolean(infoModalMovie)}
        onClose={() => setInfoModalMovie(null)}
        onPlay={handlePlayMovie}
        onStartWatchParty={handleStartWatchParty}
      />
    </main>
  );
}
