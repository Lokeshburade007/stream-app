"use client";

import { useState } from "react";
import { X, ShieldCheck, UserCheck, Lock, Mail, User, Sparkles, Smartphone, Tv, Laptop, Crown } from "lucide-react";
import { apiUrl } from "../lib/api";

const quickAccessEnabled = process.env.NEXT_PUBLIC_ENABLE_QUICK_ACCESS === "true";

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  if (!isOpen) return null;

  // 1. Direct 1-Click Quick Access (generates valid RS256 token signed by SecurePool)
  const handleQuickDemo = async (demoName, demoEmail) => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(apiUrl("/auth/quick-access"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "default"
        },
        body: JSON.stringify({ name: demoName, email: demoEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log in");

      localStorage.setItem("stream_auth_token", data.accessToken);
      localStorage.setItem("stream_user", JSON.stringify(data.user));
      onLoginSuccess(data.user, data.accessToken);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Standard SecurePool Register & Login
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      if (isRegister) {
        if (!otpStep) {
          // Step 1: Register
          const emailStatus = await fetch(apiUrl("/api/auth/email-status"));
          const { otpEmailEnabled } = emailStatus.ok ? await emailStatus.json() : {};
          if (!otpEmailEnabled) {
            throw new Error("OTP email is not configured on the server. Add SMTP_PASS to server/.env and restart the server.");
          }
          const res = await fetch(apiUrl("/auth/register"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-tenant-id": "default"
            },
            body: JSON.stringify({ email, password, name })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Registration failed");
          if (data.developmentOtp) {
            setOtpCode(data.developmentOtp);
            setNotice("Development verification code has been filled in. Select Verify & Enter to finish sign-up.");
          } else {
            setNotice("A verification code has been sent to your email address.");
          }
          setOtpStep(true);
        } else {
          // Step 2: Verify OTP
          const res = await fetch(apiUrl("/auth/verify-email"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-tenant-id": "default"
            },
            body: JSON.stringify({ email, code: otpCode })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "OTP verification failed");

          const userObj = data.user || {
            id: `usr_${email.substring(0, 8)}`,
            name: name || email.split("@")[0],
            email,
            avatarColor: "#E50914"
          };
          localStorage.setItem("stream_auth_token", data.accessToken);
          localStorage.setItem("stream_user", JSON.stringify(userObj));
          onLoginSuccess(userObj, data.accessToken);
          onClose();
        }
      } else {
        // Standard Login
        const res = await fetch(apiUrl("/auth/login"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": "default"
          },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invalid email or password");

        const userObj = {
          id: data.user?.id || `usr_${email.substring(0, 8)}`,
          name: data.user?.name || email.split("@")[0],
          email,
          avatarColor: "#E50914"
        };
        localStorage.setItem("stream_auth_token", data.accessToken);
        localStorage.setItem("stream_user", JSON.stringify(userObj));
        onLoginSuccess(userObj, data.accessToken);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(229,9,20,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={22} color="#E50914" />
            </div>
            <div>
              <h2 className="modal-title">
                {isRegister ? (otpStep ? "Verify OTP" : "Create Account") : "Sign In to StreamHub"}
              </h2>
              <p style={{ fontSize: 12, color: "#888" }}>
                Powered by <strong>SecurePool</strong> RS256 Auth Framework
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444", color: "#fca5a5", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }}>
            {error}
          </div>
        )}

        {notice && (
          <div style={{ background: "rgba(70,211,105,0.12)", border: "1px solid #46d369", color: "#b7f7c6", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }}>
            {notice}
          </div>
        )}

        {/* Disabled in production so nobody can impersonate an administrator. */}
        {quickAccessEnabled && <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 14, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ffb703", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Sparkles size={14} />
            <span>1-CLICK MULTI-DEVICE DEMO PROFILES</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              id="btn-demo-host"
              type="button"
              onClick={() => handleQuickDemo("Lokesh (Host)", "buradepiyush@gmail.com")}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "10px",
                background: "rgba(229, 9, 20, 0.15)",
                border: "1px solid #E50914",
                borderRadius: 6,
                color: "#fff",
                cursor: "pointer"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
                <Crown size={14} color="#ffb703" /> Lokesh (Host)
              </div>
              <span style={{ fontSize: 10, color: "#aaa" }}>Host · Upload & Library</span>
            </button>

            <button
              id="btn-demo-friend"
              type="button"
              onClick={() => handleQuickDemo("Alex (Friend)", "alex@streamhub.io")}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "10px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                color: "#fff",
                cursor: "pointer"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
                <Smartphone size={14} /> Alex (Friend)
              </div>
              <span style={{ fontSize: 10, color: "#aaa" }}>Mobile Viewer</span>
            </button>
          </div>
        </div>}

        {quickAccessEnabled && <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: 12, color: "#666" }}>OR WITH CREDENTIALS</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
        </div>}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {isRegister && !otpStep && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                id="input-auth-name"
                type="text"
                className="form-input"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          {!otpStep ? (
            <>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  id="input-auth-email"
                  type="email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  id="input-auth-password"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label className="form-label">6-Digit Verification OTP</label>
              <input
                id="input-auth-otp"
                type="text"
                className="form-input"
                placeholder="123456"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                style={{ fontSize: 20, letterSpacing: 4, textAlign: "center" }}
                required
              />
            </div>
          )}

          <button
            id="btn-auth-submit"
            type="submit"
            disabled={loading}
            className="btn-party"
            style={{ width: "100%", justifyContent: "center", padding: "12px", marginTop: "4px" }}
          >
            {loading ? "Authenticating..." : isRegister ? (otpStep ? "Verify & Enter" : "Send OTP & Register") : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", fontSize: 13, color: "#888" }}>
          {isRegister ? "Already have an account?" : "New to StreamHub?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setOtpStep(false);
              setError("");
              setNotice("");
              setOtpCode("");
            }}
            style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
          >
            {isRegister ? "Sign In" : "Sign up now"}
          </button>
        </div>
      </div>
    </div>
  );
}
