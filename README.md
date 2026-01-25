# Pushup Tracker - Frontend

A modern, mobile-friendly web application for tracking pushup workouts. Built with **Vanilla JS**, **Alpine.js**, and **Tailwind CSS**.

## Features

-   **Workout Tracking**: Guided pushup sessions with progressive difficulty levels.
-   **Interactive UI**:
    -   Tap-to-count interface optimized for mobile (prevents nose-tap mistouches).
    -   Audio feedback (beep) on every rep.
    -   Wake lock support to keep screen on during workouts.
-   **Progress History**: Calendar view to visualize daily workout activity and details.
-   **Authentication**: Secure login system using JWT (Header-based Bearer token).
-   **PWA-ready**: Designed for "Add to Home Screen" usage.

## Tech Stack

-   **Framework**: [Alpine.js](https://alpinejs.dev/) (Lightweight reactivity)
-   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
-   **Build Tool**: [Vite](https://vitejs.dev/)
-   **Icons**: Custom SVG icons

## Development

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Start Development Server**:
    ```bash
    npm run dev
    ```

3.  **Build for Production**:
    ```bash
    npm run build
    ```

## Configuration

The API URL is configured via environment variables.
-   Create a `.env` file (or set in deployment environment):
    ```env
    VITE_API_URL=https://your-backend-worker.workers.dev
    ```

## Deployment

This project is configured for **GitHub Pages** deployment via GitHub Actions.
1.  Push to `main` branch.
2.  The workflow in `.github/workflows/deploy.yml` will automatically build and deploy the `dist` folder.
