## Shogi Instructor (Beta)

**This is a beta version and may have many bugs.**

Shogi Instructor is a local “coach overlay” for lishogi: it captures the current game state from your browser, syncs SFEN into a local Vue app, runs engine analysis, and asks an LLM to coach you based on whose move it is.

## How it works (high level)

- **Browser**: you paste `scripts/bridge.js` into the lishogi DevTools Console. It hooks lishogi’s XHR and extracts `steps` plus `player.color`.
- **Backend** (`FastAPI`): receives chunked payloads at `GET /api/chunk`, stores the latest state, and serves it at `GET /api/state` on `http://127.0.0.1:3080`.
- **Frontend** (`Vue + Vite`): polls `/api/state`, extracts SFEN + `player.color`, updates the board, runs engine analysis, and prompts the LLM with:
  - player is **sente/gote**
  - who **just moved**
  - who is **to move** now

## Prerequisites

- **Windows 10/11**
- **Node.js**: `^20.19.0 || >=22.12.0`
- **Python**: 3.10+ recommended

## Quick start (recommended)

1. Double-click `launcher.bat`.
2. It will:
   - start the frontend (`frontend/`, `npm run dev`)
   - start the backend (`backend/`, `python -m src.main`)
   - copy `scripts/bridge.js` to your clipboard
3. Open a lishogi game in your browser, then:
   - open DevTools → **Console**
   - paste and run the clipboard script
4. In the Vue app, turn on **Sync lishogi**.

## Manual setup

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m src.main
```

The backend listens on **`http://127.0.0.1:3080`**.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Then open the printed Vite URL (typically `http://localhost:5173`).

## Using the bridge script

- Source: `scripts/bridge.js`
- Paste it into the lishogi DevTools Console.
- It continuously sends the latest data to your local backend.

## Notes / troubleshooting

- **Nothing updates**: ensure the backend is running and `http://127.0.0.1:3080/api/health` returns `{"status":"ok" ...}`.
- **Sync errors**: the frontend expects `/api/state` to contain recent data; refresh lishogi and re-run the bridge script.
- **LLM settings**: configure your Gemini settings in the app UI (API key, base URL, model).

