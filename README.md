# r24-plate-generator

Responsive Plate Generator (React + Vite): configure multiple wall plates, 1 cm = 1 px real-scale preview, center-crop/contain, horizontal auto-mirror when total width > 300 cm, drag-reorder, per-plate panning, PNG/JPEG export, mobile-first and touch-friendly. Persists to `localStorage`.

**Live demo:** https://YOUR-VERCEL-URL.vercel.app  
**Repo:** https://github.com/YOUR_GH_USER/r24-plate-generator

---

## 1) What this solves (30-second overview)

- A two-panel tool: left = visual canvas, right = precise dimension controls.
- Each plate shows the correct segment of a **shared motif**; you can pan each plate to fine-tune the crop.
- When the total width exceeds **300 cm**, the image is seamlessly extended by a **mirror strip**, so designs stay continuous.
- Inputs are **locale-aware** (`12.5` or `12,5`) and validated without fighting the user while they type.
- Works well on mobile (touch, small screens) and desktop; drag-reorder on desktop, one-tap reorder pills on mobile.

---

## 2) Features ↔ Requirement mapping

- **Initial plate + persistence**
  - One default plate on load.
  - All settings (plates, units, motif, crop mode) persist in `localStorage`.

- **Dimensions input**
  - Width: **20–300 cm**, Height: **30–128 cm**.
  - No HTML `min/max`; validation is custom:
    - Shows a styled error while editing if out of range/invalid.
    - On **blur**: invalid input **reverts** to the last valid value.
  - Locale-aware numbers (accepts `,` or `.`).

- **Plate management**
  - Maintain **1–10 plates**.
  - Add / remove (cannot remove the last one).
  - **Reorder**: drag & drop on desktop, left/right pills on mobile.

- **Dual-canvas UI**
  - Left: scaled stage (1 cm = 1 px).
  - Right: controls in cards.
  - Fully responsive; all interactions are touch-friendly.

- **Realistic scaling & placement**
  - Stage uses true ratios; canvas **fits** to viewport via `ResizeObserver` with no distortion.

- **Motif rendering**
  - Shared motif across the whole stage; each plate shows its correct slice.
  - Center-based crop by default; **contain** toggle available.

- **Image extension via mirroring**
  - If total width > **300 cm**: render `[image | mirrored(image)]` into an offscreen canvas and apply as `repeat-x` with a 300-cm period → seamless edge.

- **Bonus**
  - Upload your own motif (persisted).
  - Export **PNG**/**JPEG** (PNG can be transparent; JPEG is white-backed).
  - Light animations (respect `prefers-reduced-motion`).
  - Units: **cm / in**.

---

## 3) How to run


# Node 20+ recommended
npm i
npm run dev       # http://localhost:5173
npm run build     # outputs to dist/
npm run preview   # local preview of build
