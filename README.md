# PicklePro — Pickleball Skill Development Platform

AI-powered pickleball training with stroke analysis, interactive AI rally, and match footage review.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend:** FastAPI (Python)
- **Database/Storage:** Supabase (PostgreSQL + file storage)
- **State Management:** Zustand

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- npm

### 1. Clone & Install Frontend

```bash
npm install
```

### 2. Environment Variables

Copy the example env file and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
BACKEND_URL=http://localhost:8000
```

`NEXT_PUBLIC_SUPABASE_*` is required for browser auth. `SUPABASE_*` is an optional
server-side alias that this repo also supports.

### 3. Run the Frontend

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

### 4. Set Up & Run the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at [http://localhost:8000](http://localhost:8000). API docs available at [http://localhost:8000/docs](http://localhost:8000/docs).

The Next.js app proxies `/api/*` requests to the FastAPI backend automatically.

### 5. Set Up the AI Rally CV Game

The AI Rally mode uses a standalone Python process (YOLOv8 + MediaPipe + Pygame) that streams to the browser over WebSocket.

```bash
cd backend/ai_rally
pip install -r requirements.txt
```

**Optional — Fine-tune YOLOv8n on a paddle dataset:**

```bash
export ROBOFLOW_API_KEY=your_key_here
python setup_model.py
```

Without fine-tuning, the base YOLOv8n model runs with a MediaPipe wrist fallback for paddle tracking.

**Launch the CV server manually:**

```bash
cd backend/ai_rally
python server.py
```

Or click **Launch & Connect** on the AI Rally page — the FastAPI backend will spawn it automatically.

The WebSocket server runs at `ws://localhost:8765`.

## Project Structure

```
/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout with navbar
│   ├── page.tsx                  # Landing page
│   ├── dashboard/page.tsx        # Main dashboard hub
│   ├── stroke-analysis/page.tsx  # Stroke analysis mode
│   ├── ai-rally/page.tsx         # AI rally (CV mode)
│   └── footage/page.tsx          # Footage upload & analysis
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── nav/                      # Navbar
│   └── PageTransition.tsx        # Framer Motion wrapper
├── store/
│   └── useAppStore.ts            # Zustand global state
├── lib/
│   ├── utils.ts                  # Utility functions (cn)
│   └── supabase.ts               # Supabase client
└── backend/
    ├── main.py                   # FastAPI entry point
    ├── routers/
    │   ├── stroke.py             # Stroke analysis endpoints
    │   ├── rally.py              # Rally endpoints + CV launch/stop
    │   └── footage.py            # Footage analysis endpoints
    ├── requirements.txt
    └── ai_rally/                 # CV game (standalone process)
        ├── server.py             # WebSocket server (ws://localhost:8765)
        ├── cv_engine.py          # YOLOv8n + MediaPipe pipeline
        ├── stroke_classifier.py  # Rule-based forehand/backhand detector
        ├── game_engine.py        # Pygame off-screen 2D court
        ├── setup_model.py        # Roboflow dataset + YOLO fine-tune
        └── requirements.txt
```

## Features

| Mode | Description |
|------|-------------|
| **Stroke Analysis** | Select stroke type, view camera placeholder, get AI coaching tips |
| **AI Rally** | Real-time CV game — webcam + YOLO paddle detection + MediaPipe pose → swing your paddle to return the ball on a 2D court |
| **Footage Review** | Drag-and-drop video upload, court heatmap, shot statistics, shot timeline |

## AI Rally — Architecture

```
┌─────────────┐     WebSocket (ws://localhost:8765)     ┌──────────────┐
│  Browser     │ ◄──── JPEG frames + JSON state ──────► │  server.py   │
│  (Next.js)   │                                        │              │
└─────────────┘                                        │  ┌──────────┐│
                                                        │  │cv_engine ││ ← YOLO thread + MediaPipe
                                                        │  │          ││
                                                        │  └──────────┘│
                                                        │  ┌──────────┐│
                                                        │  │game_eng. ││ ← Pygame off-screen court
                                                        │  └──────────┘│
                                                        │  ┌──────────┐│
                                                        │  │stroke_cl.││ ← 30-frame rolling buffer
                                                        │  └──────────┘│
                                                        └──────────────┘
```

- **Left panel (60%):** Live webcam with YOLO bounding box (green), sweet spot circle (yellow), MediaPipe skeleton, hitting arm highlighted (orange), stroke state label, velocity meter
- **Right panel (40%):** Top-down 2D court, player paddle (blue), AI paddle (red), ball (yellow), hit window indicator, score display
- **Stroke detection:** Forehand (wrist L→R, elbow 100–160°) / Backhand (wrist R→L, crosses torso) / confirmed after 8 consecutive frames
