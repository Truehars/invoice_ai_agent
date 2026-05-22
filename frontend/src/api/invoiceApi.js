// src/api/invoiceApi.js
// ─────────────────────────────────────────────────────────────────
// All HTTP calls to the FastAPI backend.
// Base URL is read from Vite env (VITE_API_URL) or defaults to localhost:8000.
// ─────────────────────────────────────────────────────────────────

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Upload PDF ───────────────────────────────────────────────────
/**
 * @param {File}     file        PDF file to upload
 * @param {Function} onProgress  (percent: number) => void — optional
 * @returns {Promise<{file_id, original_name, saved_as, size_bytes, uploaded_at, path}>}
 */
export async function uploadInvoice(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await axios.post(
    `${BASE_URL}/api/invoices/upload`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    }
  );
  return data;
}

// ── Run 3-agent pipeline ─────────────────────────────────────────
/**
 * @param {string} filePath  Absolute path returned by uploadInvoice
 * @returns {Promise<Object>}  Full pipeline report
 */
export async function analyseInvoice(filePath) {
  const { data } = await axios.post(`${BASE_URL}/api/invoices/analyse`, {
    file_path: filePath,
  });
  return data;
}

// ── List stored invoices ─────────────────────────────────────────
/**
 * @returns {Promise<Array<{filename, size_bytes, modified_at}>>}
 */
export async function fetchInvoices() {
  const { data } = await axios.get(`${BASE_URL}/api/invoices`);
  return data.invoices;
}

// ── Chat with LLM agent ──────────────────────────────────────────
/**
 * @param {string}      message        User message
 * @param {Array}       history        [{role, content}] conversation history
 * @param {Object|null} pipelineResult Full pipeline report (null before analysis)
 * @returns {Promise<string>}          Bot reply text
 */
export async function sendChatMessage(message, history = [], pipelineResult = null) {
  const { data } = await axios.post(`${BASE_URL}/api/chat`, {
    message,
    history,
    pipeline_result: pipelineResult,
  });
  return data.reply;
}
