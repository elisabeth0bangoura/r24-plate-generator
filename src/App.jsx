"use client";

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Download, Image as ImageIcon, Minus, ChevronLeft, ChevronRight } from "lucide-react";

/* ======= Layout split (DESKTOP UNCHANGED) ======= */
const LEFT_COL_FRACTION = 0.7;

/* ======= Persist & Defaults ======= */
const STORAGE_KEY = "r24:plate-gen:v1";
/** Local default to avoid broken/garbled URLs & CORS. Put /public/R24Image.jpg in your project. */
const LOCAL_MOTIF_URL = "/R24Image.jpg";

/* ======= Limits & Breakpoints ======= */
const MAX_PLATES = 10;

const BP = { mobileS: 320, mobileM: 375, mobileL: 425, tablet: 768 };
const DESKTOP_MIN = 884;

/* Stage cap per mobile bucket (desktop not affected) */
const MOBILE_CAP = { S: 150, M: 165, L: 180, T: 200 };

/* ======= Small reset + light animations (bonus) ======= */
/* >>> MOBILE TEXT COLOR FIX added at the end of this block <<< */
function GlobalStyles() {
  return (
    <style>{`
      html, body, #root { height: 100%; }
      body { margin: 0; background:#FFFFFF; }
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      button { font: inherit; }
      button, input, select { touch-action: manipulation; }
      input:disabled, button:disabled { cursor: not-allowed; opacity: .6; }
      input[type="range"]:disabled { filter: grayscale(.6); }

      /* ==== Bonus animations ==== */
      @keyframes plate-in {
        from { opacity: 0; transform: scale(.985); }
        to { opacity: 1; transform: scale(1); }
      }
      @keyframes plate-out {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(.985); }
      }

      .plate-card, .plate-view {
        animation: plate-in .22s ease both;
        will-change: transform, opacity;
      }
      .plate-card.leaving, .plate-view.leaving {
        animation: plate-out .18s ease both;
      }
      /* Smooth size tweaks on the visual plate frame */
      .plate-view { transition: width .18s ease; }
      .plate-view > div { transition: width .18s ease, height .18s ease, padding .18s ease, border-radius .12s ease; }

      /* Respect reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .plate-card, .plate-view, .plate-view > div { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
      }

      /* ===========================
         MOBILE-ONLY TEXT COLOR FIX
         iOS Safari dark mode can turn input text white.
         Force light scheme + black text on mobile only.
         =========================== */
      @media (max-width: ${DESKTOP_MIN - 1}px) {
        html, body { color-scheme: light; } /* stop dark form theming */
        input, select, textarea, button {
          color: #000 !important;
          -webkit-text-fill-color: #000; /* iOS */
          background-color: #fff;
          caret-color: #000;
        }
        ::placeholder { color: #6B7280; opacity: 1; }
        input:-webkit-autofill {
          -webkit-text-fill-color: #000;
          box-shadow: 0 0 0px 1000px #fff inset; /* keep white bg */
        }
      }
    `}</style>
  );
}

/* ======= Helpers ======= */
const uid = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function parseLocaleNumber(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/\s+/g, "");
  if (!s) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const decIsComma = s.lastIndexOf(",") > s.lastIndexOf(".");
    s = decIsComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ======= Mobile-only breakpoint hook ======= */
function useMobileBuckets() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1024 : window.innerWidth));
  useEffect(() => {
    const onR = () => setW(window.innerWidth);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  const isMobile = w < DESKTOP_MIN;

  let bucket = "T";
  if (w <= BP.mobileS) bucket = "S";
  else if (w <= BP.mobileM) bucket = "M";
  else if (w <= BP.mobileL) bucket = "L";
  return { isMobile, bucket, width: w };
}

/* ======= Units ======= */
const CM = "cm";
const IN = "in";
const CM_PER_IN = 2.54;
const toDisplay = (cm, unit) => (unit === IN ? cm / CM_PER_IN : cm);
const fromDisplay = (val, unit) => (unit === IN ? val * CM_PER_IN : val);

/* ======= Model ======= */
const makePlate = (i = 1) => ({
  id: uid(),
  label: `Plate ${i}`,
  widthCm: 200,
  heightCm: 120,
  radiusPx: 10,
  paddingPx: 4,
  panX: 0,
  panY: 0,
});

/* ======= UI bits ======= */
const card = (pad = 12) => ({
  position: "relative",
  borderRadius: "5px",
  background: "#F5F6F8",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.02) inset",
  padding: pad,
  display: "block",
});

function btn(kind = "outline", disabled = false) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    border: "1px solid #E5E7EB",
    background: "white",
  };
  if (kind === "solid") return { ...base, border: "none", background: "black", color: "white" };
  if (kind === "danger") return { ...base, border: "1px solid #FECACA", color: "#B91C1C", background: "#FEF2F2" };
  return base;
}

const btnAdd = () => ({
  width: "auto",
  justifySelf: "end",
  marginRight: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 44,
  padding: "0 10px",
  borderRadius: 12,
  border: "1px solid #3CB560",
  background: "#F9FDFA",
  color: "#61C277",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
});

/* ======= BADGES ======= */
function blet({ size = 25, variant = "dark" } = {}) {
  const light = variant === "light";
  const font = Math.max(12, Math.round(size * 0.48));
  const r = Math.min(10, Math.max(0, Math.floor(size / 2) - 2));
  return {
    width: size,
    height: "auto",
    aspectRatio: "1 / 1",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: r,
    background: light ? "#FFFFFF" : "#000000",
    color: light ? "#000000" : "#FFFFFF",
    boxShadow: light
      ? "0 1px 0 rgba(0,0,0,.05), inset 0 0 0 1px #0000000d"
      : "0 2px 0 rgba(0,0,0,.10), 0 0 0 3px #FFFFFF",
    border: "1px solid #000000",
    fontSize: font,
    fontWeight: 900,
    lineHeight: 1,
    userSelect: "none",
    overflow: "hidden",
  };
}

/* Mobile floating number badge (top-left) */
const indexBadgeStyle = (size = 25, isFirst = false) => {
  const font = Math.max(12, Math.round(size * 0.48));
  const r = Math.min(12, Math.max(0, Math.floor(size / 2) - 2));
  return {
    position: "absolute",
    top: -12,
    left: -12,
    width: size,
    height: "auto",
    aspectRatio: "1 / 1",
    borderRadius: r,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: isFirst ? "#FFFFFF" : "#000000",
    color: isFirst ? "#000000" : "#FFFFFF",
    border: "2px solid #000000",
    boxShadow: "0 0 0 3px #FFFFFF",
    fontSize: font,
    fontWeight: 900,
    lineHeight: 1,
    userSelect: "none",
    zIndex: 2,
    overflow: "hidden",
  };
};

/* Floating delete pill (MOBILE ONLY) */
const mobileDeleteBtn = (disabled) => ({
  position: "absolute",
  top: -12,
  right: -12,
  width: 25,
  height: "auto",
  aspectRatio: "1 / 1",
  borderRadius: "9999px",
  display: "grid",
  placeItems: "center",
  padding: 0,
  lineHeight: 0,
  zIndex: 2,
  border: `1px solid ${disabled ? "#FECACA80" : "#FECACA"}`,
  background: "#F8C3BF",
  cursor: disabled ? "not-allowed" : "pointer",
  boxShadow: "0 1px 0 rgba(0,0,0,0.03) inset",
  WebkitAppearance: "none",
  appearance: "none",
});

/* NEW: Mobile reorder pills (MOBILE ONLY) */
const mobileReorderBtn = (side, disabled) => ({
  position: "absolute",
  bottom: -12,
  [side]: -12,
  width: 25,
  height: "auto",
  aspectRatio: "1 / 1",
  borderRadius: "9999px",
  display: "grid",
  placeItems: "center",
  padding: 0,
  lineHeight: 0,
  zIndex: 2,
  border: `1px solid ${disabled ? "#E5E7EB" : "#D1D5DB"}`,
  background: "#FFFFFF",
  cursor: disabled ? "not-allowed" : "pointer",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
});

/* ======= Inputs ======= */
function DimensionField({
  id,
  label,
  hintRange,
  valueDisplay,
  unit,
  onCommitCm,
  size = "desktop",
  compact = false,
  minInput = 120,
  hideHeader = false,
  hidePreview = false,
}) {
  const [text, setText] = useState(String(round2(valueDisplay)));
  const [error, setError] = useState(null);
  const lastValidRef = useRef(String(round2(valueDisplay)));
  useEffect(() => {
    const s = String(round2(valueDisplay));
    setText(s);
    lastValidRef.current = s;
    setError(null);
  }, [valueDisplay]);

  const { minCm, maxCm } = hintRange;

  const validate = (raw) => {
    if (!raw.trim()) {
      setError(`Pflichtfeld. Bereich ${minCm}–${maxCm} cm.`);
      return { ok: false, valueCm: null };
    }
    const n = parseLocaleNumber(raw);
    if (n === null) {
      setError("Ungültige Zahl. Punkt oder Komma als Dezimaltrenner.");
      return { ok: false, valueCm: null };
    }
    const cm = fromDisplay(n, unit);
    if (cm < minCm || cm > maxCm) {
      setError(`Außerhalb Bereich: ${minCm}–${maxCm} cm.`);
      return { ok: false, valueCm: null };
    }
    setError(null);
    return { ok: true, valueCm: cm };
  };

  const parsed = parseLocaleNumber(text);
  const cmPreview = Number.isFinite(parsed) ? fromDisplay(parsed, unit) : fromDisplay(valueDisplay, unit);
  const mmPreview = Math.round(cmPreview * 10);

  const valueFont = size === "mobile" ? (compact ? "clamp(14px,4.2vw,18px)" : "clamp(16px,4.8vw,20px)") : compact ? 16 : 20;
  const inputPad = size === "mobile" ? (compact ? "8px 38px 8px 10px" : "10px 40px 10px 12px") : compact ? "6px 40px 6px 10px" : "8px 44px 8px 12px";
  const labelFs = size === "mobile" ? (compact ? "clamp(11px,3vw,12px)" : "clamp(11px,3.2vw,13px)") : compact ? 12 : 13;
  const hintFs = size === "mobile" ? "clamp(9px,2.6vw,11px)" : compact ? 10 : 11;

  return (
    <div style={{ display: "grid", gap: compact ? 3 : 5, minWidth: 0 }}>
      {!hideHeader &&
        (size === "mobile" ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
            <div style={{ fontSize: labelFs, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{label}</div>
            <span style={{ fontSize: 9, color: "#000", verticalAlign: "super" }}>{unit}</span>
            <span style={{ fontSize: hintFs, color: "#000" }}>
              {minCm}–{maxCm} cm
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
            <label htmlFor={id} style={{ fontSize: labelFs, fontWeight: 700, color: "#111827" }}>
              {label}
            </label>
            <span style={{ fontSize: hintFs, color: "#000", fontWeight: 500 }}>
              {minCm} – {maxCm} cm
            </span>
          </div>
        ))}

      <div style={{ position: "relative" }}>
        <input
          id={id}
          type="text"
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            validate(v);
          }}
          onBlur={() => {
            const res = validate(text);
            if (res.ok && res.valueCm != null) {
              lastValidRef.current = text;
              onCommitCm(res.valueCm);
            } else {
              setText(lastValidRef.current); // restore previous good value
              setError(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          style={{
            width: "100%",
            minWidth: size === "mobile" ? minInput : undefined,
            textAlign: size === "mobile" ? "center" : "left",
            borderRadius: 12,
            border: `1px solid ${error ? "#FCA5A5" : "#E5E7EB"}`,
            padding: inputPad,
            fontSize: valueFont,
            outline: "none",
            background: "white",
            fontWeight: 800,
          }}
          placeholder={`${minCm}–${maxCm}`}
          inputMode="decimal"
        />
        <span
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            right: 3,
            display: "flex",
            alignItems: "center",
            padding: "0 6px",
            background: "#FFFFFF",
            borderRadius: 7,
            fontSize: 16,
            color: "#000",
            pointerEvents: "none",
          }}
        >
          {unit}
        </span>
      </div>

      {!hidePreview && (
        <div style={{ fontSize: size === "mobile" ? "clamp(10px,2.6vw,12px)" : compact ? 11 : 13, fontWeight: 600, color: "#000", textAlign: "center", marginTop: 2 }}>
          {mmPreview} mm
        </div>
      )}

      {error && (
        <div role="alert" aria-live="polite" style={{ border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", borderRadius: 10, padding: "8px 10px", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* ======= App ======= */
export default function App() {
  const { isMobile, bucket, width } = useMobileBuckets();

  const [plates, setPlates] = useState([makePlate(1)]);
  const [canvasPadPx] = useState(10);
  const [unit, setUnit] = useState(CM);

  const [motifUrl, setMotifUrl] = useState(null);
  const [imgMeta, setImgMeta] = useState(null);
  const [bgContain, setBgContain] = useState(false); // default to crop

  const [isExporting, setIsExporting] = useState(false);

  const fitWrapRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [wrapHeight, setWrapHeight] = useState("auto");

  const [stripUrl, setStripUrl] = useState(null);

  /* Per-plate panning (element-scoped only) */
  const panRef = useRef({ active: false, id: null, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const [activePanId, setActivePanId] = useState(null);

  /* Bonus: gentle removal animation */
  const [leavingIds, setLeavingIds] = useState(new Set());
  const requestRemove = (id) => {
    if (plates.length <= 1) return;
    setLeavingIds((prev) => {
      const s = new Set(prev);
      s.add(id);
      return s;
    });
  };
  const finalizeRemove = (id) => {
    setPlates((pp) => pp.filter((x) => x.id !== id).map((x, i) => ({ ...x, label: `Plate ${i + 1}` })));
    setLeavingIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  };

  /* LOAD */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const loaded = (Array.isArray(s.plates) && s.plates.length ? s.plates : [makePlate(1)]).map((p, i) => ({
          ...p,
          panX: typeof p.panX === "number" ? p.panX : 0,
          panY: typeof p.panY === "number" ? p.panY : 0,
          label: `Plate ${i + 1}`,
        }));
        setPlates(loaded);
        setBgContain(!!s.bgContain);
        setUnit(s.unit === IN ? IN : CM);
        const url =
          typeof s.motifUrl === "string" &&
          (/^https?:\/\//.test(s.motifUrl) || s.motifUrl.startsWith("/") || s.motifUrl.startsWith("data:"))
            ? s.motifUrl
            : null;
        setMotifUrl(url || LOCAL_MOTIF_URL);
      } else setMotifUrl(LOCAL_MOTIF_URL);
    } catch {
      setMotifUrl(LOCAL_MOTIF_URL);
    }
  }, []);
  const debounced = useDebounced({ plates, bgContain, motifUrl, unit }, 300);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(debounced));
    } catch {}
  }, [debounced]);

  /* image meta */
  useEffect(() => {
    if (!motifUrl) return;
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => setImgMeta({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => {
      if (motifUrl !== LOCAL_MOTIF_URL) setMotifUrl(LOCAL_MOTIF_URL);
    };
    img.src = motifUrl;
  }, [motifUrl]);

  /* layout math (1 cm = 1 px) */
  const totalWidthCmOnly = useMemo(() => plates.reduce((w, p) => w + p.widthCm, 0), [plates]);
  const maxHeightCm = useMemo(() => Math.max(...plates.map((p) => p.heightCm), 1), [plates]);

  const naturalStageWidth = Math.max(1, totalWidthCmOnly + (plates.length - 1) * 8 + (isMobile ? 8 : canvasPadPx) * 2);
  const naturalStageHeight = Math.max(1, maxHeightCm + (isMobile ? 8 : canvasPadPx) * 2);

  /* ======= FIT ======= */
  useLayoutEffect(() => {
    const wrap = fitWrapRef.current;
    if (!wrap) return;

    const calc = () => {
      const rect = wrap.getBoundingClientRect();
      const availW = Math.max(1, rect.width);
      const availH = Math.max(1, rect.height);

      if (isMobile) {
        const sW = availW / naturalStageWidth;
        const scaledH = naturalStageHeight * sW;
        const cap = bucket === "S" ? MOBILE_CAP.S : bucket === "M" ? MOBILE_CAP.M : bucket === "L" ? MOBILE_CAP.L : MOBILE_CAP.T;
        const targetH = Math.min(cap, Math.round(scaledH));
        const sH = targetH / naturalStageHeight;
        const scale = Math.min(sW, sH);
        setFitScale(scale);
        setWrapHeight(Math.round(naturalStageHeight * scale));
      } else {
        const sW = availW / naturalStageWidth;
        const sH = availH / naturalStageHeight;
        const scale = Math.min(sW, sH);
        setFitScale(scale);
        setWrapHeight("100%");
      }
    };

    const ro = new ResizeObserver(calc);
    ro.observe(wrap);
    calc();
    return () => ro.disconnect();
  }, [naturalStageWidth, naturalStageHeight, isMobile, bucket]);

  /* mirrored strip */
  const MIRROR_PERIOD_CM = 300;
  useEffect(() => {
    if (!imgMeta || !motifUrl) return;
    const paneW = MIRROR_PERIOD_CM;
    const paneH = Math.max(1, maxHeightCm);
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(paneW * 2 * dpr));
    canvas.height = Math.max(1, Math.round(paneH * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const frameW = paneW * dpr, frameH = paneH * dpr;
      const coverScale = Math.max(frameW / img.width, frameH / img.height);
      const containScale = Math.min(frameW / img.width, frameH / img.height);
      const s = bgContain ? containScale : coverScale;
      const drawW = img.width * s, drawH = img.height * s;
      const dx = (frameW - drawW) / 2, dy = (frameH - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.save(); ctx.translate(frameW * 2, 0); ctx.scale(-1, 1);
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.restore();
      setStripUrl(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = motifUrl;
  }, [imgMeta && imgMeta.w, imgMeta && imgMeta.h, motifUrl, maxHeightCm, bgContain]);

  /* export */
  async function handleExport(fmt) {
    try {
      setIsExporting(true);
      const html2canvas = (await import("html2canvas")).default;
      const node = document.getElementById("stage-root");
      if (!node) return;
      const canvas = await html2canvas(node, { backgroundColor: fmt === "png" ? null : "#ffffff", scale: 2, useCORS: true, logging: false });
      const mime = fmt === "png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `plates-${Date.now()}.${fmt}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        },
        mime,
        fmt === "jpeg" ? 0.95 : undefined
      );
    } catch (e) {
      console.error(e);
      alert("Export fehlgeschlagen (CORS?). Lege notfalls /public/R24Image.jpg ab.");
    } finally {
      setIsExporting(false);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ======= Stage (global bg sizing) ======= */
  const needsMirror = totalWidthCmOnly > 300;
  const bgGap = 8;
  const stageW = Math.max(1, totalWidthCmOnly);
  const stageH = Math.max(1, maxHeightCm);

  let sharedBgW = stageW, sharedBgH = stageH;
  // center offsets (can be negative when image is smaller — keeps true center crop)
  let sharedCenterOffsetX = 0;
  let sharedCenterOffsetY = 0;

  if (imgMeta && imgMeta.w > 0 && imgMeta.h > 0) {
    const imgAR = imgMeta.w / imgMeta.h;
    const stageAR = stageW / stageH;
    if (bgContain) {
      if (stageAR < imgAR) { sharedBgW = stageW; sharedBgH = stageW / imgAR; }
      else { sharedBgH = stageH; sharedBgW = stageH * imgAR; }
    } else {
      if (stageAR > imgAR) { sharedBgW = stageW; sharedBgH = stageW / imgAR; }
      else { sharedBgH = stageH; sharedBgW = stageH * imgAR; }
    }
    sharedCenterOffsetX = (sharedBgW - stageW) / 2;
    sharedCenterOffsetY = (sharedBgH - stageH) / 2;
  }

  // symmetric pan limits
  const maxPanX = Math.abs(Math.round((sharedBgW - stageW) / 2));
  const maxPanY = Math.abs(Math.round((sharedBgH - stageH) / 2));

  /* ======= Helpers: reorder for MOBILE ONLY UI */
  function movePlateIndex(from, to) {
    setPlates((arr) => {
      if (to < 0 || to >= arr.length) return arr;
      const next = arr.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((pp, i) => ({ ...pp, label: `Plate ${i + 1}` }));
    });
  }

  /* === Stage view === */
  const Stage = (
    <div
      id="stage-root"
      style={{
        position: "relative",
        width: naturalStageWidth,
        height: naturalStageHeight,
        borderRadius: 16,
        padding: isMobile ? 6 : canvasPadPx,
        background: "transparent",
        lineHeight: 0,
        userSelect: activePanId ? "none" : "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: bgGap,
          flexWrap: "nowrap",
          height: "100%",
          alignItems: "flex-end",
        }}
      >
        {plates.map((p, idx) => {
          const xLeftCm = plates.slice(0, idx).reduce((acc, prev) => acc + prev.widthCm, 0) + idx * bgGap;

          // element-scoped handlers only (no window listeners)
          const onPointerDown = (e) => {
            if (!motifUrl || !e.isPrimary) return;
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
            panRef.current = {
              active: true,
              id: p.id,
              startX: e.clientX,
              startY: e.clientY,
              startPanX: p.panX || 0,
              startPanY: p.panY || 0,
            };
            setActivePanId(p.id);
            e.preventDefault();
            e.stopPropagation();
          };

          const onPointerMove = (e) => {
            if (!panRef.current.active || panRef.current.id !== p.id) return;
            const dxScreen = e.clientX - panRef.current.startX;
            const dyScreen = e.clientY - panRef.current.startY;
            const dxStage = dxScreen / (fitScale || 1);
            const dyStage = dyScreen / (fitScale || 1);

            setPlates((prev) =>
              prev.map((pl) =>
                pl.id === p.id
                  ? {
                      ...pl,
                      panX: needsMirror ? panRef.current.startPanX + dxStage : clamp(panRef.current.startPanX + dxStage, -maxPanX, maxPanX),
                      panY: clamp(panRef.current.startPanY + dyStage, -maxPanY, maxPanY),
                    }
                  : pl
              )
            );
          };

          const onPointerUp = () => {
            panRef.current.active = false;
            setActivePanId(null);
          };

          // Always square image corners
          const corner = 0;

          if (needsMirror) {
            const periodW = 300 * 2;
            const bgSize = `${periodW}px ${Math.round(sharedBgH)}px`;
            const bgImage = stripUrl ? `url("${stripUrl}")` : motifUrl ? `url("${motifUrl}")` : undefined;

            const bgPosX = `${-(xLeftCm - (p.panX || 0))}px`;
            const bgPosY = `${-(0 - (p.panY || 0))}px`;

            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", height: "100%" }}>
                <div
                  aria-label={p.label}
                  className={`plate-view${leavingIds.has(p.id) ? " leaving" : ""}`}
                  style={{ position: "relative", width: p.widthCm, aspectRatio: `${p.widthCm}/${p.heightCm}` }}
                >
                  <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: corner }}>
                    <div
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      style={{
                        position: "absolute",
                        inset: 0,
                        padding: p.paddingPx,
                        borderRadius: corner,
                        overflow: "hidden",
                        backgroundImage: bgImage,
                        backgroundRepeat: "repeat-x",
                        backgroundOrigin: "content-box",
                        backgroundClip: "content-box",
                        backgroundSize: bgSize,
                        backgroundPosition: `${bgPosX} ${bgPosY}`,
                        transition: "border-radius 120ms ease",
                        cursor: activePanId === p.id ? "grabbing" : "grab",
                        touchAction: "none",
                        pointerEvents: motifUrl ? "auto" : "none",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          }

          const bgSize = `${Math.round(sharedBgW)}px ${Math.round(sharedBgH)}px`;
          const bgImage = motifUrl ? `url("${motifUrl}")` : undefined;
          const platePanX = clamp(p.panX || 0, -maxPanX, maxPanX);
          const platePanY = clamp(p.panY || 0, -maxPanY, maxPanY);

          // center-based crop both axes
          const bgPosX = `${-(xLeftCm + sharedCenterOffsetX - platePanX)}px`;
          const bgPosY = `${-(sharedCenterOffsetY - platePanY)}px`;

          return (
            <div key={p.id} style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", height: "100%" }}>
              <div
                aria-label={p.label}
                className={`plate-view${leavingIds.has(p.id) ? " leaving" : ""}`}
                style={{ position: "relative", width: p.widthCm, aspectRatio: `${p.widthCm}/${p.heightCm}` }}
              >
                <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: corner }}>
                  <div
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: p.paddingPx,
                      borderRadius: corner,
                      overflow: "hidden",
                      backgroundImage: bgImage,
                      backgroundRepeat: "no-repeat",
                      backgroundOrigin: "content-box",
                      backgroundClip: "content-box",
                      backgroundSize: bgSize,
                      backgroundPosition: `${bgPosX} ${bgPosY}`,
                      transition: "border-radius 120ms ease",
                      cursor: activePanId === p.id ? "grabbing" : "grab",
                      touchAction: "none",
                      pointerEvents: motifUrl ? "auto" : "none",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const rightFraction = Math.max(0, 1 - LEFT_COL_FRACTION);
  const canAdd = plates.length < MAX_PLATES;

  return (
    <>
      <GlobalStyles />
      <div
        style={{
          width: "100vw",
          ...(isMobile ? {} : { minHeight: "100dvh" }),
          padding: 16,
          display: "grid",
          backgroundColor: "#fff",
          gap: 12,
          gridTemplateRows: isMobile ? "auto auto auto" : "auto 1fr auto",
          alignContent: "start",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              Einheit:
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #E5E7EB" }}>
                <option value={CM}>cm</option>
                <option value={IN}>in</option>
              </select>
            </label>
            <button type="button" onClick={() => handleExport("png")} disabled={isExporting || !motifUrl} style={btn("solid", isExporting || !motifUrl)}>
              <Download size={16} />
              <span style={{ marginLeft: 6 }}>{isExporting ? "Exportiert…" : "Export PNG"}</span>
            </button>
            <button type="button" onClick={() => handleExport("jpeg")} disabled={isExporting || !motifUrl} style={btn("outline", isExporting || !motifUrl)}>
              <Download size={16} />
              <span style={{ marginLeft: 6 }}>{isExporting ? "Exportiert…" : "Export JPEG"}</span>
            </button>
          </div>
        </header>

        <main
          style={{
            display: "grid",
            rowGap: 12,
            columnGap: isMobile ? 12 : 48,
            alignItems: isMobile ? "stretch" : "start",
            gridTemplateColumns: isMobile ? "1fr" : `minmax(480px, ${LEFT_COL_FRACTION * 100}%) minmax(360px, ${rightFraction * 100}%)`,
          }}
        >
          {/* LEFT: stage */}
          <section
            style={{
              borderRadius: 10,
              background: "linear-gradient(180deg, #FFFFFF 0%, #E6E8EE 100%)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
              height: "100%",
              boxShadow: "0 1px 0 rgba(0,0,0,0.02) inset",
            }}>
            <div
              ref={fitWrapRef}
              style={{
                position: "relative",
                height: isMobile ? wrapHeight : "100%",
                width: "100%",
                overflow: "hidden",
                margin: "0 auto",
                display: "flex",
                alignItems: isMobile ? "center" : "flex-start",
                justifyContent: "center",
                flex: 1,
                minHeight: 0,
              }}>
              <div style={{ transform: `scale(${fitScale})`, transformOrigin: "top center", width: naturalStageWidth, height: naturalStageHeight }}>{Stage}</div>
            </div>
          </section>

          {/* RIGHT: controls */}
          <section
            style={{
              display: "grid",
              gap: 10,
              overflowY: isMobile ? "visible" : "auto",
              paddingRight: isMobile ? 0 : 2,
              paddingTop: 0,
              minWidth: 0,
              backgroundColor: "#fff",
              alignContent: "start",
              gridAutoRows: "min-content",
            }}>

            {!isMobile && (
              <h1 style={{ margin: 0, padding: 0, marginBottom: 15, fontSize: 24, color: "#000", lineHeight: 1.15 }}>
                <span style={{ fontWeight: 700 }}>Maße</span>
                <span>. </span>
                <span style={{ fontWeight: 500 }}>Eingeben</span>
              </h1>
            )}

            {/* Upload & options */}
            <div style={{ ...card(12), alignSelf: "start" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files && e.target.files[0];
                      if (!f) return;
                      try {
                        const url = await readFileAsDataUrl(f);
                        setMotifUrl(url);
                      } catch {}
                    }}
                    style={{ display: "none" }}
                    id="filepick"
                  />
                  <button onClick={() => document.getElementById("filepick")?.click()} style={btn("outline")} type="button">
                    <ImageIcon size={16} />
                    <span style={{ marginLeft: 6 }}>Upload</span>
                  </button>
                </label>
                <button
                  type="button"
                  style={btn("outline")}
                  onClick={() => setMotifUrl(LOCAL_MOTIF_URL)}
                  title="Lokales Standardbild aus /public verwenden"
                >
                  <ImageIcon size={16} />
                  <span style={{ marginLeft: 6 }}>Use local default</span>
                </button>
                <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151" }}>
                  <input type="checkbox" checked={bgContain} onChange={(e) => setBgContain(e.target.checked)} />
                  Gesamtes Bild anzeigen (contain)
                </label>
              </div>
            </div>

            {/* Plates */}
            <div style={{ display: "grid", gap: 10 }}>
              {plates.map((p, idx) => {
                const minInputVar = !isMobile ? undefined : width <= BP.mobileS ? 96 : width <= BP.mobileM ? 104 : width <= BP.mobileL ? 112 : 120;
                const canDelete = plates.length > 1;
                const bubbleSize = isMobile ? 20 : 30;
                const isFirst = idx === 0;

                const desktopCompact = !isMobile && isFirst;
                const desktopCardMargin = !isMobile ? { marginBottom: idx === 0 ? 40 : 30 } : null;

                const leaving = leavingIds.has(p.id);

                // MOBILE-ONLY: can move left/right?
                const canMoveLeft = isMobile && idx > 0;
                const canMoveRight = isMobile && idx < plates.length - 1;

                return (
                  <div
                    key={p.id}
                    className={`plate-card${leaving ? " leaving" : ""}`}
                    style={{
                      ...card(isMobile ? 10 : 12),
                      paddingTop: isMobile ? 22 : 12,
                      cursor: "grab",
                      ...(desktopCardMargin || {}),
                    }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer?.setData("text/plain", String(idx));
                      e.dataTransfer?.setDragImage?.(e.currentTarget, 20, 20);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = Number(e.dataTransfer?.getData("text/plain"));
                      if (Number.isNaN(from) || from === idx) return;
                      setPlates((arr) => {
                        const next = arr.slice();
                        const [item] = next.splice(from, 1);
                        next.splice(idx, 0, item);
                        return next.map((pp, i) => ({ ...pp, label: `Plate ${i + 1}` }));
                      });
                    }}
                    onAnimationEnd={(e) => {
                      const name = e.animationName || (e.nativeEvent && e.nativeEvent.animationName);
                      if (leaving && name === "plate-out") finalizeRemove(p.id);
                    }}
                  >
                    {isMobile && <div style={indexBadgeStyle(bubbleSize, isFirst)}>{idx + 1}</div>}

                    {/* MOBILE-ONLY: delete pill (existing) */}
                    {isMobile && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (canDelete) requestRemove(p.id);
                        }}
                        disabled={!canDelete}
                        aria-label="Entfernen"
                        title="Entfernen"
                        style={mobileDeleteBtn(!canDelete)}
                      >
                        <Minus strokeWidth={5} size={12} color="#FF5345" />
                      </button>
                    )}

                    {/* NEW MOBILE-ONLY: move left/right pills */}
                    {isMobile && (
                      <>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (canMoveLeft) movePlateIndex(idx, idx - 1);
                          }}
                          disabled={!canMoveLeft}
                          aria-label="Nach links verschieben"
                          title="Nach links verschieben"
                          style={mobileReorderBtn("left", !canMoveLeft)}
                        >
                          <ChevronLeft strokeWidth={4} size={12} />
                        </button>

                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (canMoveRight) movePlateIndex(idx, idx + 1);
                          }}
                          disabled={!canMoveRight}
                          aria-label="Nach rechts verschieben"
                          title="Nach rechts verschieben"
                          style={mobileReorderBtn("right", !canMoveRight)}
                        >
                          <ChevronRight strokeWidth={4} size={12} />
                        </button>
                      </>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "minmax(0,1fr) 16px minmax(0,1fr)" : "56px 1fr 24px 1fr auto",
                        columnGap: 10,
                        rowGap: 6,
                        gridAutoRows: "min-content",
                        minWidth: 0,
                        alignItems: isMobile ? "start" : "center",
                        justifyContent: "center",
                      }}
                    >
                      {!isMobile && (
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                          <div style={blet({ variant: isFirst ? "light" : "dark", size: bubbleSize })}>{idx + 1}</div>
                        </div>
                      )}

                      <DimensionField
                        id={`${p.id}-w`}
                        label="Breite"
                        hintRange={{ minCm: 20, maxCm: 300 }}
                        unit={unit}
                        valueDisplay={toDisplay(p.widthCm, unit)}
                        onCommitCm={(cm) => setPlates((pp) => pp.map((x) => (x.id === p.id ? { ...x, widthCm: cm } : x)))}
                        size={isMobile ? "mobile" : "desktop"}
                        compact={desktopCompact}
                        minInput={isMobile ? minInputVar : 120}
                        hideHeader={isFirst}
                        hidePreview={isFirst}
                      />

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          alignSelf: "stretch",
                          height: "100%",
                          fontSize: 19,
                          color: "#000",
                        }}
                      >
                        ×
                      </div>

                      <DimensionField
                        id={`${p.id}-h`}
                        label="Höhe"
                        hintRange={{ minCm: 30, maxCm: 128 }}
                        unit={unit}
                        valueDisplay={toDisplay(p.heightCm, unit)}
                        onCommitCm={(cm) => setPlates((pp) => pp.map((x) => (x.id === p.id ? { ...x, heightCm: cm } : x)))}
                        size={isMobile ? "mobile" : "desktop"}
                        compact={desktopCompact}
                        minInput={isMobile ? minInputVar : 120}
                        hideHeader={isFirst}
                        hidePreview={isFirst}
                      />

                      {!isMobile && (
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                          <button
                            onClick={() => (canDelete ? requestRemove(p.id) : undefined)}
                            disabled={!canDelete}
                            aria-label="Entfernen"
                            title="Entfernen"
                            style={{
                              width: 25,
                              aspectRatio: "1 / 1",
                              borderRadius: "50%",
                              padding: 0,
                              lineHeight: 0,
                              boxSizing: "border-box",
                              display: "grid",
                              placeItems: "center",
                              border: `1px solid ${canDelete ? "#FECACA" : "#FECACA80"}`,
                              background: "#F7D1CE",
                              color: canDelete ? "#B91C1C" : "#B91C1C80",
                              cursor: canDelete ? "pointer" : "not-allowed",
                              boxShadow: "0 1px 0 rgba(0,0,0,0.03) inset",
                            }}
                          >
                            <Minus strokeWidth={4} size={14} color="#FF5345" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => canAdd && setPlates((p) => [...p, makePlate(p.length + 1)])}
                disabled={!canAdd}
                style={{ ...btnAdd(), width: isMobile ? "100%" : "60%", opacity: canAdd ? 1 : 0.5, cursor: canAdd ? "pointer" : "not-allowed" }}
              >
                Rückwand hinzufügen +
              </button>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
