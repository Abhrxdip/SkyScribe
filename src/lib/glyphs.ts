/**
 * Gesture glyphs in the Hand Landmarker style: dots and bones, never drawn hands.
 * Ported from brand/brand-kit.html. Output is static SVG markup.
 */
type Pt = [number, number];
type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
type FingerPose = 'open' | 'shut' | Pt;
type HandPose = Record<Finger, FingerPose>;

const FINGERS: Finger[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const BASE: Record<Finger | 'wrist', Pt> = { wrist: [32, 54], thumb: [24, 46], index: [26, 33], middle: [31.5, 31], ring: [37, 32.5], pinky: [42, 36] };
const OPEN: Record<Finger, Pt> = { thumb: [11, 35], index: [20, 11], middle: [32, 7], ring: [43.5, 10], pinky: [53, 20] };
const SHUT: Record<Finger, Pt> = { thumb: [31, 41], index: [27, 26.5], middle: [32, 24.5], ring: [37.5, 26], pinky: [43.5, 30.5] };

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const all = (p: FingerPose) => Object.fromEntries(FINGERS.map(f => [f, p])) as HandPose;

function hand(pose: HandPose, { x = 0, y = 0, s = 1, hi = [] as Finger[] } = {}) {
  const line = (a: Pt, b: Pt) => `<line class="g-bone" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
  const dot = (p: Pt, rad: number, c = 'g-joint') => `<circle class="${c}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${rad}"/>`;
  let bones = line(BASE.wrist, BASE.thumb) + line(BASE.wrist, BASE.index) + line(BASE.wrist, BASE.pinky)
    + line(BASE.index, BASE.middle) + line(BASE.middle, BASE.ring) + line(BASE.ring, BASE.pinky);
  let dots = dot(BASE.wrist, 1.9);
  let tips = '';
  for (const f of FINGERS) {
    const p = pose[f];
    const b = BASE[f];
    const tip = Array.isArray(p) ? p : p === 'open' ? OPEN[f] : SHUT[f];
    bones += line(b, tip);
    dots += dot(b, 1.5) + dot(lerp(b, tip, 0.45), 1.25) + dot(lerp(b, tip, 0.74), 1.25);
    if (hi.includes(f)) tips += dot(tip, 5.5, 'g-halo') + dot(tip, 2.4, 'g-hot');
    else dots += dot(tip, 1.9);
  }
  return `<g transform="translate(${x} ${y}) scale(${s})">${bones}${dots}${tips}</g>`;
}

const arrow = (x1: number, x2: number, y = 32) => `<path class="g-arrow" d="M${x1} ${y}H${x2}m-5 -5 5 5 -5 5"/>`;

const twoSide: HandPose = { ...all('shut'), index: [58, 27], middle: [60, 34] };

export interface GestureGuide {
  id: string;
  name: string;
  how: string;
  detail: string;
  svg: string;
}

export const GESTURE_GUIDE: GestureGuide[] = [
  {
    id: 'next',
    name: 'Next Slide',
    how: 'Point index and middle fingers to the right.',
    detail: 'Advance forward one slide smoothly.',
    svg: hand(twoSide, { x: 18, hi: ['index', 'middle'] }) + arrow(100, 156),
  },
  {
    id: 'prev',
    name: 'Previous Slide',
    how: 'Point index and middle fingers to the left.',
    detail: 'Return to the previous slide.',
    svg: hand(twoSide, { x: 18, hi: ['index', 'middle'] }) + arrow(156, 100),
  },
];

export const SHORTCUTS: [string[], string][] = [
  [['→', 'Space'], 'Next slide'],
  [['←'], 'Previous slide'],
  [['C'], 'Toggle camera'],
  [['F'], 'Fullscreen'],
  [['Esc'], 'Exit presentation'],
];

