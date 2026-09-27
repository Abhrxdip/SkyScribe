<div align="center">

<img src="brand/app-icon.svg" width="112" alt="SkyScribe logo" />

# SkyScribe

**Control your slides with hand gestures. No mouse, no clicker, just air.**

Drop a PDF, raise your hand, and present — 100% in the browser, nothing ever leaves your machine.

<p>
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=101820" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/MediaPipe-Tasks%20Vision-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white" alt="MediaPipe Tasks Vision" />
  <img src="https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
</p>
<p>
  <img src="https://img.shields.io/badge/status-active%20development-F4A62A?style=flat-square" alt="Status: active development" />
  <img src="https://img.shields.io/badge/tests-86%20passing-brightgreen?style=flat-square" alt="Tests: 86 passing" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT" />
</p>

</div>

---

## Table of contents

- [Overview](#overview)
- [Design principles](#design-principles)
- [Features](#features)
- [Gesture vocabulary](#gesture-vocabulary)
- [Keyboard fallback](#keyboard-fallback)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Privacy & security](#privacy--security)
- [Roadmap](#roadmap)
- [Known limitations](#known-limitations)
- [Author](#author)

## Overview

**SkyScribe** turns any PDF into a hands-free, gesture-controlled presentation. Drop a file in, and it becomes a full-screen deck you drive with your hand in front of the webcam — no mouse, no clicker, no assistant hovering by the laptop to hit "next slide."

It's built for **teachers, speakers, and presenters**, runs entirely **client-side** (no backend, no upload — your file never leaves the browser), and is meant to feel like a real presentation tool, not a demo page.

## Design principles

1. **Client-side only.** Every bit of inference, rendering, and state management happens in your browser.
2. **Invisible interface.** The presentation is the hero. HUD chrome, gestures guide, and tool menus tuck away when you're speaking.
3. **Natural physics & smoothing.** One Euro Filter smoothing eliminates hand tremors while maintaining immediate responsiveness.
4. **Adaptive contrast.** Annotations and laser points automatically sample slide luminance to guarantee maximum legibility on both dark and light decks.

## Features

- 🖐️ **Hands-free presentation:** Advance slides, point, zoom, erase, and draw geometric shapes using natural gestures.
- 🎯 **Laser pointer & magnifier:** Highlight key points or zoom smoothly into detailed diagrams.
- ✍️ **Ink annotations:** Write in real time with smoothing, underline text, and circle items.
- 📐 **Shape recognition:** Automatically straighten lines, draw rectangles, ellipses, and arrows with pinch gestures.
- 📷 **Picture-in-Picture (PiP):** Floating webcam view with hand landmark skeletons and reach boundaries.
- 🎓 **Interactive Trainer:** Guided onboarding and calibration challenge mode to master all gestures.
- 📋 **Whiteboard mode:** Instantly switch to a blank canvas to explain concepts freely.
- ⌨️ **Keyboard fallback:** Comprehensive keyboard controls for all gestures and actions.
- 💾 **Offline & local persistence:** Decks and preferences are saved locally with IndexedDB.

## Gesture vocabulary

| Gesture | Action |
|---|---|
| ☝️ Index finger raised | **Laser pointer** (or zoom lens / eraser depending on active tool) |
| 🤏 Thumb + Index pinch | **Pen** — draw freehand over the slide; straight lines auto-straighten |
| 🤏 Thumb + Middle pinch | **Rectangle** — aim at corner, hold, and drag across |
| 🤏 Thumb + Ring pinch | **Circle / ellipse** — drag corner to corner, or trace the outline |
| 🤏 Thumb + Pinky pinch | **Arrow** — from where the pinch starts to where it's released |
| 👎 Thumb down, held | **Clear** the current slide's ink |
| 👍 Thumb up, held | **Confirm** — closes whatever panel is open (menu, help, settings) |
| ✌️ Two fingers pointing sideways, held | **Navigate** — right advances, left goes back, one slide at a time |
| 🖐️ Open palm, held | **Open the tool menu** (dwell over options to select) |
| ✊ Raise / lower a closed fist | **Zoom** on the last laser point |
| 🙌 Both hands open | **Reset zoom** to 1× |
| 3 fingers up, held | **Undo** last ink action |
| 4 fingers up (thumb tucked), held | **Redo** last ink action |

> The full state machine — confirmation windows, jitter tolerance, and pinch-classification thresholds — lives in [`src/lib/gestures.ts`](src/lib/gestures.ts).

## Keyboard fallback

Every gesture has a keyboard equivalent, so the app is fully usable without a camera:

- `←` / `→`, `Space`, `PgUp` / `PgDn`: Navigate slides
- `M`: Open tool menu (`1`–`5` to pick options)
- `B`: Toggle whiteboard canvas
- `E`: Clear current slide ink
- `Z`: Undo annotation / shape
- `Y` / `Ctrl+Shift+Z`: Redo
- `+` / `-`, `0`: Zoom in, zoom out, reset zoom (1×)
- `L`: Toggle mouse laser & pen fallback
- `C`: Toggle camera tracking
- `T`: Launch gesture trainer
- `F`: Toggle fullscreen
- `?`: Open help dialog & cheatsheet
- `Esc`: Close open modal, menu, or exit presentation

## Tech stack

| Layer | Choice |
|---|---|
| Build tool | [Vite](https://vite.dev/) 8 |
| UI | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) |
| Animation | [Motion](https://motion.dev/) (Framer Motion) |
| Hand tracking | [`@mediapipe/tasks-vision`](https://developers.google.com/mediapipe) Hand Landmarker in Web Worker |
| PDF rendering | [`pdf.js`](https://mozilla.github.io/pdf.js/) |
| Smoothing | Custom One Euro Filter implementation |
| Testing | [Vitest](https://vitest.dev/) (86 passing tests) |
| Deploy target | [Vercel](https://vercel.com/) |

## Project structure

```
skyscribe/
├── brand/                  # Visual identity, tokens, marks, brand kit showcase
├── public/models/          # MediaPipe hand landmarker model, served locally
└── src/
    ├── App.tsx              # Application entry point
    ├── components/
    │   ├── Brand.tsx        # Logo and lockup components
    │   ├── GestureCards.tsx # Visual gesture guide cards
    │   ├── HelpDialog.tsx   # Help & keyboard shortcuts modal
    │   ├── Home.tsx         # Drop PDF launcher, recent decks, trainer launch
    │   ├── Hud.tsx          # Minimal HUD with tools, counter, and actions
    │   ├── Presenter.tsx    # Slide deck presentation view with gesture controller
    │   ├── SettingsPanel.tsx # Camera, smoothing, and ink preferences
    │   ├── TipsSheet.tsx    # Pre-presentation quick gesture reminder
    │   ├── ToolMenu.tsx     # Floating dwell-selectable tool menu
    │   ├── Trainer.tsx      # Interactive onboarding and gesture challenges
    │   ├── SlideCanvas.tsx  # High-DPI canvas rendering
    │   └── SlideDemo.tsx    # Interactive slide preview demo
    ├── hooks/
    │   └── useHandTracking.ts # React hook for worker lifecycle
    ├── lib/
    │   ├── contrast.ts      # Slide luminance sampling & ink adaptation
    │   ├── controller.ts    # Gesture controller state machine
    │   ├── gestures.ts      # Pose classification & gesture engine
    │   ├── glyphs.ts        # Hand SVG visualizations & keybindings
    │   ├── ink.ts           # Per-slide vector ink layer with history
    │   ├── overlay.ts       # Canvas overlays, laser cursor, and HUD markers
    │   ├── pdf.ts           # PDF page rendering & pre-caching
    │   ├── pip.ts           # Picture-in-picture camera feed & skeleton
    │   ├── prefs.ts         # User preferences persistence
    │   ├── recent.ts        # IndexedDB deck persistence
    │   ├── shapes.ts        # Shape recognition & interactive handles
    │   ├── tokens.ts        # Design token accessor
    │   └── tracker.ts       # Camera coordination & latency stats
    └── workers/
        └── hands.worker.ts   # MediaPipe inference worker
```

## Getting started

**Prerequisites:** Node.js `>= 20.0`

```bash
# Clone the repository
git clone https://github.com/Abhrxdip/SkyScribe.git
cd SkyScribe

# Install dependencies
npm install

# Start development server
npm run dev

# Run automated test suite
npm test

# Build for production deployment
npm run build
```

## Privacy & security

SkyScribe is built to be private by design:

- **No backend, no cloud processing:** Your PDF and camera feed stay entirely on your computer.
- **Camera permission is strictly local:** Video frames are analyzed in-memory via Web Workers and never stored or transmitted.
- **Data control:** Recent files and hand profiles are stored locally in IndexedDB and localStorage with a one-click delete option.

## Author

Built by **[Abhrxdip](https://github.com/Abhrxdip)**.

---

<div align="center">
Made with 🖐️, ☕ and SkyScribe.
</div>
