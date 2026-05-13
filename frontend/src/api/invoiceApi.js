// src/api/invoiceApi.js

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Upload PDF invoice
 */
export async function uploadInvoice(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await axios.post(
      `${BASE_URL}/api/invoices/upload`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },

        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );

            onProgress(percent);
          }
        },
      }
    );

    return response.data;

  } catch (error) {
    throw new Error(
      error.response?.data?.detail || "Upload failed."
    );
  }
}

/**
 * Fetch uploaded invoices
 */
export async function fetchInvoices() {
  try {
    const response = await axios.get(
      `${BASE_URL}/api/invoices`
    );

    return response.data.invoices;

  } catch (error) {
    throw new Error("Failed to fetch invoices.");
  }
}