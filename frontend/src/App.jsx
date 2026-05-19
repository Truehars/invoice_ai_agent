import { useState, useRef, useEffect } from "react";
import "./App.css";
import { uploadInvoice } from "./api/invoiceApi";
import wnsLogo from "./assets/wns.png";

// ── App States ──────────────────────────────────────────────────────────────
const STATUS = {
  IDLE:      "idle",
  UPLOADING: "uploading",
  SUCCESS:   "success",
  ERROR:     "error",
};

// ── Predefined Q&A ──────────────────────────────────────────────────────────
const FAQ = [
  {
    patterns: ["hi", "hello", "hey", "hii", "helo", "greetings", "good morning", "good afternoon", "good evening"],
    response:
      "👋 Hi there! I'm your **Invoice Validation Assistant**. I'm here to help you verify and extract information from your invoice PDFs.\n\nJust upload your invoice and I'll give you a full analysis — checking whether it's valid, pulling out the key details, and flagging anything that needs attention. How can I help you today?",
  },
  {
    patterns: ["what can you do", "what do you do", "your capabilities", "help", "how does this work", "how does it work"],
    response:
      "🤖 Here's what I can do for you:\n\n• **Read** your invoice and pull out key information\n• **Check** that your invoice is complete and correctly filled\n• **Highlight** anything missing or unclear\n• **Summarise** line items and totals\n• **Identify** the type of document you've uploaded\n\nSimply upload a PDF and I'll get to work instantly!",
  },
  {
    patterns: ["what is invoice validation", "what is validation", "invoice validation"],
    response:
      "📋 **Invoice Checking** is the process of:\n\n1. Confirming the document is a genuine invoice\n2. Making sure all required details are present (invoice number, date, supplier, totals)\n3. Verifying the amounts add up correctly\n4. Flagging any missing important details like GST or PAN numbers\n5. Giving each piece of information a reliability score\n\nUpload your PDF and I'll check it right away!",
  },
  {
    patterns: ["what fields", "which fields", "what information", "what data", "what does it extract"],
    response:
      "🔍 I can read the following details from your invoice:\n\n**Reference:** Invoice number, date, due date\n**Parties:** Supplier name, your name\n**Addresses:** Billing address, delivery address\n**Contact:** Phone number, email\n**Tax Details:** GST number, PAN number\n**Bank Info:** Loan account number, bank name, IFSC code\n**Amounts:** Currency, subtotal, tax amount, total amount\n**Items:** Description, quantity, unit price, amount\n\nReady to upload your invoice?",
  },
  {
    patterns: ["pdf", "upload pdf", "how to upload", "how do i upload", "upload invoice"],
    response:
      "📤 Uploading is easy!\n\n1. **Drag & drop** your invoice PDF onto the upload area on the left, OR\n2. **Click** the upload area to browse your files\n3. Once selected, click **\"Analyse Invoice →\"** to process it\n\nI only accept PDF files. Make sure your invoice is saved as a PDF before uploading.",
  },
  {
    patterns: ["gst", "gst number", "gst validation", "gstin"],
    response:
      "🏛️ **GST Number Check:** I read the GSTIN (GST Identification Number) from your invoice.\n\nA valid GSTIN is 15 characters long — for example: **22AAAAA0000A1Z5**\n\nIf the GST number is on your invoice, I'll read it and rate how clearly it was detected. If it's missing or looks incorrect, I'll flag it in the results.",
  },
  {
    patterns: ["how long", "how much time", "processing time", "how fast", "speed"],
    response:
      "⚡ Results are near-instant!\n\n• **Upload:** A few seconds depending on file size\n• **Reading:** ~2–5 seconds using AI\n• **Checking:** Immediate after reading\n\nMost invoices are fully processed in under 10 seconds.",
  },
  {
    patterns: ["is it secure", "security", "safe", "data privacy", "privacy", "confidential"],
    response:
      "🔒 **Your Data is Safe:**\n\nYour invoice is stored securely and is not shared with anyone outside this system. Each file is saved with a unique reference to keep it organised.\n\nIf you have any concerns about how your data is handled, please contact your system administrator.",
  },
  {
    patterns: ["error", "failed", "not working", "issue", "problem", "broken"],
    response:
      "🔧 **Having trouble? Try these steps:**\n\n• Make sure the file is a valid **PDF** (not a scanned image saved as PDF)\n• Keep the file size reasonable (under 10MB is ideal)\n• Check your internet connection and try again\n• Click **Try Again** if the upload didn't go through\n\nIf the problem continues, please contact support.",
  },
  {
    patterns: ["confidence", "confidence score", "accuracy", "how accurate"],
    response:
      "📊 **Reliability Scores:**\n\nEvery piece of information gets a reliability score from 0–100:\n\n• **90–100:** Very clear — high confidence\n• **70–89:** Clear — minor uncertainty\n• **50–69:** Worth a second look\n• **Below 50:** Unclear — the text may be hard to read or partially visible\n\nThe overall score is the average across all detected fields.",
  },
  {
    patterns: ["supported formats", "file types", "formats", "what file"],
    response:
      "📁 Currently I support **PDF files only**.\n\nFor best results:\n• Use a PDF that was saved from a word processor (not a scanned photo)\n• Make sure the PDF is not password-protected\n• Standard invoice layouts work best\n\nSupport for images and scanned documents is planned for future updates.",
  },
  {
    patterns: ["thank", "thanks", "thank you", "awesome", "great", "nice", "cool", "perfect", "excellent"],
    response:
      "😊 You're welcome! Happy to help.\n\nFeel free to upload an invoice anytime and I'll check it for you. Is there anything else you'd like to know?",
  },
  {
    patterns: ["bye", "goodbye", "see you", "exit", "quit"],
    response: "👋 Goodbye! Come back anytime you need help with your invoices. Have a great day!",
  },
];

// ── Bot response logic ───────────────────────────────────────────────────────
function getBotResponse(userMessage, uploadStatus, uploadResult) {
  const msg = userMessage.toLowerCase().trim();

  // Context-aware responses after a successful upload
  if (uploadStatus === STATUS.SUCCESS && uploadResult) {
    if (
      msg.includes("result") ||
      msg.includes("show")   ||
      msg.includes("what did you find") ||
      msg.includes("output") ||
      msg.includes("extracted")
    ) {
      return (
        `✅ **Invoice Received!** Here's a summary:\n\n` +
        `• **Reference ID:** ${uploadResult.file_id}\n` +
        `• **File Name:** ${uploadResult.saved_as}\n` +
        `• **Size:** ${formatBytes(uploadResult.size_bytes)}\n` +
        `• **Received at:** ${new Date(uploadResult.uploaded_at).toLocaleString()}\n\n` +
        `Your invoice is ready for analysis.`
      );
    }
    if (msg.includes("valid") || msg.includes("ok") || msg.includes("good")) {
      return (
        `✅ Your invoice **${uploadResult.original_name}** was successfully received.\n\n` +
        `It has been saved with reference ID **${uploadResult.file_id}** and is ready for the next step.`
      );
    }
  }

  // Context-aware responses after a failed upload
  if (uploadStatus === STATUS.ERROR) {
    if (
      msg.includes("why")    ||
      msg.includes("error")  ||
      msg.includes("failed") ||
      msg.includes("problem")
    ) {
      return (
        "❌ The upload didn't go through. This could be because:\n\n" +
        "• Your internet connection was interrupted\n" +
        "• The file is too large\n" +
        "• There was a temporary issue with the service\n\n" +
        "Please check your connection and click **Try Again**."
      );
    }
  }

  // Check FAQ patterns
  for (const faq of FAQ) {
    for (const pattern of faq.patterns) {
      if (msg.includes(pattern)) return faq.response;
    }
  }

  // Default fallback
  return (
    "🤔 I'm not sure I understood that. Here are some things I can help with:\n\n" +
    "• **Upload an invoice** — drag & drop a PDF to get started\n" +
    "• **Learn about invoice checking** — ask \"what is invoice validation?\"\n" +
    "• **See what I can read** — ask \"what information can you extract?\"\n" +
    "• **Get help** — ask \"why did my upload fail?\"\n\n" +
    "Or just say **hi** to get started! 😊"
  );
}

// ── Markdown renderer (bold + bullets + line breaks) ────────────────────────
function RenderMessage({ text }) {
  return (
    <div>
      {text.split("\n").map((line, i) => {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        const rendered = parts.map((part, j) =>
          j % 2 === 1 ? <strong key={j}>{part}</strong> : part
        );
        return (
          <p key={i} className={line.trimStart().startsWith("•") ? "chat-bullet" : "chat-line"}>
            {rendered}
          </p>
        );
      })}
    </div>
  );
}

// ── Theme Toggle ─────────────────────────────────────────────────────────────
function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label="Toggle theme"
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb">{theme === "dark" ? "🌙" : "☀️"}</span>
      </span>
      <span className="theme-toggle-label">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

// ── Quick Suggestions ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What can you do?",
  "What details can you read?",
  "How do I upload?",
  "Is my data secure?",
];

// ── Result Row ────────────────────────────────────────────────────────────────
function ResultRow({ label, value }) {
  return (
    <div className="result-row">
      <span className="result-label">{label}</span>
      <span className="result-value">{value}</span>
    </div>
  );
}

// ── Utility helpers ───────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [pdfFile,   setPdfFile]   = useState(null);
  const [pdfUrl,    setPdfUrl]    = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [uploadStatus,   setUploadStatus]   = useState(STATUS.IDLE);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult,   setUploadResult]   = useState(null);
  const [uploadError,    setUploadError]    = useState(null);

  const [rightTab, setRightTab] = useState("chat");
  const [theme,    setTheme]    = useState("dark");

  const [messages,    setMessages]    = useState([
    {
      id:   1,
      role: "bot",
      text: "👋 Hi! I'm your **Invoice Validation Assistant**.\n\nUpload an invoice PDF and I'll read and check all its details — or ask me anything about the process!",
      time: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping,   setIsTyping]   = useState(false);

  const fileInputRef    = useRef(null);
  const chatEndRef      = useRef(null);
  const chatMessagesRef = useRef(null);
  const inputRef        = useRef(null);
  const userScrolledUp  = useRef(false);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Smart auto-scroll: only fires if user is already near the bottom
  useEffect(() => {
    if (!userScrolledUp.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  // Track whether user has scrolled up — pauses auto-scroll, resumes at bottom
  const handleChatScroll = () => {
    const el = chatMessagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 60;
  };

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // ── File handling ────────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file || file.type !== "application/pdf") return;
    setPdfFile(file);
    setPdfUrl(URL.createObjectURL(file));
    setUploadStatus(STATUS.IDLE);
    setUploadProgress(0);
    setUploadResult(null);
    setUploadError(null);
    addBotMessage(
      `📄 I can see you've selected **${file.name}** (${formatBytes(file.size)}).\n\nClick **"Analyse Invoice →"** whenever you're ready!`
    );
    setRightTab("chat");
  };

  const handleDrop       = (e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); };
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
    addBotMessage("🗑️ Invoice removed. Feel free to upload a new one whenever you're ready!");
  };

  // ── Upload ───────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!pdfFile) return;
    setUploadStatus(STATUS.UPLOADING);
    setUploadProgress(0);
    setUploadError(null);
    addBotMessage(`⏳ Checking **${pdfFile.name}**… I'll let you know as soon as it's done!`);

    try {
      const result = await uploadInvoice(pdfFile, (pct) => setUploadProgress(pct));
      setUploadResult(result);
      setUploadStatus(STATUS.SUCCESS);
      setRightTab("chat");
      addBotMessage(
        `✅ **Invoice received successfully!**\n\n` +
        `• **Reference ID:** ${result.file_id}\n` +
        `• **File Name:** ${result.saved_as}\n` +
        `• **Size:** ${formatBytes(result.size_bytes)}\n` +
        `• **Received at:** ${new Date(result.uploaded_at).toLocaleString()}\n\n` +
        `Your invoice is ready. You can ask me about the results or upload another one!`
      );
    } catch (err) {
      setUploadError(err.message);
      setUploadStatus(STATUS.ERROR);
      addBotMessage(
        `❌ **Something went wrong:** ${err.message}\n\nPlease check your connection and try again. Click **Try Again** or ask me for help.`
      );
    }
  };

  // ── Chat helpers ─────────────────────────────────────────────────────────
  const addBotMessage = (text) => {
    setMessages((prev) => [...prev, { id: Date.now(), role: "bot", text, time: new Date() }]);
  };

  const sendMessage = (text) => {
    const trimmed = (text || inputValue).trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text: trimmed, time: new Date() }]);
    setInputValue("");
    setIsTyping(true);

    setTimeout(() => {
      const reply = getBotResponse(trimmed, uploadStatus, uploadResult);
      setIsTyping(false);
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "bot", text: reply, time: new Date() }]);
    }, 600 + Math.random() * 400);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Primary action button label ──────────────────────────────────────────
  const primaryBtnLabel = () => {
    if (!pdfFile)                              return "Get Started →";
    if (uploadStatus === STATUS.IDLE)          return "Analyse Invoice →";
    if (uploadStatus === STATUS.UPLOADING)     return `Checking… ${uploadProgress}%`;
    if (uploadStatus === STATUS.SUCCESS)       return "Check Another →";
    if (uploadStatus === STATUS.ERROR)         return "Try Again →";
  };

  // ── Right panel body ─────────────────────────────────────────────────────
  const renderRightBody = () => {
    // Chat tab
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
                <button key={s} className="suggestion-chip" onClick={() => sendMessage(s)}>
                  {s}
                </button>
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
            />
            <button
              className="chat-send-btn"
              onClick={() => sendMessage()}
              disabled={!inputValue.trim()}
              title="Send"
            >
              ➤
            </button>
          </div>
        </div>
      );
    }

    // Preview tab
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

    // Info / status tab
    if (rightTab === "info") {
      if (uploadStatus === STATUS.IDLE) {
        return (
          <div className="placeholder-content">
            <div className="placeholder-icon">📤</div>
            <p className="placeholder-label">Ready to go</p>
            <p className="placeholder-sub">Click "Analyse Invoice" to check your document</p>
          </div>
        );
      }
      if (uploadStatus === STATUS.UPLOADING) {
        return (
          <div className="placeholder-content">
            <div className="pulse-ring" />
            <p className="placeholder-label uploading">Checking your invoice… {uploadProgress}%</p>
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
            <p className="placeholder-label success-text">Invoice Received</p>
            <div className="result-card">
              <ResultRow label="Reference ID" value={uploadResult.file_id} />
              <ResultRow label="File Name"    value={uploadResult.saved_as} />
              <ResultRow label="Size"         value={formatBytes(uploadResult.size_bytes)} />
              <ResultRow label="Received at"  value={formatDate(uploadResult.uploaded_at)} />
            </div>
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
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-logo">
          <img src={wnsLogo} alt="WNS" className="wns-logo" />
          <span className="nav-logo-divider" />
        </div>
        <div className="nav-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">invoice<span className="brand-accent">Agent</span></span>
        </div>
        <div className="nav-search">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search invoices…" />
          <kbd>Ctrl K</kbd>
        </div>
        <div className="nav-actions">
          <button className="nav-btn" title="GitHub">⬡</button>
          <button className="nav-btn" title="Settings">⚙</button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </nav>

      {/* Main layout */}
      <main className="main">
        {/* Left Panel */}
        <section className="left-panel">
          <div className="hero-text">
            <h1>Extract from<br /><span className="highlight">Invoices</span></h1>
            <p className="hero-sub">
              AI-powered assistant that reads, checks, and verifies your
              invoice details — instantly and accurately.
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
            <button
              className="btn-primary"
              onClick={pdfFile ? handleUpload : () => fileInputRef.current?.click()}
              disabled={uploadStatus === STATUS.UPLOADING}
            >
              {primaryBtnLabel()}
            </button>
          </div>
        </section>

        {/* Right Panel */}
        <section className="right-panel">
          <div className="right-box">
            <div className="right-box-header">
              <span className="right-box-dot red" />
              <span className="right-box-dot yellow" />
              <span className="right-box-dot green" />

              <div className="right-tabs">
                <button
                  className={`right-tab ${rightTab === "chat" ? "active" : ""}`}
                  onClick={() => setRightTab("chat")}
                >
                  💬 Chat
                </button>
              </div>
            </div>

            <div className={`right-box-body ${rightTab === "preview" && pdfFile ? "no-pad" : rightTab === "chat" ? "no-pad" : ""}`}>
              {renderRightBody()}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
