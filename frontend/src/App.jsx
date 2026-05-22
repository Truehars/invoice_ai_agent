// src/App.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import { uploadInvoice, analyseInvoice, sendChatMessage } from "./api/invoiceApi";

// ── Constants ────────────────────────────────────────────────────

const STATUS = {
  IDLE:      "idle",
  UPLOADING: "uploading",
  ANALYSING: "analysing",
  SUCCESS:   "success",
  ERROR:     "error",
};

const DECISION_META = {
  auto_approve:     { icon: "🟢", label: "Approved — looks good!",         color: "#28c840" },
  flag_for_review:  { icon: "🟡", label: "Needs a quick check",            color: "#ffbd2e" },
  request_resubmit: { icon: "🟠", label: "Please send a corrected copy",   color: "#f5a623" },
  reject_document:  { icon: "🔴", label: "Cannot be processed",            color: "#e05c5c" },
};

// Human-readable step labels (no agent/pipeline jargon)
const PIPELINE_STEPS = [
  { key: "upload",    icon: "📤", label: "Saving your file"      },
  { key: "read",      icon: "🔍", label: "Reading the document"  },
  { key: "check",     icon: "✅", label: "Checking all fields"   },
  { key: "decision",  icon: "📊", label: "Building your report"  },
];

const WELCOME_MESSAGE =
  "👋 Hi! I'm your **Invoice Assistant**.\n\n" +
  "Here's how to get started:\n" +
  "  • **Drop a PDF invoice** onto the area on the left, or click to browse\n" +
  "  • Click **\"Check My Invoice →\"** — I'll read it and tell you what I find\n" +
  "  • Results appear here in about 15 seconds\n\n" +
  "You can also ask me anything about invoices, GST numbers, or how this works!";

const SUGGESTIONS = [
  "What can you do?",
  "What does 'needs a check' mean?",
  "What info do you read from invoices?",
  "How do I upload a file?",
  "What is a GST number?",
];


// ── Utilities ────────────────────────────────────────────────────

function formatBytes(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

/**
 * Confidence bar — purely CSS, no external lib.
 * colour: green ≥85, amber 60-84, red <60
 */
function ConfidenceBar({ value }) {
  const pct   = Math.min(100, Math.max(0, value ?? 0));
  const color = pct >= 85 ? "#28c840" : pct >= 60 ? "#ffbd2e" : "#e05c5c";
  return (
    <div className="conf-bar-wrap" title={`${pct}% confidence`}>
      <div className="conf-bar-track">
        <div className="conf-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="conf-bar-label" style={{ color }}>{pct}%</span>
    </div>
  );
}

/**
 * Inline SVG bar chart — shows top extracted fields by confidence.
 * No matplotlib needed on frontend; chart image comes from backend (/api/invoices/chart).
 * We draw it in SVG directly so it works without any extra library.
 */
function ConfidenceChart({ fields }) {
  if (!fields || Object.keys(fields).length === 0) return null;

  const entries = Object.entries(fields)
    .map(([k, v]) => ({ label: k.replace(/_/g, " "), value: v.confidence ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const W = 340, BAR_H = 22, GAP = 8, LABEL_W = 110, PAD = 12;
  const H = entries.length * (BAR_H + GAP) + PAD * 2;
  const CHART_W = W - LABEL_W - PAD;

  return (
    <div className="chart-wrap">
      <p className="chart-title">📊 Field Confidence Scores</p>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        {entries.map(({ label, value }, i) => {
          const y    = PAD + i * (BAR_H + GAP);
          const barW = Math.max(4, (value / 100) * CHART_W);
          const fill = value >= 85 ? "#28c840" : value >= 60 ? "#ffbd2e" : "#e05c5c";
          return (
            <g key={label}>
              <text
                x={LABEL_W - 6}
                y={y + BAR_H / 2 + 4}
                textAnchor="end"
                fontSize={10}
                fill="var(--text-secondary)"
                style={{ textTransform: "capitalize" }}
              >
                {label.length > 15 ? label.slice(0, 14) + "…" : label}
              </text>
              <rect
                x={LABEL_W}
                y={y}
                width={CHART_W}
                height={BAR_H}
                rx={4}
                fill="var(--border)"
                opacity={0.5}
              />
              <rect
                x={LABEL_W}
                y={y}
                width={barW}
                height={BAR_H}
                rx={4}
                fill={fill}
                opacity={0.85}
              />
              <text
                x={LABEL_W + barW + 4}
                y={y + BAR_H / 2 + 4}
                fontSize={10}
                fill={fill}
                fontWeight={600}
              >
                {value}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Build the friendly summary shown in chat after analysis. */
function buildPipelineSummary(report) {
  // orchestrator returns: extractor_agent, validator_agent, exception_agent
  const extraction  = report?.extractor_agent ?? {};
  const exception   = report?.exception_agent  ?? {};

  const decision = exception.final_decision ?? "unknown";
  const meta     = DECISION_META[decision] ?? { icon: "⚪", label: decision };
  const counts   = exception.exception_counts ?? {};
  const fields   = extraction.extracted_fields ?? {};
  const notes    = exception.processing_notes ?? [];

  // Friendly field lines — no jargon
  const fieldLines = Object.entries(fields)
    .slice(0, 8)
    .map(([k, v]) => `  • **${k.replace(/_/g, " ")}:** ${v.value}`)
    .join("\n");

  // Friendly issue lines — hide severity codes
  const issues = (exception.exceptions ?? []).slice(0, 4)
    .map((ex) => `  • ${ex.reason}`)
    .join("\n");

  const totalIssues = (counts.CRITICAL ?? 0) + (counts.HIGH ?? 0) +
                      (counts.MEDIUM ?? 0)   + (counts.LOW ?? 0);

  const issuesSummary = totalIssues === 0
    ? "✅ No issues found."
    : `Found **${totalIssues} thing${totalIssues > 1 ? "s" : ""}** to look at.`;

  return (
    `✅ **Done! Here's what I found:**\n\n` +
    `**Result:** ${meta.icon} ${meta.label}\n` +
    `**Overall quality:** ${extraction.overall_confidence ?? "—"}%\n\n` +
    `${issuesSummary}\n` +
    (issues ? `\n${issues}\n` : "") +
    (fieldLines ? `\n**What I read from your invoice:**\n${fieldLines}\n\n` : "") +
    (exception.audit_summary ? `📝 ${exception.audit_summary}\n\n` : "") +
    (notes.length ? `**What to do next:**\n${notes.map((n) => `  • ${n}`).join("\n")}\n\n` : "") +
    `Ask me anything about these results! 💬`
  );
}


// ── Sub-components ───────────────────────────────────────────────

function ThemeToggle({ theme, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle} aria-label="Toggle theme">
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb">{theme === "dark" ? "🌙" : "☀️"}</span>
      </span>
      <span className="theme-toggle-label">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

function ResultRow({ label, value }) {
  return (
    <div className="result-row">
      <span className="result-label">{label}</span>
      <span className="result-value">{value}</span>
    </div>
  );
}

/** Render markdown-lite: **bold** and bullet lines. */
function RenderMessage({ text }) {
  return (
    <div>
      {text.split("\n").map((line, i) => {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        const rendered = parts.map((part, j) =>
          j % 2 === 1 ? <strong key={j}>{part}</strong> : part
        );
        const isBullet = line.trimStart().startsWith("•") || line.trimStart().startsWith("  •");
        return (
          <p key={i} className={isBullet ? "chat-bullet" : "chat-line"}>
            {rendered}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Animated pipeline progress stepper.
 * activeStep: 0=upload, 1=read, 2=check, 3=decision, 4=done
 */
function PipelineProgress({ activeStep }) {
  return (
    <div className="pipeline-progress">
      {PIPELINE_STEPS.map((step, i) => {
        const done    = i < activeStep;
        const active  = i === activeStep;
        return (
          <div key={step.key} className="pipeline-step-wrap">
            <div className={`pipeline-node ${done ? "done" : active ? "active" : "pending"}`}>
              {done ? "✓" : step.icon}
            </div>
            <span className={`pipeline-step-label ${active ? "active" : done ? "done" : ""}`}>
              {step.label}
            </span>
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={`pipeline-connector ${done ? "done" : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}


// ── Main App ─────────────────────────────────────────────────────

export default function App() {
  const [pdfFile,        setPdfFile]        = useState(null);
  const [pdfUrl,         setPdfUrl]         = useState(null);
  const [isDragging,     setIsDragging]     = useState(false);
  const [uploadStatus,   setUploadStatus]   = useState(STATUS.IDLE);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult,   setUploadResult]   = useState(null);
  const [pipelineResult, setPipelineResult] = useState(null);
  const [uploadError,    setUploadError]    = useState(null);
  const [pipelineStep,   setPipelineStep]   = useState(0); // 0-4

  const [messages,    setMessages]    = useState([
    { id: 1, role: "bot", text: WELCOME_MESSAGE, time: new Date() },
  ]);
  const [inputValue,  setInputValue]  = useState("");
  const [isTyping,    setIsTyping]    = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  const [theme,    setTheme]    = useState("dark");
  const [rightTab, setRightTab] = useState("chat");

  const fileInputRef    = useRef(null);
  const chatEndRef      = useRef(null);
  const chatMessagesRef = useRef(null);
  const inputRef        = useRef(null);
  const userScrolledUp  = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  useEffect(() => {
    if (!userScrolledUp.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const handleChatScroll = () => {
    const el = chatMessagesRef.current;
    if (!el) return;
    userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 60;
  };

  const addBotMessage = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "bot", text, time: new Date() },
    ]);
  }, []);

  const addToHistory = useCallback((role, content) => {
    setChatHistory((prev) => [...prev, { role, content }]);
  }, []);


  // ── File handling ──────────────────────────────────────────────
  const handleFile = useCallback(
    (file) => {
      if (!file || file.type !== "application/pdf") return;
      setPdfFile(file);
      setPdfUrl(URL.createObjectURL(file));
      setUploadStatus(STATUS.IDLE);
      setUploadProgress(0);
      setUploadResult(null);
      setPipelineResult(null);
      setUploadError(null);
      setPipelineStep(0);
      setRightTab("chat");
      addBotMessage(
        `📄 Got it! I can see **${file.name}** (${formatBytes(file.size)}).\n\n` +
        `Click **"Check My Invoice →"** and I'll read it for you!`
      );
    },
    [addBotMessage]
  );

  const handleDrop      = (e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); };
  const handleDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = ()  => setIsDragging(false);
  const handleInputChange = (e) => handleFile(e.target.files[0]);

  const handleRemove = () => {
    setPdfFile(null);
    setPdfUrl(null);
    setUploadStatus(STATUS.IDLE);
    setUploadProgress(0);
    setUploadResult(null);
    setPipelineResult(null);
    setUploadError(null);
    setPipelineStep(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    addBotMessage("🗑️ Invoice removed. Drop a new one whenever you're ready!");
  };


  // ── Upload + Analyse ───────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!pdfFile) return;

    // Step 0 — upload
    setUploadStatus(STATUS.UPLOADING);
    setUploadProgress(0);
    setUploadError(null);
    setPipelineStep(0);
    addBotMessage(`⏳ Saving your file…`);

    let uploadMeta;
    try {
      uploadMeta = await uploadInvoice(pdfFile, (pct) => setUploadProgress(pct));
      setUploadResult(uploadMeta);
    } catch (err) {
      setUploadStatus(STATUS.ERROR);
      setUploadError(err.message);
      addBotMessage(`❌ **We couldn't save your file.** Please check your connection and try again.`);
      return;
    }

    addBotMessage(
      `✅ File saved successfully!\n` +
      `  • Reference: **${uploadMeta.file_id}**\n` +
      `  • Size: ${formatBytes(uploadMeta.size_bytes)}\n\n` +
      `⏳ Now reading your invoice — this takes about 15 seconds…`
    );

    // Steps 1-3 — analyse
    setUploadStatus(STATUS.ANALYSING);
    setPipelineStep(1);

    // Simulate step progression while API call runs
    const stepTimer1 = setTimeout(() => setPipelineStep(2), 5000);
    const stepTimer2 = setTimeout(() => setPipelineStep(3), 11000);

    try {
      const report = await analyseInvoice(uploadMeta.path);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setPipelineStep(4);
      setPipelineResult(report);
      setUploadStatus(STATUS.SUCCESS);

      const summary = buildPipelineSummary(report);
      addBotMessage(summary);
      addToHistory("assistant", summary);
    } catch (err) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setUploadStatus(STATUS.ERROR);
      const detail = err.response?.data?.detail ?? err.message;
      setUploadError(detail);
      addBotMessage(
        `❌ **Something went wrong while reading your invoice.**\n\n` +
        `This usually happens with scanned image PDFs. ` +
        `Please try uploading a PDF where the text can be selected/copied.`
      );
    }
  }, [pdfFile, addBotMessage, addToHistory]);


  // ── Chat ───────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text) => {
      const trimmed = (text ?? inputValue).trim();
      if (!trimmed || isTyping) return;

      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "user", text: trimmed, time: new Date() },
      ]);
      setInputValue("");
      setIsTyping(true);
      addToHistory("user", trimmed);

      try {
        const reply = await sendChatMessage(trimmed, chatHistory, pipelineResult);
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: "bot", text: reply, time: new Date() },
        ]);
        addToHistory("assistant", reply);
      } catch (err) {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "bot",
            text: `⚠️ Sorry, I couldn't reply right now. Please try again.`,
            time: new Date(),
          },
        ]);
      }
    },
    [inputValue, isTyping, chatHistory, pipelineResult, addToHistory]
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };


  // ── Button labels ──────────────────────────────────────────────
  const primaryBtnLabel = () => {
    if (!pdfFile)                          return "Get Started →";
    if (uploadStatus === STATUS.IDLE)      return "Check My Invoice →";
    if (uploadStatus === STATUS.UPLOADING) return `Saving… ${uploadProgress}%`;
    if (uploadStatus === STATUS.ANALYSING) return "Reading your invoice…";
    if (uploadStatus === STATUS.SUCCESS)   return "Check Another →";
    if (uploadStatus === STATUS.ERROR)     return "Try Again →";
    return "Check My Invoice →";
  };

  const isPrimaryDisabled =
    uploadStatus === STATUS.UPLOADING || uploadStatus === STATUS.ANALYSING;

  const handlePrimaryClick = () => {
    if (uploadStatus === STATUS.SUCCESS) handleRemove();
    else if (pdfFile) handleUpload();
    else fileInputRef.current?.click();
  };


  // ── Info tab ───────────────────────────────────────────────────
  const renderInfoTab = () => {
    if (uploadStatus === STATUS.IDLE) {
      return (
        <div className="placeholder-content">
          <div className="placeholder-icon">📤</div>
          <p className="placeholder-label">Ready to go</p>
          <p className="placeholder-sub">Click "Check My Invoice" to start</p>
        </div>
      );
    }

    if (uploadStatus === STATUS.UPLOADING) {
      return (
        <div className="placeholder-content">
          <div className="pulse-ring" />
          <p className="placeholder-label uploading">Saving your file… {uploadProgress}%</p>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      );
    }

    if (uploadStatus === STATUS.ANALYSING) {
      return (
        <div className="placeholder-content">
          <div className="pulse-ring" />
          <p className="placeholder-label uploading">Reading your invoice…</p>
          <p className="placeholder-sub" style={{ marginBottom: 16 }}>
            Please wait — this takes about 15 seconds
          </p>
          <PipelineProgress activeStep={pipelineStep} />
        </div>
      );
    }

    if (uploadStatus === STATUS.SUCCESS && uploadResult) {
      const extraction = pipelineResult?.extractor_agent ?? {};
      const exception  = pipelineResult?.exception_agent  ?? {};
      const decision   = exception.final_decision;
      const meta       = decision ? DECISION_META[decision] : null;
      const fields     = extraction.extracted_fields ?? {};
      const counts     = exception.exception_counts ?? {};

      return (
        <div className="info-success-wrap">
          <div className="success-icon">✅</div>
          <p className="placeholder-label success-text">Analysis Complete</p>

          <div className="result-card">
            <ResultRow label="Reference"  value={uploadResult.file_id} />
            <ResultRow label="File"       value={pdfFile?.name ?? uploadResult.saved_as} />
            <ResultRow label="Size"       value={formatBytes(uploadResult.size_bytes)} />
            <ResultRow label="Received"   value={formatDate(uploadResult.uploaded_at)} />
            {meta && <ResultRow label="Result" value={`${meta.icon} ${meta.label}`} />}
            <ResultRow label="Quality"    value={`${extraction.overall_confidence ?? "—"}%`} />
          </div>

          {/* Exception count badges */}
          {(counts.CRITICAL > 0 || counts.HIGH > 0 || counts.MEDIUM > 0 || counts.LOW > 0) && (
            <div className="exception-badges">
              {counts.CRITICAL > 0 && <span className="exc-badge critical">{counts.CRITICAL} Critical</span>}
              {counts.HIGH     > 0 && <span className="exc-badge high">{counts.HIGH} High</span>}
              {counts.MEDIUM   > 0 && <span className="exc-badge medium">{counts.MEDIUM} Medium</span>}
              {counts.LOW      > 0 && <span className="exc-badge low">{counts.LOW} Low</span>}
            </div>
          )}

          {/* Confidence chart */}
          <ConfidenceChart fields={fields} />

          {/* Per-field confidence bars */}
          {Object.keys(fields).length > 0 && (
            <div className="field-conf-list">
              <p className="field-conf-title">Field breakdown</p>
              {Object.entries(fields).slice(0, 8).map(([k, v]) => (
                <div key={k} className="field-conf-row">
                  <span className="field-conf-name">{k.replace(/_/g, " ")}</span>
                  <ConfidenceBar value={v.confidence} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (uploadStatus === STATUS.ERROR) {
      return (
        <div className="placeholder-content">
          <div className="placeholder-icon">❌</div>
          <p className="placeholder-label error-text">Something went wrong</p>
          <p className="placeholder-sub">{uploadError}</p>
          <button className="retry-btn" onClick={handleUpload}>Try Again</button>
        </div>
      );
    }
    return null;
  };


  // ── Right body ─────────────────────────────────────────────────
  const renderRightBody = () => {
    if (rightTab === "chat") {
      return (
        <div className="chat-panel">
          <div className="chat-messages" ref={chatMessagesRef} onScroll={handleChatScroll}>
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble-wrap ${msg.role}`}>
                {msg.role === "bot" && <div className="chat-avatar">🤖</div>}
                <div className={`chat-bubble ${msg.role}`}>
                  <RenderMessage text={msg.text} />
                  <span className="chat-time">
                    {msg.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="chat-bubble-wrap bot">
                <div className="chat-avatar">🤖</div>
                <div className="chat-bubble bot typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {messages.length <= 2 && (
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion-chip" onClick={() => sendMessage(s)}>{s}</button>
              ))}
            </div>
          )}

          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              placeholder="Ask me anything about your invoice…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isTyping}
            />
            <button
              className="chat-send-btn"
              onClick={() => sendMessage()}
              disabled={!inputValue.trim() || isTyping}
              title="Send"
            >
              ➤
            </button>
          </div>
        </div>
      );
    }

    if (rightTab === "preview") {
      if (!pdfFile) {
        return (
          <div className="placeholder-content">
            <div className="placeholder-icon">🗂️</div>
            <p className="placeholder-label">No invoice loaded</p>
            <p className="placeholder-sub">Upload a PDF to preview it here</p>
          </div>
        );
      }
      return (
        <div className="right-pdf-preview">
          <iframe src={pdfUrl} title="Invoice Preview" className="right-pdf-frame" />
        </div>
      );
    }

    if (rightTab === "info") return renderInfoTab();
    return null;
  };


  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">
            invoice<span className="brand-accent">Agent</span>
          </span>
        </div>
        <div className="nav-search">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search invoices…" />
          <kbd>Ctrl K</kbd>
        </div>
        <div className="nav-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </nav>

      <main className="main">
        {/* ── Left Panel ── */}
        <section className="left-panel">
          <div className="hero-text">
            <h1>
              Check your<br />
              <span className="highlight">Invoices</span>
            </h1>
            <p className="hero-sub">
              Upload any invoice PDF and I'll read it, check every field,
              and tell you exactly what's there — in plain language.
            </p>
          </div>

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

          <div className="cta-row">
            <button className="btn-primary" onClick={handlePrimaryClick} disabled={isPrimaryDisabled}>
              {primaryBtnLabel()}
            </button>
          </div>

          {/* Friendly animated progress — shown while working */}
          {(uploadStatus === STATUS.UPLOADING || uploadStatus === STATUS.ANALYSING) && (
            <div className="pipeline-status-outer">
              <PipelineProgress activeStep={
                uploadStatus === STATUS.UPLOADING ? 0 : pipelineStep
              } />
            </div>
          )}
        </section>

        {/* ── Right Panel ── */}
        <section className="right-panel">
          <div className="right-box">
            <div className="right-box-header">
              <span className="right-box-dot red" />
              <span className="right-box-dot yellow" />
              <span className="right-box-dot green" />
              <div className="right-tabs">
                {[
                  { id: "chat",    label: "💬 Chat" },
                  { id: "preview", label: "🗂️ Preview" },
                  { id: "info",    label: "📋 Results" },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    className={`right-tab ${rightTab === id ? "active" : ""}`}
                    onClick={() => setRightTab(id)}
                  >
                    {label}
                    {id === "info" && uploadStatus === STATUS.SUCCESS && (
                      <span className="tab-badge success" />
                    )}
                    {id === "info" && uploadStatus === STATUS.ERROR && (
                      <span className="tab-badge error" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className={`right-box-body ${
              rightTab === "preview" && pdfFile ? "no-pad" :
              rightTab === "chat"              ? "no-pad" : ""
            }`}>
              {renderRightBody()}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
