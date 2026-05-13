import { useState, useRef } from "react";
import "./App.css";
import { uploadInvoice } from "./api/invoiceApi";

// Upload state machine
const STATUS = {
  IDLE: "idle",
  UPLOADING: "uploading",
  SUCCESS: "success",
  ERROR: "error",
};

export default function App() {
  const [pdfFile, setPdfFile]       = useState(null);
  const [pdfUrl, setPdfUrl]         = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [uploadStatus, setUploadStatus]   = useState(STATUS.IDLE);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult]   = useState(null);
  const [uploadError, setUploadError]     = useState(null);

  // Right panel tab: "preview" | "info"
  const [rightTab, setRightTab] = useState("preview");

  const fileInputRef = useRef(null);

  // ── File selection ────────────────────────────────────────────────────────

  const handleFile = (file) => {
    if (!file || file.type !== "application/pdf") return;
    setPdfFile(file);
    setPdfUrl(URL.createObjectURL(file));
    setUploadStatus(STATUS.IDLE);
    setUploadProgress(0);
    setUploadResult(null);
    setUploadError(null);
    setRightTab("preview");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleDragOver   = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave  = ()  => setIsDragging(false);
  const handleInputChange = (e) => handleFile(e.target.files[0]);

  const handleRemove = () => {
    setPdfFile(null);
    setPdfUrl(null);
    setUploadStatus(STATUS.IDLE);
    setUploadProgress(0);
    setUploadResult(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Upload to backend ─────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!pdfFile) return;
    setUploadStatus(STATUS.UPLOADING);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const result = await uploadInvoice(pdfFile, (pct) => setUploadProgress(pct));
      setUploadResult(result);
      setUploadStatus(STATUS.SUCCESS);
      setRightTab("info"); // auto-switch to info tab after success
    } catch (err) {
      setUploadError(err.message);
      setUploadStatus(STATUS.ERROR);
    }
  };

  // ── Right panel body ──────────────────────────────────────────────────────

  const renderRightBody = () => {
    // No file selected yet
    if (!pdfFile) {
      return (
        <div className="placeholder-content">
          <div className="placeholder-icon">🗂️</div>
          <p className="placeholder-label">No invoice loaded</p>
          <p className="placeholder-sub">Upload a PDF to see a preview here</p>
        </div>
      );
    }

    // Preview tab — always show the iframe once a file is selected
    if (rightTab === "preview") {
      return (
        <div className="right-pdf-preview">
          <iframe
            src={pdfUrl}
            title="Invoice Preview (Right Panel)"
            className="right-pdf-frame"
          />
        </div>
      );
    }

    // Info tab
    if (rightTab === "info") {
      if (uploadStatus === STATUS.IDLE) {
        return (
          <div className="placeholder-content">
            <div className="placeholder-icon">📤</div>
            <p className="placeholder-label">Ready to upload</p>
            <p className="placeholder-sub">Click "Send to Backend" to save the invoice</p>
          </div>
        );
      }

      if (uploadStatus === STATUS.UPLOADING) {
        return (
          <div className="placeholder-content">
            <div className="pulse-ring" />
            <p className="placeholder-label uploading">Uploading… {uploadProgress}%</p>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        );
      }

      if (uploadStatus === STATUS.SUCCESS) {
        return (
          <div className="placeholder-content">
            <div className="success-icon">✅</div>
            <p className="placeholder-label success-text">Saved to Backend</p>
            <div className="result-card">
              <ResultRow label="File ID"     value={uploadResult.file_id} />
              <ResultRow label="Saved as"    value={uploadResult.saved_as} />
              <ResultRow label="Size"        value={formatBytes(uploadResult.size_bytes)} />
              <ResultRow label="Uploaded at" value={formatDate(uploadResult.uploaded_at)} />
            </div>
          </div>
        );
      }

      if (uploadStatus === STATUS.ERROR) {
        return (
          <div className="placeholder-content">
            <div className="placeholder-icon">❌</div>
            <p className="placeholder-label error-text">Upload failed</p>
            <p className="placeholder-sub">{uploadError}</p>
            <button className="retry-btn" onClick={handleUpload}>Retry</button>
          </div>
        );
      }
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">

      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="nav-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">
            invoice<span className="brand-accent">Agent</span>
          </span>
        </div>
        <div className="nav-search">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search invoices..." />
          <kbd>Ctrl K</kbd>
        </div>
        <div className="nav-actions">
          <button className="nav-btn" title="GitHub">⬡</button>
          <button className="nav-btn" title="Settings">⚙</button>
          <div className="nav-mode">Auto ▾</div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="main">

        {/* Left Panel */}
        <section className="left-panel">
          <div className="hero-text">
            <h1>
              Extract from<br />
              <span className="highlight">Invoices</span>
            </h1>
            <p className="hero-sub">
              AI-powered validation agent that reads, parses, and verifies your
              invoice data — instantly and accurately.
            </p>
          </div>

          {/* Upload Zone or PDF Preview */}
          {!pdfUrl ? (
            <div
              className={`upload-zone ${isDragging ? "dragging" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current.click()}
            >
              <div className="upload-icon">📄</div>
              <p className="upload-title">Drop your invoice PDF here</p>
              <p className="upload-sub">or click to browse files</p>
              <span className="upload-badge">PDF only</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleInputChange}
                hidden
              />
            </div>
          ) : (
            <div className="pdf-preview-wrapper">
              <div className="preview-header">
                <span className="preview-filename">📄 {pdfFile.name}</span>
                <button className="remove-btn" onClick={handleRemove}>✕ Remove</button>
              </div>
              <div className="pdf-frame-container">
                <iframe src={pdfUrl} title="Invoice Preview" className="pdf-frame" />
              </div>
            </div>
          )}

          {/* CTA Buttons */}
          <div className="cta-row">
            <button
              className="btn-primary"
              onClick={pdfFile ? handleUpload : () => fileInputRef.current?.click()}
              disabled={uploadStatus === STATUS.UPLOADING}
            >
              {!pdfFile                                    && "Get Started →"}
              {pdfFile && uploadStatus === STATUS.IDLE     && "Send to Backend →"}
              {pdfFile && uploadStatus === STATUS.UPLOADING && `Uploading ${uploadProgress}%…`}
              {pdfFile && uploadStatus === STATUS.SUCCESS  && "Upload Another →"}
              {pdfFile && uploadStatus === STATUS.ERROR    && "Retry Upload →"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              {pdfFile ? "Replace PDF ↺" : "Learn more ♡"}
            </button>
          </div>
        </section>

        {/* Right Panel */}
        <section className="right-panel">
          <div className="right-box">

            {/* Header with tabs */}
            <div className="right-box-header">
              <span className="right-box-dot red" />
              <span className="right-box-dot yellow" />
              <span className="right-box-dot green" />

              {pdfFile ? (
                <div className="right-tabs">
                  <button
                    className={`right-tab ${rightTab === "preview" ? "active" : ""}`}
                    onClick={() => setRightTab("preview")}
                  >
                    Preview
                  </button>
                  <button
                    className={`right-tab ${rightTab === "info" ? "active" : ""}`}
                    onClick={() => setRightTab("info")}
                  >
                    Upload Info
                    {uploadStatus === STATUS.SUCCESS && (
                      <span className="tab-badge success" />
                    )}
                    {uploadStatus === STATUS.ERROR && (
                      <span className="tab-badge error" />
                    )}
                  </button>
                </div>
              ) : (
                <span className="right-box-title">Extraction Results</span>
              )}
            </div>

            {/* Body */}
            <div className={`right-box-body ${rightTab === "preview" && pdfFile ? "no-pad" : ""}`}>
              {renderRightBody()}
            </div>

          </div>
        </section>

      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResultRow({ label, value }) {
  return (
    <div className="result-row">
      <span className="result-label">{label}</span>
      <span className="result-value">{value}</span>
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}