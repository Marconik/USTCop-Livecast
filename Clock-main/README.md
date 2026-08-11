# Retro LCD Clock

A real-time 24-hour digital clock with a retro LCD aesthetic, built with React, TypeScript, and Tailwind CSS.

## How to Run Locally

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- npm (usually comes with Node.js)

### Installation

1.  **Clone or Download** the project files to your local machine.
2.  Open a terminal/command prompt in the project folder.
3.  **Install dependencies**:
    ```bash
    npm install
    ```

### Development

To start the local development server:

```bash
npm run dev
```

Then open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`).

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
