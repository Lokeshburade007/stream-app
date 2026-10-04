"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HardDrive, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { apiUrl } from "../lib/api";

function formatBytes(bytes = 0) {
  if (!bytes) return "0 GB";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(bytes >= 1024 * 1024 * 1024 ? 2 : 3)} GB`;
}

export default function LibraryManagerModal({ isOpen, onClose, authToken, onLibraryChanged }) {
  const [library, setLibrary] = useState(null);
  const [file, setFile] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pollTimer = useRef(null);

  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  const loadLibrary = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/library"), {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load the personal library");
      setLibrary(data);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (!isOpen) return () => window.clearInterval(pollTimer.current);
    const initialRequest = window.setTimeout(() => { void loadLibrary(); }, 0);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(pollTimer.current);
    };
  }, [isOpen, loadLibrary]);

  const pollJob = (jobId) => {
    window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(async () => {
      try {
        const response = await fetch(apiUrl(`/api/media/uploads/${jobId}`), { headers });
        const nextJob = await response.json();
        if (!response.ok) throw new Error(nextJob.error || "Unable to retrieve upload status");
        setJob(nextJob);
        if (["completed", "failed"].includes(nextJob.status)) {
          window.clearInterval(pollTimer.current);
          if (nextJob.status === "completed") {
            setFile(null);
            await loadLibrary();
            onLibraryChanged?.();
          }
        }
      } catch (requestError) {
        window.clearInterval(pollTimer.current);
        setError(requestError.message);
      }
    }, 1500);
  };

  const uploadMovie = async (event) => {
    event.preventDefault();
    if (!file) return setError("Choose a video file first.");
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("video", file);
      const response = await fetch(apiUrl("/api/media/upload"), { method: "POST", headers, body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload was rejected");
      setJob(data.job);
      pollJob(data.job.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteMovie = async (mediaId) => {
    if (!window.confirm("Delete this movie and all of its generated HLS files? This cannot be undone.")) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/library/${encodeURIComponent(mediaId)}`), { method: "DELETE", headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete the movie");
      setJob(null);
      await loadLibrary();
      onLibraryChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;
  const storage = library?.storage;
  const media = library?.media || [];
  const canUpload = library && !storage?.mediaCount && !storage?.activeJob && (!job || job.status === "failed");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 620 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(70,211,105,.15)", display: "grid", placeItems: "center" }}><HardDrive size={20} color="#46d369" /></div>
            <div><h2 className="modal-title">Lokesh’s Video Library</h2><p style={{ fontSize: 12, color: "#888" }}>Host-only upload and deletion controls</p></div>
          </div>
          <button onClick={onClose} className="icon-btn"><X size={20} /></button>
        </div>

        {storage && (
          <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}><strong>Server storage</strong><span>{formatBytes(storage.usedBytes)} / {formatBytes(storage.quotaBytes)}</span></div>
            <div style={{ height: 8, background: "#333", borderRadius: 999 }}><div style={{ height: "100%", width: `${Math.min(100, storage.usedBytes / storage.quotaBytes * 100)}%`, background: storage.usedBytes / storage.quotaBytes > .85 ? "#ef4444" : "#46d369", borderRadius: 999 }} /></div>
            <p style={{ fontSize: 12, color: "#aaa", marginTop: 9 }}>One movie at a time. Original uploads are removed after encoding; HLS playback files remain within the 10 GB quota.</p>
          </div>
        )}

        {error && <div style={{ color: "#fca5a5", background: "rgba(239,68,68,.12)", border: "1px solid #ef4444", padding: 10, borderRadius: 6, fontSize: 13 }}>{error}</div>}

        {job && <div style={{ background: "rgba(59,130,246,.12)", border: "1px solid rgba(96,165,250,.4)", padding: 12, borderRadius: 8, fontSize: 13 }}><strong>Encoding: {job.status}</strong><div style={{ marginTop: 7, height: 6, background: "#26344d", borderRadius: 99 }}><div style={{ height: "100%", width: `${job.progress || 0}%`, background: "#60a5fa", borderRadius: 99 }} /></div><div style={{ color: "#bfdbfe", marginTop: 6 }}>{job.progress || 0}% · {job.originalName}</div>{job.error && <div style={{ color: "#fca5a5", marginTop: 6 }}>{job.error}</div>}</div>}

        {media.map((item) => <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid rgba(255,255,255,.1)", padding: 12, borderRadius: 8 }}><div><strong>{item.title}</strong><div style={{ color: "#aaa", fontSize: 12, marginTop: 3 }}>{item.durationFormatted} · Adaptive HLS ready</div></div><button type="button" onClick={() => deleteMovie(item.id)} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(239,68,68,.15)", color: "#fca5a5", border: "1px solid #ef4444", borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}><Trash2 size={15} /> Delete</button></div>)}

        {canUpload && <form onSubmit={uploadMovie} style={{ display: "flex", flexDirection: "column", gap: 10 }}><label style={{ fontSize: 13, color: "#ddd" }}>Upload new movie <span style={{ color: "#aaa", fontWeight: 400 }}>(source up to {formatBytes(library.maxUploadBytes)})</span><input type="file" accept="video/mp4,video/x-matroska,video/quicktime,video/webm,video/x-m4v" onChange={(event) => setFile(event.target.files?.[0] || null)} style={{ display: "block", marginTop: 7, width: "100%" }} /></label>{file && <span style={{ fontSize: 12, color: "#aaa" }}>{file.name} · {formatBytes(file.size)}</span>}<button type="submit" disabled={loading} className="btn-party" style={{ justifyContent: "center" }}><Upload size={16} /> Upload and encode</button></form>}

        <button type="button" onClick={loadLibrary} disabled={loading} style={{ background: "none", color: "#aaa", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}><RefreshCw size={13} /> Refresh library status</button>
      </div>
    </div>
  );
}
