"use client";

import { useState, useEffect } from "react";
import { Film, Users, Tv, Search, User, LogOut, Cast } from "lucide-react";

export default function Navbar({
  user,
  onOpenAuth,
  onLogout,
  onOpenWatchPartyModal,
  tvMode,
  onToggleTvMode,
  searchQuery,
  onSearchChange
}) {
  const [scrolled, setScrolled] = useState(false);
  const [profileDropdown, setProfileDropdown] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
      <div className="nav-left">
        <a href="#" className="brand-logo" id="nav-brand-logo" suppressHydrationWarning>
          <Film size={28} />
          STREAM<span>HUB</span>
        </a>

        <ul className="nav-links">
          <li><a href="#featured" className="nav-link active" suppressHydrationWarning>Home</a></li>
          <li><a href="#series" className="nav-link" suppressHydrationWarning>TV Shows</a></li>
          <li><a href="#movies" className="nav-link" suppressHydrationWarning>Movies</a></li>
          <li>
            <a
              href="#party"
              className="nav-link"
              suppressHydrationWarning
              onClick={(e) => {
                e.preventDefault();
                onOpenWatchPartyModal();
              }}
            >
              Watch Party
            </a>
          </li>
          <li><a href="#trending" className="nav-link" suppressHydrationWarning>Trending</a></li>
          <li><a href="#scifi" className="nav-link" suppressHydrationWarning>Sci-Fi</a></li>
        </ul>
      </div>

      <div className="nav-right">
        {/* Search Bar */}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={16} style={{ position: "absolute", left: 10, color: "#888" }} />
          <input
            id="nav-search-input"
            type="text"
            placeholder="Titles, genres..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "9999px",
              padding: "6px 12px 6px 32px",
              color: "#fff",
              fontSize: "13px",
              outline: "none",
              width: "160px",
              transition: "width 0.2s"
            }}
            onFocus={(e) => (e.target.style.width = "220px")}
            onBlur={(e) => (e.target.style.width = "160px")}
          />
        </div>

        {/* TV Mode Toggle */}
        <button
          id="btn-tv-mode-toggle"
          className={`tv-mode-badge ${tvMode ? "active" : ""}`}
          onClick={onToggleTvMode}
          title="Toggle Smart TV Remote D-Pad Navigation Mode"
        >
          <Tv size={14} />
          {tvMode ? "TV Mode: ON" : "TV Mode"}
        </button>

        {/* Watch Party Quick Button */}
        <button
          id="btn-nav-watch-party"
          onClick={onOpenWatchPartyModal}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(229, 9, 20, 0.15)",
            border: "1px solid #E50914",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: "9999px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          <Users size={14} color="#E50914" />
          <span>Party Room</span>
        </button>

        {/* User Account / SecurePool Authentication */}
        {user ? (
          <div style={{ position: "relative" }}>
            <button
              id="btn-user-profile"
              onClick={() => setProfileDropdown(!profileDropdown)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#fff"
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  background: user.avatarColor || "#E50914",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 14,
                  border: "2px solid rgba(255, 255, 255, 0.4)"
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            </button>

            {profileDropdown && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "46px",
                  background: "#181818",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  padding: "12px",
                  minWidth: "210px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
                  zIndex: 200,
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}
              >
                <div style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "8px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>{user.name}</div>
                  <div style={{ fontSize: "12px", color: "#888" }}>{user.email}</div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#46d369",
                      marginTop: "4px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <Cast size={12} /> SecurePool Premium Verified
                  </div>
                </div>

                <button
                  onClick={() => {
                    setProfileDropdown(false);
                    onLogout();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "none",
                    border: "none",
                    color: "#f87171",
                    padding: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    textAlign: "left"
                  }}
                >
                  <LogOut size={14} /> Log Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            id="btn-nav-login"
            onClick={onOpenAuth}
            style={{
              background: "#E50914",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "7px 18px",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            Sign In
          </button>
        )}
      </div>
    </nav>
  );
}
