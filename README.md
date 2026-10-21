# Fireworks Studio

A single-file web app for designing fireworks shows. Open `dist/fireworks-studio.html` in any modern browser. It works offline and has no dependencies; only the fonts load from Google Fonts, with system fallbacks.

## What it does

- **Two kinds of fireworks.** Particle shells (peony, chrysanthemum, willow, ring, palm, crossette, strobe, heart, crackle) with launch rockets, any colours, sizes and star counts. Animated GIFs: the 11 built-in ones plus any GIF, PNG, JPG, WebP or SVG you import.
- **Timeline.** Every cue has a bar: drag it to change when the cue fires, drag a GIF bar's right edge to set its length, and drag cue names to change layer order. You can scrub, zoom (Ctrl + scroll), loop and step frames.
- **Stage editing.** Move, resize from the corners (Shift for free resize, Alt to resize from the centre), rotate (Shift snaps to 15°), snap guides, box select, multi-select with align/distribute/stagger, copy/paste/duplicate, a right-click menu, and keyboard nudging.
- **Fire tool (F).** Click the sky to fire the chosen shell at the playhead. It also works while the show plays, so you can perform a show live.
- **Sound.** Synthesised booms, crackle and launch whistles, panned by position. They are recorded into video exports.
- **Sky.** Night sky, gradient, solid colour or your own photo, with optional stars and a city skyline.
- **Canvas sizes.** 1080p, 720p, 4K, vertical, square and 4:3, or a custom size.
- **Export.** MP4 or WebM video (with sound, at full, ⅔ or ½ size, 24/30/60 fps), animated GIF (rendered frame by frame) and PNG stills. WebM files get a proper duration so players can seek.
- **Saving.** Autosaves to the browser (IndexedDB). Save and open `.fireworks.json` show files, which carry your imported images with them.
- **Undo/redo** for every edit (Ctrl+Z / Ctrl+Shift+Z). Press `?` in the app for all shortcuts.

## Project layout

```
src/codecs.js   GIF decoder, GIF encoder (median cut + LZW), WebM duration fix
src/engine.js   Deterministic renderer: shells, rockets, backgrounds, GIF timing, audio synth
src/core.js     Model, history, assets, persistence, playback, stage interaction
src/ui.js       Library, inspector, timeline, transport, dialogs, export, keyboard, boot
src/styles.css  Styles
src/index.html  Page shell
assets/         Built-in GIFs (taken from the original app)
build.py        Inlines everything into dist/fireworks-studio.html
```

Rendering is a pure function of the show and the time, so preview, scrubbing and export always match.

## Build and test

```
python3 build.py
node test/codecs.test.js && node test/lzw.test.js
NODE_PATH=$(npm root -g) OUT=/tmp node test/e2e.js     # needs Playwright + Chromium
```

The end-to-end test drives the real app: drag and drop, move/resize/rotate, undo/redo, keyboard, the Fire tool, timeline drags, canvas changes, save/open, import (including a damaged file), autosave after a reload, PNG/GIF/video export and the phone layout.
