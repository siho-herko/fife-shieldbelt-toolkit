/**
 * charts.js — Fife ShieldBelt Calculator
 * Zero-dependency canvas chart engine. HTML5 Canvas API only.
 * All functions are idempotent — safe to call repeatedly on the same canvas.
 *
 * Exports:
 *   setupCanvas     — DPR-aware canvas setup
 *   hBar            — Horizontal bar chart (single series)
 *   hStackedBar     — Stacked horizontal bar chart
 *   lineChart       — Multi-series smooth line chart
 *   radarChart      — Radar / spider chart
 *   htmlLegend      — HTML colour-square legend
 *   clearCharts     — Clear all registered canvases
 *
 * Author: NFCA / Fife ShieldBelt project
 */

// ---------------------------------------------------------------------------
// 1. CSS variable reader — single source of truth for colours/fonts
// ---------------------------------------------------------------------------

/**
 * Read a CSS custom property from :root at call-time.
 * Falls back to a hardcoded default so charts render without a stylesheet.
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function getCSSVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Live colour palette — read on each chart call so theme changes propagate */
function C() {
  return {
    forest:   getCSSVar('--c-forest',   '#1a3d2b'),
    mid:      getCSSVar('--c-mid',      '#2d6a4f'),
    leaf:     getCSSVar('--c-leaf',     '#52b788'),
    gold:     getCSSVar('--c-gold',     '#b5830a'),
    goldLt:   getCSSVar('--c-gold-lt',  '#f4c542'),
    stone:    getCSSVar('--c-stone',    '#e8e4dc'),
    ink:      getCSSVar('--c-ink',      '#1c1c1c'),
    muted:    getCSSVar('--c-muted',    '#6b7280'),
    negative: getCSSVar('--c-negative', '#9b2226'),
  };
}

const FONT_BODY = "'Source Sans 3', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Mono', monospace";

// ---------------------------------------------------------------------------
// 2. Layout constants
// ---------------------------------------------------------------------------

const BAR_H      = 28;   // px, logical
const BAR_GAP    = 10;   // px between bars
const PAD_V      = 20;   // top + bottom padding per side
const LABEL_W    = 180;  // px reserved for row labels on the left
const PAD_RIGHT  = 56;   // px reserved for value labels on the right
const LINE_H     = 260;  // px, logical height for line charts

// ---------------------------------------------------------------------------
// 3. setupCanvas
// ---------------------------------------------------------------------------

/**
 * Prepare a canvas for DPR-aware rendering.
 * Clears any previous drawing. Sets canvas bitmap size = logical × dpr.
 * Returns { canvas, ctx, w, h } where w/h are logical pixel dimensions.
 *
 * @param {string} canvasId
 * @param {number} heightPx  Logical CSS height in pixels
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number }}
 */
export function setupCanvas(canvasId, heightPx, minFallbackWidth = 0) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`charts.js: canvas "${canvasId}" not found`);
    return null;
  }

  const dpr = window.devicePixelRatio || 1;
  let w = canvas.offsetWidth || canvas.clientWidth;
  if ((!w || w < 8) && canvas.parentElement) {
    const p = canvas.parentElement;
    w = p.clientWidth || Math.floor(p.getBoundingClientRect().width) || 0;
  }
  if (!w || w < 8) {
    const r = canvas.getBoundingClientRect();
    w = Math.floor(r.width) || 0;
  }
  if ((!w || w < 8) && minFallbackWidth > 0) {
    w = minFallbackWidth;
  }
  if (!w || w < 8) {
    w = 600;
  }
  const h   = heightPx;

  // Set the bitmap size
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  // Set the CSS display size
  canvas.style.width  = w  + 'px';
  canvas.style.height = h  + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);  // reset any prior transform
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  return { canvas, ctx, w, h };
}

// ---------------------------------------------------------------------------
// 4. Internal drawing primitives
// ---------------------------------------------------------------------------

/**
 * Draw vertical grid lines (x-axis tick markers) and a baseline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0   Plot area left edge (after label column)
 * @param {number} y0   Plot area top
 * @param {number} pw   Plot area width
 * @param {number} ph   Plot area height
 * @param {number} xMax
 * @param {string} stoneColor
 */
function drawXGrid(ctx, x0, y0, pw, ph, xMax, stoneColor) {
  const steps = 4;
  ctx.save();
  ctx.strokeStyle = stoneColor;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth   = 1;

  for (let i = 0; i <= steps; i++) {
    const x = x0 + (pw / steps) * i;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + ph);
    ctx.stroke();
  }

  // Baseline
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + ph);
  ctx.lineTo(x0 + pw, y0 + ph);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw x-axis tick labels below the plot area.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0
 * @param {number} y0
 * @param {number} pw
 * @param {number} ph
 * @param {number} xMax
 * @param {Function} formatter
 * @param {string} mutedColor
 */
function drawXTickLabels(ctx, x0, y0, pw, ph, xMax, formatter, mutedColor) {
  const steps = 4;
  ctx.save();
  ctx.font        = `11px ${FONT_MONO}`;
  ctx.fillStyle   = mutedColor;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'top';

  for (let i = 0; i <= steps; i++) {
    const x   = x0 + (pw / steps) * i;
    const val = (xMax / steps) * i;
    ctx.fillText(formatter(val), x, y0 + ph + 5);
  }
  ctx.restore();
}

/**
 * Resolve a color value — if array, use index; if string, use directly.
 * @param {string|string[]} colors
 * @param {number} index
 * @returns {string}
 */
function resolveColor(colors, index) {
  if (Array.isArray(colors)) return colors[index % colors.length];
  return colors;
}

/**
 * Truncate text so it fits within maxWidth px.
 * FIX [mobile/narrow-canvas]: prevents bar labels overflowing into the plot area.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
function truncateLabel(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

/**
 * Compute a responsive label column width — narrows on small canvases.
 * FIX [mobile/narrow-canvas]: prevents labels consuming > 45% of canvas width.
 * @param {number} canvasLogicalWidth
 * @returns {number}
 */
function dynamicLabelW(canvasLogicalWidth) {
  return canvasLogicalWidth < 380 ? Math.min(LABEL_W, Math.floor(canvasLogicalWidth * 0.42)) : LABEL_W;
}

// ---------------------------------------------------------------------------
// 5. htmlLegend
// ---------------------------------------------------------------------------

/**
 * Render an HTML colour-square legend into element[legendId].
 * Clears existing content before rendering.
 *
 * @param {string|null} legendId
 * @param {Array<{ label: string, color: string }>} datasets
 */
export function htmlLegend(legendId, datasets) {
  if (!legendId) return;
  const el = document.getElementById(legendId);
  if (!el) return;

  el.innerHTML = '';
  el.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:8px;';

  for (const ds of datasets) {
    const item = document.createElement('span');
    item.style.cssText = `display:inline-flex;align-items:center;gap:6px;
      font:600 12px/${FONT_BODY};color:var(--c-ink,#1c1c1c);`;

    const swatch = document.createElement('span');
    swatch.style.cssText = `display:inline-block;width:12px;height:12px;
      border-radius:2px;background:${ds.color};flex-shrink:0;`;

    item.append(swatch, document.createTextNode(ds.label));
    el.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// 6. hBar — Horizontal bar chart (single series)
// ---------------------------------------------------------------------------

/**
 * Horizontal bar chart (single series).
 *
 * @param {string}         canvasId
 * @param {string[]}       labels
 * @param {number[]}       values
 * @param {string|string[]} colors      One per bar, or one string for all
 * @param {number|null}    xMax         null = auto-scale to max value
 * @param {Function}       formatter    (value) => string
 * @param {string|null}    legendId
 */
export function hBar(canvasId, labels, values, colors, xMax, formatter, legendId, chartOptions = {}) {
  const rows = labels.length;
  const heightPx = rows * (BAR_H + BAR_GAP) + PAD_V * 2 + 20;
  const setup = setupCanvas(canvasId, heightPx, chartOptions.minFallbackWidth ?? 0);
  if (!setup) return;

  const { ctx, w, h } = setup;
  const c      = C();
  const max    = xMax ?? (Math.max(...values) * 1.1 || 1);
  const lW     = dynamicLabelW(w);    // FIX [mobile]: responsive label column

  // Plot area
  const x0 = lW;
  const y0 = PAD_V;
  const pw = w - lW - PAD_RIGHT;
  const ph = rows * (BAR_H + BAR_GAP) - BAR_GAP;

  drawXGrid(ctx, x0, y0, pw, ph, max, c.stone);

  for (let i = 0; i < rows; i++) {
    const barY   = y0 + i * (BAR_H + BAR_GAP);
    const barW   = Math.max(0, (values[i] / max) * pw);
    const color  = resolveColor(colors, i);

    // Row label — truncated to fit label column
    ctx.save();
    ctx.font        = `13px ${FONT_BODY}`;
    ctx.fillStyle   = c.forest;
    ctx.textAlign   = 'right';
    ctx.textBaseline = 'middle';
    const safeLabel = truncateLabel(ctx, labels[i], lW - 12);  // FIX [mobile]: truncate
    ctx.fillText(safeLabel, x0 - 8, barY + BAR_H / 2);
    ctx.restore();

    // Bar
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(x0, barY, barW, BAR_H, 3)
      : ctx.rect(x0, barY, barW, BAR_H);
    ctx.fill();

    // Value label
    ctx.save();
    ctx.font        = `11px ${FONT_MONO}`;
    ctx.fillStyle   = c.ink;
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatter(values[i]), x0 + barW + 6, barY + BAR_H / 2);
    ctx.restore();
  }

  drawXTickLabels(ctx, x0, y0, pw, ph, max, formatter, c.muted);

  if (legendId) {
    const ds = labels.map((label, i) => ({ label, color: resolveColor(colors, i) }));
    htmlLegend(legendId, ds);
  }
}

// ---------------------------------------------------------------------------
// 7. hStackedBar — Stacked horizontal bar chart
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

/**
 * Stacked horizontal bar chart.
 *
 * @param {string}   canvasId
 * @param {string[]} rowLabels     One per row
 * @param {Array<{ label: string, color: string, values: number[] }>} datasets
 * @param {number|null} xMax
 * @param {Function}    formatter
 * @param {string|null} legendId
 */
export function hStackedBar(canvasId, rowLabels, datasets, xMax, formatter, legendId) {
  const rows = rowLabels.length;
  const heightPx = rows * (BAR_H + BAR_GAP) + PAD_V * 2 + 20;
  const setup = setupCanvas(canvasId, heightPx);
  if (!setup) return;

  const { ctx, w } = setup;
  const c  = C();
  const lW = dynamicLabelW(w);  // FIX [mobile]: responsive label column

  // Compute row totals for auto-scaling
  const rowTotals = rowLabels.map((_, i) =>
    datasets.reduce((sum, ds) => sum + (ds.values[i] ?? 0), 0)
  );
  const max = xMax ?? (Math.max(...rowTotals) * 1.1 || 1);

  const x0 = lW;
  const y0 = PAD_V;
  const pw = w - lW - PAD_RIGHT;
  const ph = rows * (BAR_H + BAR_GAP) - BAR_GAP;

  drawXGrid(ctx, x0, y0, pw, ph, max, c.stone);

  for (let i = 0; i < rows; i++) {
    const barY = y0 + i * (BAR_H + BAR_GAP);

    // Row label — truncated to fit label column
    ctx.save();
    ctx.font         = `13px ${FONT_BODY}`;
    ctx.fillStyle    = c.forest;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    const safeLabel = truncateLabel(ctx, rowLabels[i], lW - 12);  // FIX [mobile]: truncate
    ctx.fillText(safeLabel, x0 - 8, barY + BAR_H / 2);
    ctx.restore();

    // Stacked segments
    let xCursor = x0;
    for (const ds of datasets) {
      const val  = ds.values[i] ?? 0;
      const segW = Math.max(0, (val / max) * pw);
      if (segW < 1) { xCursor += segW; continue; }

      ctx.fillStyle = ds.color;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(xCursor, barY, segW, BAR_H, 3);
      } else {
        ctx.rect(xCursor, barY, segW, BAR_H);
      }
      ctx.fill();
      xCursor += segW;
    }

    // Total value label after the last segment
    ctx.save();
    ctx.font         = `11px ${FONT_MONO}`;
    ctx.fillStyle    = c.ink;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatter(rowTotals[i]), xCursor + 6, barY + BAR_H / 2);
    ctx.restore();
  }

  drawXTickLabels(ctx, x0, y0, pw, ph, max, formatter, c.muted);

  if (legendId) {
    htmlLegend(legendId, datasets.map(ds => ({ label: ds.label, color: ds.color })));
  }
}

// ---------------------------------------------------------------------------
// 8. lineChart — Multi-series smooth line chart
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

/**
 * Multi-series smooth line chart with quadratic bezier curves.
 * Filled gradient area under each series.
 *
 * @param {string}   canvasId
 * @param {string[]} xLabels                 e.g. ['Yr5','Yr10',…]
 * @param {Array<{ label: string, color: string, values: number[] }>} datasets
 * @param {string|null} legendId
 */
export function lineChart(canvasId, xLabels, datasets, legendId) {
  const setup = setupCanvas(canvasId, LINE_H);
  if (!setup) return;

  const { ctx, w, h } = setup;
  const c = C();

  const PAD_L  = 12;
  const PAD_R  = 20;
  const PAD_T  = 20;
  const PAD_B  = 30;

  const pw = w - PAD_L - PAD_R;
  const ph = h - PAD_T - PAD_B;
  const x0 = PAD_L;
  const y0 = PAD_T;

  // Determine Y range across all series
  const allVals  = datasets.flatMap(ds => ds.values);
  const dataMax  = Math.max(...allVals, 1);
  const yMax     = dataMax * 1.1;

  // Horizontal grid lines (5 intervals)
  const gridSteps = 5;
  ctx.save();
  ctx.strokeStyle = c.stone;
  ctx.lineWidth   = 1;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = y0 + ph - (ph / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + pw, y);
    ctx.stroke();
  }
  ctx.restore();

  // X-axis labels
  // FIX [mobile/narrow-canvas]: reduce font on very narrow canvases
  const n = xLabels.length;
  ctx.save();
  ctx.font         = `${w < 300 ? 9 : 11}px ${FONT_MONO}`;
  ctx.fillStyle    = c.muted;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < n; i++) {
    const x = x0 + (i / (n - 1)) * pw;
    ctx.fillText(xLabels[i], x, y0 + ph + 6);
  }
  ctx.restore();

  // Helper: map data value → canvas Y
  const toY = (v) => y0 + ph - (v / yMax) * ph;
  // Helper: map index → canvas X
  const toX = (i) => x0 + (i / (n - 1)) * pw;

  // Draw each series
  for (const ds of datasets) {
    const pts = ds.values.map((v, i) => ({ x: toX(i), y: toY(v) }));

    // Filled gradient area
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle   = ds.color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, y0 + ph);
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      ctx.quadraticCurveTo(cpx, pts[i - 1].y, cpx, (pts[i - 1].y + pts[i].y) / 2);
      ctx.quadraticCurveTo(cpx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.lineTo(pts[pts.length - 1].x, y0 + ph);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Line stroke
    ctx.save();
    ctx.strokeStyle = ds.color;
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      ctx.quadraticCurveTo(cpx, pts[i - 1].y, cpx, (pts[i - 1].y + pts[i].y) / 2);
      ctx.quadraticCurveTo(cpx, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // Point markers — 4px circle
    ctx.save();
    ctx.fillStyle = ds.color;
    for (const pt of pts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (legendId) {
    htmlLegend(legendId, datasets.map(ds => ({ label: ds.label, color: ds.color })));
  }
}

// ---------------------------------------------------------------------------
// 9. radarChart — Radar / spider chart
// ---------------------------------------------------------------------------

/** Draw axis label at (x,y); supports "\\n" for two-line labels (canvas fillText does not wrap). */
function fillRadarAxisLabel(ctx, text, x, y, textAlign) {
  const lines = String(text)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return;
  const m = ctx.font.match(/(\d+)px/);
  const fontPx = m ? parseInt(m[1], 10) : 11;
  const lineHeight = fontPx + 3;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  const mid = (lines.length - 1) / 2;
  for (let li = 0; li < lines.length; li++) {
    ctx.fillText(lines[li], x, y + (li - mid) * lineHeight);
  }
}

/**
 * Radar / spider chart.
 *
 * @param {string}   canvasId
 * @param {string[]} axes      Polygon vertex labels (use "\\n" for short two-line labels)
 * @param {Array<{ label: string, color: string, values: number[] }>} datasets
 *                             Values must be 0–100 each
 * @param {string|null} legendId
 */
export function radarChart(canvasId, axes, datasets, legendId) {
  const sides = axes.length;
  const size  = 340;  // logical px — extra margin so axis labels are not clipped
  const setup = setupCanvas(canvasId, size);
  if (!setup) return;

  // Force a square bitmap regardless of the element's CSS width
  const dpr = window.devicePixelRatio || 1;
  setup.canvas.width  = Math.round(size * dpr);
  setup.canvas.height = Math.round(size * dpr);
  setup.canvas.style.width  = size + 'px';
  setup.canvas.style.height = size + 'px';
  setup.ctx.setTransform(1, 0, 0, 1, 0, 0);
  setup.ctx.scale(dpr, dpr);

  // Use the forced square dimensions
  const { ctx } = setup;
  const w = size;
  const h = size;
  const c    = C();
  const cx   = w / 2;
  const cy   = h / 2;

  // Room for axis labels — inset from canvas edge based on longest line (incl. \n splits)
  const radarFontSize = w < 320 ? 10 : 11;
  ctx.save();
  ctx.font = `${radarFontSize}px ${FONT_BODY}`;
  let maxHalfLabel = 0;
  for (const ax of axes) {
    for (const line of String(ax).split(/\n/)) {
      const t = line.trim();
      if (!t) continue;
      maxHalfLabel = Math.max(maxHalfLabel, ctx.measureText(t).width / 2);
    }
  }
  ctx.restore();
  const labelRadialGap = 14;
  const inset = Math.ceil(maxHalfLabel + labelRadialGap + 18);
  const rMax = Math.max(44, Math.min(w, h) / 2 - Math.max(52, inset));

  // Helper: polar → cartesian, angle 0 at top (−π/2), clockwise
  const vertex = (i, r) => {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  // Concentric rings at 20, 40, 60, 80, 100
  const rings = [20, 40, 60, 80, 100];
  for (const pct of rings) {
    const r = (pct / 100) * rMax;
    ctx.save();
    ctx.strokeStyle = c.stone;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const v = vertex(i, r);
      i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Ring label at the rightmost vertex position (i=1 ≈ right for most counts)
    const labelVertex = vertex(1, r);
    ctx.save();
    ctx.font         = `9px ${FONT_MONO}`;
    ctx.fillStyle    = c.muted;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha  = 0.7;
    ctx.fillText(pct, labelVertex.x + 3, labelVertex.y);
    ctx.restore();
  }

  // Spoke lines (axis lines from centre to outermost vertex)
  for (let i = 0; i < sides; i++) {
    const v = vertex(i, rMax);
    ctx.save();
    ctx.strokeStyle = c.stone;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(v.x, v.y);
    ctx.stroke();
    ctx.restore();
  }

  // Axis labels — just outside the outermost ring (multi-line aware)
  ctx.save();
  ctx.font      = `${radarFontSize}px ${FONT_BODY}`;
  ctx.fillStyle = c.forest;
  for (let i = 0; i < sides; i++) {
    const v     = vertex(i, rMax + labelRadialGap);
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    const cos   = Math.cos(angle);

    // Anchor so text grows toward canvas edge, not off-canvas
    const align =
      Math.abs(cos) < 0.12 ? 'center' : cos > 0 ? 'right' : 'left';
    fillRadarAxisLabel(ctx, axes[i], v.x, v.y, align);
  }
  ctx.restore();

  // Dataset polygons — filled + stroked
  for (const ds of datasets) {
    ctx.save();

    // Filled polygon
    ctx.fillStyle   = ds.color;
    ctx.globalAlpha = 0.30;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const r = ((ds.values[i] ?? 0) / 100) * rMax;
      const v = vertex(i, r);
      i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y);
    }
    ctx.closePath();
    ctx.fill();

    // Stroke
    ctx.globalAlpha  = 1;
    ctx.strokeStyle  = ds.color;
    ctx.lineWidth    = 2;
    ctx.lineJoin     = 'round';
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const r = ((ds.values[i] ?? 0) / 100) * rMax;
      const v = vertex(i, r);
      i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Vertex dots
    ctx.fillStyle   = ds.color;
    ctx.globalAlpha = 1;
    for (let i = 0; i < sides; i++) {
      const r = ((ds.values[i] ?? 0) / 100) * rMax;
      const v = vertex(i, r);
      ctx.beginPath();
      ctx.arc(v.x, v.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  if (legendId) {
    htmlLegend(legendId, datasets.map(ds => ({ label: ds.label, color: ds.color })));
  }
}

// ---------------------------------------------------------------------------
// 10. clearCharts — reset all known canvases
// ---------------------------------------------------------------------------

/** Canvas IDs managed by this module */
const CHART_IDS = [
  'chart-carbon',
  'chart-revenue',
  'chart-radar',
  'chart-sepa',
  'chart-crew',
];

/**
 * Clear all registered chart canvases back to blank.
 * Also clears any associated HTML legend elements.
 * Called on reset / new calculation start.
 */
export function clearCharts() {
  for (const id of CHART_IDS) {
    const canvas = document.getElementById(id);
    if (!canvas) continue;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  // Clear any legend containers
  const legends = document.querySelectorAll('[id$="-legend"]');
  for (const el of legends) el.innerHTML = '';
}
