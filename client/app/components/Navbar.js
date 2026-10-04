"use client";

import { useState, useEffect } from "react";
import {
  Film,
  Users,
  Tv,
  Search,
  User,
  LogOut,
  Cast,
  HardDrive,
  Menu,
  X,
  Home,
  Flame,
  Sparkles,
  Crown
} from "lucide-react";

export default function Navbar({
  user,
  onOpenAuth,
  onLogout,
  onOpenWatchPartyModal,
  onOpenLibrary,
  isHost,
  tvMode,
  onToggleTvMode,
  searchQuery,
  onSearchChange
}) {
  const [scrolled, setScrolled] = useState(false);
  const [profileDropdown, setProfileDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleMobileNavClick = (hash, action) => {
    setMobileMenuOpen(false);
    if (action) {
      action();
      return;
    }
    if (hash) {
      const element = document.querySelector(hash);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <>
      <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-left">
          <a href="#" className="brand-logo" id="nav-brand-logo" suppressHydrationWarning>
            <Film size={26} />
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
          {/* Desktop Search Bar */}
          <div className="nav-search-desktop" style={{ position: "relative", display: "flex", alignItems: "center" }}>
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

          {/* TV Mode Toggle (Desktop) */}
          <button
            id="btn-tv-mode-toggle"
            className={`tv-mode-badge desktop-only-btn ${tvMode ? "active" : ""}`}
            onClick={onToggleTvMode}
            title="Toggle Smart TV Remote D-Pad Navigation Mode"
          >
            <Tv size={14} />
            {tvMode ? "TV Mode: ON" : "TV Mode"}
          </button>

          {/* Host Library / Upload Video (Desktop) */}
          {user && (
            <button
              id="btn-host-library"
              className="desktop-only-btn"
              onClick={onOpenLibrary}
              title={isHost ? "Upload or manage the host video library" : "Open the video library. Upload and deletion are restricted to the host account."}
              style={{ display: "flex", alignItems: "center", gap: "6px", background: isHost ? "rgba(70,211,105,.12)" : "rgba(255,255,255,.08)", border: `1px solid ${isHost ? "#46d369" : "rgba(255,255,255,.25)"}`, color: isHost ? "#b7f7c6" : "#fff", padding: "6px 12px", borderRadius: "9999px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
            >
              <HardDrive size={14} /> {isHost ? "Upload Video" : "Video Library"}
            </button>
          )}

          {/* Watch Party Quick Button */}
          <button
            id="btn-nav-watch-party"
            onClick={onOpenWatchPartyModal}
            className="btn-nav-watch-party-responsive"
            title="Watch Party Room"
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
            <span className="party-btn-text">Party Room</span>
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
                    id="btn-host-library-menu"
                    onClick={() => {
                      setProfileDropdown(false);
                      onOpenLibrary();
                    }}
                    title={isHost ? "Upload or manage the host video library" : "Only the configured host can upload or delete videos"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: isHost ? "rgba(70,211,105,.12)" : "rgba(255,255,255,.06)",
                      border: `1px solid ${isHost ? "#46d369" : "rgba(255,255,255,.18)"}`,
                      borderRadius: "6px",
                      color: isHost ? "#b7f7c6" : "#ddd",
                      padding: "8px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 700,
                      textAlign: "left"
                    }}
                  >
                    <HardDrive size={15} /> {isHost ? "Manage 20 GB Video Library" : "View Video Library"}
                  </button>

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
                padding: "6px 14px",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              Sign In
            </button>
          )}

          {/* Hamburger Menu Toggle (Mobile & Tablet) */}
          <button
            id="btn-nav-hamburger"
            className="nav-hamburger-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            title="Navigation Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Backdrop */}
      <div
        className={`mobile-menu-backdrop ${mobileMenuOpen ? "open" : ""}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Mobile Navigation Drawer */}
      <aside className={`mobile-nav-drawer ${mobileMenuOpen ? "open" : ""}`} aria-label="Mobile Navigation">
        <div className="mobile-drawer-header">
          <div className="brand-logo" style={{ fontSize: 22 }}>
            <Film size={22} />
            STREAM<span>HUB</span>
          </div>
          <button
            className="nav-hamburger-btn"
            style={{ display: "flex" }}
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar in Mobile Menu */}
        <div className="mobile-search-bar">
          <Search size={16} />
          <input
            id="mobile-search-input"
            type="text"
            placeholder="Search movies, series, genres..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Navigation Links */}
        <ul className="mobile-nav-list">
          <li>
            <button
              className="mobile-nav-item"
              onClick={() => handleMobileNavClick("#featured")}
            >
              <div className="mobile-nav-item-left">
                <Home size={18} color="#E50914" />
                <span>Home</span>
              </div>
            </button>
          </li>
          <li>
            <button
              className="mobile-nav-item"
              onClick={() => handleMobileNavClick("#series")}
            >
              <div className="mobile-nav-item-left">
                <Tv size={18} color="#60a5fa" />
                <span>TV Shows &amp; Series</span>
              </div>
            </button>
          </li>
          <li>
            <button
              className="mobile-nav-item"
              onClick={() => handleMobileNavClick("#movies")}
            >
              <div className="mobile-nav-item-left">
                <Film size={18} color="#f59e0b" />
                <span>Movies</span>
              </div>
            </button>
          </li>
          <li>
            <button
              className="mobile-nav-item"
              onClick={() => handleMobileNavClick(null, onOpenWatchPartyModal)}
            >
              <div className="mobile-nav-item-left">
                <Users size={18} color="#ef4444" />
                <span>Watch Party Room</span>
              </div>
              <span style={{ fontSize: 11, background: "rgba(229,9,20,0.2)", color: "#fca5a5", padding: "2px 8px", borderRadius: 99 }}>Live Sync</span>
            </button>
          </li>
          <li>
            <button
              className="mobile-nav-item"
              onClick={() => handleMobileNavClick("#trending")}
            >
              <div className="mobile-nav-item-left">
                <Flame size={18} color="#f97316" />
                <span>Trending Now</span>
              </div>
            </button>
          </li>
          <li>
            <button
              className="mobile-nav-item"
              onClick={() => handleMobileNavClick("#scifi")}
            >
              <div className="mobile-nav-item-left">
                <Sparkles size={18} color="#a855f7" />
                <span>Sci-Fi &amp; Cyber</span>
              </div>
            </button>
          </li>
        </ul>

        {/* Mobile Actions: Library & Smart TV */}
        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 10 }}>
          {user ? (
            <button
              id="mobile-btn-library"
              onClick={() => handleMobileNavClick(null, onOpenLibrary)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: 8,
                background: isHost ? "rgba(70,211,105,0.12)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${isHost ? "#46d369" : "rgba(255,255,255,0.2)"}`,
                color: isHost ? "#b7f7c6" : "#fff",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <HardDrive size={18} color={isHost ? "#46d369" : "#fff"} />
                <span>{isHost ? "Host Video Library (20 GB)" : "My Video Library"}</span>
              </div>
              {isHost && <Crown size={16} color="#46d369" />}
            </button>
          ) : (
            <button
              onClick={() => handleMobileNavClick(null, onOpenAuth)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px",
                borderRadius: 8,
                background: "#E50914",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700
              }}
            >
              <User size={18} /> Sign In to StreamHub
            </button>
          )}

          {/* Smart TV D-Pad Mode Toggle */}
          <button
            id="mobile-btn-tv-mode"
            onClick={onToggleTvMode}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: 8,
              background: tvMode ? "rgba(229,9,20,0.18)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${tvMode ? "#E50914" : "rgba(255,255,255,0.12)"}`,
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Tv size={16} />
              <span>Smart TV Remote Mode</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: tvMode ? "#46d369" : "#888" }}>
              {tvMode ? "ACTIVE" : "OFF"}
            </span>
          </button>

          {/* User Logged In Info */}
          {user && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 4px", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: user.avatarColor || "#E50914", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12 }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ fontSize: 12, color: "#aaa" }}>{user.name}</div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}
              >
                <LogOut size={14} /> Log Out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
