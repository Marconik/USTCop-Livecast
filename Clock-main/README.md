# Retro LCD Clock

A real-time 24-hour digital clock with a retro LCD aesthetic, built with React, TypeScript, and Tailwind CSS.

## How to Run Locally

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- npm (usually comes with Node.js)
- Python 3.11 or higher, with the repository root `.venv` prepared from `requirements.txt`

### Installation

1.  **Clone or Download** the project files to your local machine.
2.  Open a terminal/command prompt in the project folder.
3.  **Install frontend dependencies**:
    ```bash
    npm ci
    ```
4.  Copy `.env.example` to `.env` and adjust `PYTHON_PATH` or OBS settings if needed.

### Development

To start the local development server:

```bash
npm run dev
```

Then open your browser and navigate to the URL shown in the terminal (usually `http://localhost:3000`).

The schedule and score APIs are implemented as Vite dev-server middleware, so the live control app should be run with `npm run dev` during the event. A production build only emits static assets and does not include those local APIs.

### OBS Control

The control page talks to OBS through obs-websocket. In OBS, open **Tools -> WebSocket Server Settings**, enable the server, then mirror the port and password in `.env`:

```bash
OBS_WS_URL="ws://127.0.0.1:4455"
OBS_WS_PASSWORD=""
```

When connected, the app can switch OBS scenes, toggle scene item visibility, and change the current transition.

The Python bridge uses `PYTHON_PATH` from `.env` first. If it is not set, it tries `../.venv/Scripts/python.exe`, then `.venv/Scripts/python.exe`, then falls back to `python` on PATH.

Generated score images overwrite `../Broadcast/score1.png` and `../Broadcast/score2.png`. On Windows, the generator resets each output file ACL after replacement so the files inherit permissions from the `Broadcast` directory and remain readable by the current user and OBS.

### Production Build

To build the app for production:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Project Structure

- `src/App.tsx`: Main application component containing the clock logic.
- `src/components/SevenSegment.tsx`: Custom 7-segment display components.
- `src/index.css`: Global styles and Tailwind configuration.
