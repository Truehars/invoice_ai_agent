# Invoice Agent 📋

An LLM-powered invoice validation system with a FastAPI backend and React frontend. Upload PDFs, extract data, validate with multi-agent orchestration, and chat with an intelligent agent.

---

## 📋 Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Troubleshooting](#troubleshooting)

---

## ✨ Features

- **PDF Upload & Extraction** - Upload invoices as PDF files
- **Text Extraction** - Automatically extract text from PDFs
- **Multi-Agent Pipeline** - 3-agent orchestration for invoice validation
- **LLM Chat** - Interactive chat with context from extracted data
- **Confidence Scoring** - Field-level confidence scores for extracted data
- **Chart Visualization** - Generate confidence bar charts
- **CORS Enabled** - Ready for frontend integration

---

## 🗂️ Project Structure

```
AI_AGENT/
├── backend/                      # FastAPI backend
│   ├── main.py                  # FastAPI app & routes
│   ├── config.py                # Configuration & settings
│   ├── orchestrator.py          # Multi-agent pipeline
│   ├── requirements.txt          # Python dependencies
│   ├── services/
│   │   ├── file_service.py      # PDF handling
│   │   └── chat_agent.py        # Chat functionality
│   └── storage/                 # Invoice storage directory
│
├── frontend/                    # React + Vite frontend
│   ├── package.json            # Node dependencies
│   ├── vite.config.js          # Vite configuration
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── public/
│
├── myenv/                       # Python virtual environment
└── README.md                    # This file
```

---

## 🔧 Prerequisites

### System Requirements
- **Python**: 3.11 or higher
- **Node.js**: 18+ with npm
- **pip**: Python package manager
- **Git**: Version control

### Required API Keys
- **Azure OpenAI**: API key and endpoint for GPT-4o-mini model
  - Get key from: https://portal.azure.com/

---

## 🚀 Quick Start

### 1️⃣ Clone & Navigate
```bash
cd /c/Users/u525591/Desktop/AI_AGENT
```

### 2️⃣ Backend Setup (5 minutes)
```bash
# Create virtual environment
python -m venv myenv

# Activate virtual environment
# On Windows:
myenv\Scripts\activate
# On macOS/Linux:
source myenv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Create .env file in backend/
# (See Environment Variables section below)
```

### 3️⃣ Frontend Setup (3 minutes)
```bash
cd frontend

# Install dependencies
npm install

# Optional: Build for production
npm run build
```

### 4️⃣ Run the Application
```bash
# Terminal 1: Start Backend (from AI_AGENT root)
cd backend
python main.py
# Backend runs at http://localhost:8000

# Terminal 2: Start Frontend (from AI_AGENT/frontend)
npm run dev
# Frontend runs at http://localhost:5173
```

---

## 🔐 Backend Setup

### Create Virtual Environment
```bash
# Windows
python -m venv myenv
myenv\Scripts\activate

# macOS/Linux
python3 -m venv myenv
source myenv/bin/activate
```

### Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Create `.env` File
Create a `.env` file in the `backend/` directory:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_api_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-02-01

# Upload Directory (optional)
UPLOAD_DIR=storage/invoices

# CORS Origins (for development)
ALLOWED_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"]
```

### Start Backend Server
```bash
python main.py
```

Server will start at **http://localhost:8000**

API documentation available at **http://localhost:8000/docs** (Swagger UI)

---

## 🎨 Frontend Setup

### Install Dependencies
```bash
cd frontend
npm install
```

### Development Mode
```bash
npm run dev
```
Frontend will run at **http://localhost:5173**

### Build for Production
```bash
npm run build
```
Output: `frontend/dist/` directory

### Preview Production Build
```bash
npm run preview
```

---

## 🔑 Environment Variables

### Backend (`.env` file in `backend/` directory)

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | `sk-...` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL | `https://my-resource.openai.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name | `gpt-4o-mini` |
| `AZURE_OPENAI_API_VERSION` | API version | `2024-02-01` |
| `UPLOAD_DIR` | Directory for storing invoices | `storage/invoices` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `["http://localhost:5173"]` |

### How to Get Azure OpenAI Credentials
1. Visit [Azure Portal](https://portal.azure.com/)
2. Create or select an OpenAI resource
3. Go to "Keys and Endpoint" section
4. Copy the endpoint URL and one of the API keys
5. Add to your `.env` file

---

## ▶️ Running the Application

### Full Setup (First Time)
```bash
# 1. Backend
cd backend
python -m venv myenv
myenv\Scripts\activate  # On Windows
source myenv/bin/activate  # On macOS/Linux
pip install -r requirements.txt
# Create .env file with Azure credentials
python main.py

# 2. Frontend (in new terminal)
cd frontend
npm install
npm run dev
```

### Quick Start (After Initial Setup)
```bash
# Terminal 1: Backend
cd backend
myenv\Scripts\activate  # Or source myenv/bin/activate on Mac/Linux
python main.py

# Terminal 2: Frontend
cd frontend
npm run dev
```

### Access the Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

---

## 📡 API Endpoints

### Health Check
```
GET /
```
Returns: `{"status": "ok", "version": "2.0.0"}`

### Upload Invoice
```
POST /api/invoices/upload
```
Body: PDF file
Returns: File metadata and storage path

### Analyse Invoice
```
POST /api/invoices/analyse
Body: {"file_path": "path/to/invoice.pdf"}
```
Returns: Complete analysis report from all 3 agents

### List Invoices
```
GET /api/invoices
```
Returns: List of all stored invoices

### Chat with Agent
```
POST /api/chat
Body: {
  "message": "your message",
  "history": [...],
  "pipeline_result": {...}
}
```
Returns: `{"reply": "agent response"}`

### Generate Chart
```
POST /api/invoices/chart
Body: {"pipeline_result": {...}}
```
Returns: PNG image of confidence chart

---

## 🐛 Troubleshooting

### Backend Issues

#### ModuleNotFoundError: No module named 'fastapi'
```bash
# Ensure virtual environment is activated
pip install -r requirements.txt
```

#### Azure OpenAI Authentication Error
- Verify `.env` file exists in `backend/` directory
- Check API key and endpoint are correct
- Ensure Azure OpenAI resource is active

#### "Only PDF files are accepted"
- Ensure you're uploading a `.pdf` file
- Content-Type header must be `application/pdf`

#### PDF Text Extraction Failed
- The PDF must be text-based (not scanned image)
- Try opening the PDF in a text editor to confirm
- Scanned invoices need OCR preprocessing

### Frontend Issues

#### Port 5173 already in use
```bash
# Kill process on port 5173 or use different port
npm run dev -- --port 3000
```

#### CORS Error (401, 403)
- Ensure backend is running on port 8000
- Verify `ALLOWED_ORIGINS` in `.env` includes `http://localhost:5173`
- Restart backend after changing `.env`

#### Blank page or "Cannot GET /"
- Ensure frontend was built: `npm run build` or running dev server
- Check console for JavaScript errors

#### Node modules issues
```bash
# Fresh install
rm -rf node_modules package-lock.json
npm install
```

### General Tips

- **Always activate virtual environment** before running backend
- **Check port availability** (8000 for backend, 5173 for frontend)
- **Create `.env` before starting backend** (will crash without it)
- **Keep terminals open** while running - don't close either terminal
- **Clear browser cache** if frontend changes don't appear

---

## 📝 Development Notes

### Adding New Dependencies

**Backend:**
```bash
pip install package-name
pip freeze > requirements.txt
```

**Frontend:**
```bash
npm install package-name
```

### Running Tests
```bash
# Backend (if tests exist)
pytest

# Frontend (if tests exist)
npm test
```

### Code Quality
```bash
# Frontend linting
npm run lint

# Format code (frontend)
npm run format  # if available
```

---

## 🤝 Support

For issues or questions:
1. Check the Troubleshooting section above
2. Verify all prerequisites are installed
3. Ensure `.env` file is properly configured
4. Check API documentation at http://localhost:8000/docs

---

## 📄 License

This project is part of the AI_AGENT suite.

---

**Last Updated**: May 22, 2026
