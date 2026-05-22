import { useState, useRef, useEffect } from "react";
import "./App.css";
import { uploadInvoice } from "./api/invoiceApi";
import wnsLogo from "./assets/wns.png";

const STATUS = {
  IDLE: "idle",
  UPLOADING: "uploading",
  SUCCESS: "success",
  ERROR: "error",
};

// ── Predefined Q&A ─────────────────────────────────────────────────────────
const FAQ = [
  {
    patterns: ["hi", "hello", "hey", "hii", "helo", "greetings", "good morning", "good afternoon", "good evening"],
    response: "👋 Hi there! I'm your **Invoice Validation Agent**. I'm here to help you verify and extract information from invoice PDFs.\n\nJust upload your invoice PDF here and I'll give you a full analysis — checking whether it's valid, extracting key fields, and flagging any issues. How can I assist you today?",
  },
  {
    patterns: ["what can you do", "what do you do", "your capabilities", "help", "how does this work", "how does it work"],
    response: "🤖 Here's what I can do for you:\n\n• **Extract** invoice fields (invoice number, date, vendor, amounts, GST, PAN, etc.)\n• **Validate** the invoice structure and completeness\n• **Flag** missing or suspicious fields\n• **Summarize** line items and totals\n• **Check** document type (invoice, bank statement, etc.)\n\nSimply upload a PDF and I'll get to work instantly!",
  },
  {
    patterns: ["what is invoice validation", "what is validation", "invoice validation"],
    response: "📋 **Invoice Validation** is the process of:\n\n1. Confirming the document is a genuine invoice\n2. Checking all required fields are present (invoice number, date, vendor, totals)\n3. Verifying amounts are consistent (subtotal + tax = total)\n4. Flagging missing mandatory fields like GST/PAN numbers\n5. Assigning confidence scores to each extracted field\n\nUpload your PDF and I'll validate it right away!",
  },
  {
    patterns: ["what fields", "which fields", "what information", "what data", "what does it extract"],
    response: "🔍 I can extract the following fields from your invoice:\n\n**Identification:** Invoice number, date, due date\n**Parties:** Vendor name, customer name\n**Addresses:** Billing address, shipping address\n**Contact:** Phone number, email\n**Tax IDs:** GST number, PAN number\n**Banking:** Loan account number, bank name, IFSC code\n**Financials:** Currency, subtotal, tax amount, total amount\n**Line Items:** Description, quantity, unit price, amount\n\nReady to upload your invoice?",
  },
  {
    patterns: ["pdf", "upload pdf", "how to upload", "how do i upload", "upload invoice"],
    response: "📤 Uploading is easy!\n\n1. **Drag & drop** your invoice PDF onto the upload zone on the left, OR\n2. **Click** the upload zone to browse your files\n3. Once selected, click **\"Send to Backend\"** to process it\n\nI only accept PDF files. Make sure your invoice is in PDF format before uploading.",
  },
  {
    patterns: ["gst", "gst number", "gst validation", "gstin"],
    response: "🏛️ **GST Validation:** I extract the GSTIN (Goods and Services Tax Identification Number) from your invoice.\n\nA valid GSTIN is 15 characters long in the format: **22AAAAA0000A1Z5**\n\nIf the GST number is present on your invoice, I'll extract it with a confidence score. If it's missing or malformed, I'll flag it in the validation report.",
  },
  {
    patterns: ["how long", "how much time", "processing time", "how fast", "speed"],
    response: "⚡ Processing is near-instant!\n\n• **Upload:** A few seconds depending on file size\n• **Extraction:** ~2–5 seconds using AI\n• **Validation:** Immediate after extraction\n\nMost invoices are fully processed in under 10 seconds.",
  },
  {
    patterns: ["is it secure", "security", "safe", "data privacy", "privacy", "confidential"],
    response: "🔒 **Data Security:**\n\nYour invoice PDF is stored locally on the backend server in a secure directory. Files are not shared with third parties. Each file is saved with a unique ID to prevent conflicts.\n\nFor production deployments, we recommend encrypting the storage directory and adding authentication to the API endpoints.",
  },
  {
    patterns: ["error", "failed", "not working", "issue", "problem", "broken"],
    response: "🔧 **Troubleshooting Tips:**\n\n• Ensure the file is a valid **PDF** (not scanned image-only)\n• File size should be reasonable (under 10MB recommended)\n• Check that the backend server is running on port 8000\n• Try clicking **Retry** if the upload fails\n\nIf the issue persists, check the browser console and backend logs for details.",
  },
  {
    patterns: ["confidence", "confidence score", "accuracy", "how accurate"],
    response: "📊 **Confidence Scores:**\n\nEvery extracted field gets a confidence score from 0–100:\n\n• **90–100:** Very high confidence, clear text\n• **70–89:** Good confidence, minor ambiguity\n• **50–69:** Moderate — worth reviewing\n• **Below 50:** Low confidence, field may be unclear or partially visible\n\nThe overall confidence is the average across all extracted fields.",
  },
  {
    patterns: ["supported formats", "file types", "formats", "what file"],
    response: "📁 Currently I support **PDF files only**.\n\nFor best results:\n• Use text-based PDFs (not scanned images)\n• Ensure the PDF is not password-protected\n• Standard invoice formats work best (A4/Letter size)\n\nSupport for images (PNG, JPG) and scanned PDFs via OCR is planned for future updates.",
  },
  {
    patterns: ["thank", "thanks", "thank you", "awesome", "great", "nice", "cool", "perfect", "excellent"],
    response: "😊 You're welcome! I'm happy to help.\n\nFeel free to upload an invoice anytime and I'll validate it for you. Is there anything else you'd like to know?",
  },
  {
    patterns: ["bye", "goodbye", "see you", "exit", "quit"],
    response: "👋 Goodbye! Come back anytime you need invoice validation. Have a great day!",
  },
];

function getBotResponse(userMessage, uploadStatus, uploadResult) {
  const msg = userMessage.toLowerCase().trim();

  // Context-aware responses after upload
  if (uploadStatus === STATUS.SUCCESS && uploadResult) {
    if (msg.includes("result") || msg.includes("show") || msg.includes("what did you find") || msg.includes("output") || msg.includes("extracted")) {
      return `✅ **Upload Complete!** Here's what was saved:\n\n• **File ID:** ${uploadResult.file_id}\n• **Saved as:** ${uploadResult.saved_as}\n• **Size:** ${formatBytes(uploadResult.size_bytes)}\n• **Uploaded at:** ${new Date(uploadResult.uploaded_at).toLocaleString()}\n\nThe invoice is now stored and ready for AI extraction.`;
    }
    if (msg.includes("valid") || msg.includes("ok") || msg.includes("good")) {
      return `✅ Your invoice **${uploadResult.original_name}** was successfully received by the backend.\n\nThe file has been saved with ID **${uploadResult.file_id}**. The AI extraction agent will process it to validate all fields and flag any issues.`;
    }
  }

  if (uploadStatus === STATUS.ERROR) {
    if (msg.includes("why") || msg.includes("error") || msg.includes("failed") || msg.includes("problem")) {
      return "❌ The upload failed. This could be due to:\n\n• The backend server isn't running\n• The file exceeds size limits\n• Network connectivity issues\n\nTry clicking **Retry Upload** or check that the FastAPI server is running on port 8000.";
    }
  }

  // Check FAQ patterns
  for (const faq of FAQ) {
    for (const pattern of faq.patterns) {
      if (msg.includes(pattern)) {
        return faq.response;
      }
    }
  }

  // Default fallback
  return "🤔 I'm not sure I understood that. Here are some things I can help with:\n\n• **Upload an invoice** — drag & drop a PDF to get started\n• **Learn about validation** — ask \"what is invoice validation?\"\n• **Understand fields** — ask \"what fields can you extract?\"\n• **Troubleshoot issues** — ask \"why did my upload fail?\"\n\nOr just say **hi** to get started! 😊";
}

// ── Markdown-style renderer (bold, bullets, line breaks) ───────────────────
function RenderMessage({ text }) {
  const lines = text.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        // Bold: **text**
        const parts = line.split(/\*\*(.*?)\*\*/g);
        const rendered = parts.map((part, j) =>
          j % 2 === 1 ? <strong key={j}>{part}</strong> : part
        );
        const isBullet = line.trimStart().startsWith("•");
        return (
          <p key={i} className={isBullet ? "chat-bullet" : "chat-line"}>
            {rendered}
          </p>
        );
      })}
    </div>
  );
}

// ── Theme Toggle ──────────────────────────────────────────────────────────
function ThemeToggle({ theme, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-label="Toggle theme">
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb">{theme === "dark" ? "🌙" : "☀️"}</span>
      </span>
      <span className="theme-toggle-label">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

// ── Quick Suggestions ──────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What can you do?",
  "What fields can you extract?",
  "How do I upload?",
  "Is my data secure?",
];

export default function App() {
  const [pdfFile, setPdfFile]       = useState(null);
  const [pdfUrl, setPdfUrl]         = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [uploadStatus, setUploadStatus]     = useState(STATUS.IDLE);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult]     = useState(null);
  const [uploadError, setUploadError]       = useState(null);

  const [rightTab, setRightTab] = useState("chat");
  const [theme, setTheme]       = useState("dark");

  // Chat state
  const [messages, setMessages]     = useState([
    {
      id: 1,
      role: "bot",
      text: "👋 Hi! I'm your **Invoice Validation Agent**.\n\nUpload an invoice PDF and I'll extract and validate all its fields — or ask me anything about the process!",
      time: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping]     = useState(false);

  const fileInputRef  = useRef(null);
  const chatEndRef    = useRef(null);
  const inputRef      = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file || file.type !== "application/pdf") return;
    setPdfFile(file);
    setPdfUrl(URL.createObjectURL(file));
    setUploadStatus(STATUS.IDLE);
    setUploadProgress(0);
    setUploadResult(null);
    setUploadError(null);
    // Bot notifies about new file
    addBotMessage(`📄 I can see you've selected **${file.name}** (${formatBytes(file.size)}).\n\nClick **"Send to Backend →"** to upload and process it!`);
    setRightTab("chat");
  };

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
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    addBotMessage("🗑️ Invoice removed. Feel free to upload a new PDF whenever you're ready!");
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!pdfFile) return;
    setUploadStatus(STATUS.UPLOADING);
    setUploadProgress(0);
    setUploadError(null);
    addBotMessage(`⏳ Uploading **${pdfFile.name}**... I'll let you know as soon as it's done!`);

    try {
      const result = await uploadInvoice(pdfFile, (pct) => setUploadProgress(pct));
      setUploadResult(result);
      setUploadStatus(STATUS.SUCCESS);
      setRightTab("chat");
      addBotMessage(`✅ **Invoice uploaded successfully!**\n\n• **File ID:** ${result.file_id}\n• **Saved as:** ${result.saved_as}\n• **Size:** ${formatBytes(result.size_bytes)}\n• **Uploaded at:** ${new Date(result.uploaded_at).toLocaleString()}\n\nThe invoice is now stored in the backend. You can ask me about it or upload another one!`);
    } catch (err) {
      setUploadError(err.message);
      setUploadStatus(STATUS.ERROR);
      addBotMessage(`❌ **Upload failed:** ${err.message}\n\nPlease check your connection and try again. Click **Retry** or ask me for troubleshooting tips.`);
    }
  };

  // ── Chat helpers ───────────────────────────────────────────────────────────
  const addBotMessage = (text) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "bot", text, time: new Date() },
    ]);
  };

  const sendMessage = (text) => {
    const trimmed = (text || inputValue).trim();
    if (!trimmed) return;

    const userMsg = { id: Date.now(), role: "user", text: trimmed, time: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    setTimeout(() => {
      const botReply = getBotResponse(trimmed, uploadStatus, uploadResult);
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "bot", text: botReply, time: new Date() },
      ]);
    }, 600 + Math.random() * 400);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Right panel body ───────────────────────────────────────────────────────
  const renderRightBody = () => {
    if (rightTab === "chat") {
      return (
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble-wrap ${msg.role}`}>
                {msg.role === "bot" && (
                  <div className="chat-avatar">🤖</div>
                )}
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

          {/* Quick suggestions */}
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

    if (rightTab === "info") {
      if (uploadStatus === STATUS.IDLE) {
        return (
          <div className="placeholder-content">
            <div className="placeholder-icon">📤</div>
            <p className="placeholder-label">Ready to upload</p>
            <p className="placeholder-sub">Click "Send to Backend" to process the invoice</p>
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

  // ── Render ─────────────────────────────────────────────────────────────────
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

      {/* Main */}
      <main className="main">
        {/* Left Panel */}
        <section className="left-panel">
          <div className="hero-text">
            <h1>Extract from<br /><span className="highlight">Invoices</span></h1>
            <p className="hero-sub">
              AI-powered validation agent that reads, parses, and verifies your
              invoice data — instantly and accurately.
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
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleInputChange} hidden />
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
              {!pdfFile                                     && "Get Started →"}
              {pdfFile && uploadStatus === STATUS.IDLE      && "Send to Backend →"}
              {pdfFile && uploadStatus === STATUS.UPLOADING && `Uploading ${uploadProgress}%…`}
              {pdfFile && uploadStatus === STATUS.SUCCESS   && "Upload Another →"}
              {pdfFile && uploadStatus === STATUS.ERROR     && "Retry Upload →"}
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
                <button className={`right-tab ${rightTab === "chat" ? "active" : ""}`} onClick={() => setRightTab("chat")}>
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

function ResultRow({ label, value }) {
  return (
    <div className="result-row">
      <span className="result-label">{label}</span>
      <span className="result-value">{value}</span>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}