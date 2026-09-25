import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useMotionValueEvent, useSpring } from 'motion/react';
import { renderPage, type PDFDocumentProxy } from '../lib/pdf';
import { DEFAULT_REACH, GestureEngine, type PointerTool, type Tool, type TrackingState } from '../lib/gestures';
import { GestureController, type ControllerActions, type SlideSpace } from '../lib/controller';
import { InkLayer } from '../lib/ink';
import { useHandTracking, type HandFrame } from '../hooks/useHandTracking';
import { OverlayRenderer } from '../lib/overlay';
import { loadPrefs, savePrefs, type Prefs } from '../lib/prefs';
import { SMOOTHING } from '../lib/oneEuro';
import { resolveInk, slideSurface, type Surface } from '../lib/contrast';
import { debugLog } from '../lib/debug';
import { Mark, Wordmark } from './Brand';
import { Hud, trackingChip } from './Hud';
import { SlideCanvas } from './SlideCanvas';

const STAGE_PAD = 20;
const HUD_HIDE_MS = 3000;
const GLIDE = [0.22, 1, 0.36, 1] as const;

interface CacheEntry {
  bitmap: ImageBitmap;
  aspect: number;
  key: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const fmtZoom = (v: number) => `${v.toFixed(1)}×`;
const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const slideVariants = {
  enter: (dir: number) => ({ x: `${dir * 8}%`, opacity: 0 }),
  center: { x: '0%', opacity: 1 },
  exit: (dir: number) => ({ x: `${dir * -16}%`, opacity: 0 }),
};

interface PresenterProps {
  doc: PDFDocumentProxy;
  name: string;
  startPage?: number;
  onPage?: (page: number) => void;
  onExit: () => void;
}

export function Presenter({ doc, name, startPage = 1, onPage, onExit }: PresenterProps) {
  const total = doc.numPages;

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  const updatePrefs = useCallback((next: Prefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  const [page, setPage] = useState(() => Math.min(Math.max(startPage, 1), total));
  const pageRef = useRef(page);
  const [board, setBoard] = useState(false);
  const boardRef = useRef(board);
  const [dir, setDir] = useState(1);
  const [cameraOn, setCameraOn] = useState(true);
  const [pointerTool, setPointerTool] = useState<PointerTool>(() => prefs.pointerTool);
  const [tool, setTool] = useState<Tool | null>(null);
  const [surface, setSurface] = useState<Surface>('light');
  const [tracking, setTracking] = useState<TrackingState>('searching');
  const trackingRef = useRef<TrackingState>('searching');
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  const [toast, setToast] = useState<string | null>(null);

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<OverlayRenderer | null>(null);
  const inkRef = useRef<InkLayer | null>(null);
  const controllerRef = useRef<GestureController | null>(null);

  useEffect(() => {
    document.title = `${name} · SkyScribe`;
    return () => {
      document.title = 'SkyScribe';
    };
  }, [name]);

  /* ---------- HUD auto-hide and toasts ---------- */
  const [hudVisible, setHudVisible] = useState(true);
  const hideTimer = useRef(0);
  const poke = useCallback(() => {
    setHudVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHudVisible(false), HUD_HIDE_MS);
  }, []);
  useEffect(() => {
    poke();
    return () => window.clearTimeout(hideTimer.current);
  }, [poke]);

  const toastTimer = useRef(0);
  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /* ---------- viewport and page rendering ---------- */
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setViewport({ w: window.innerWidth, h: window.innerHeight }), 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const boxW = Math.max(viewport.w - STAGE_PAD * 2, 120);
  const boxH = Math.max(viewport.h - STAGE_PAD * 2, 90);
  const renderKey = `${boxW}x${boxH}`;
  const renderKeyRef = useRef(renderKey);
  useEffect(() => {
    renderKeyRef.current = renderKey;
  }, [renderKey]);

  const cacheRef = useRef(new Map<number, CacheEntry>());
  const inflightRef = useRef(new Map<string, Promise<void>>());
  const [, setCacheVersion] = useState(0);
  const [baseAspect, setBaseAspect] = useState(16 / 9);

  useEffect(() => {
    doc.getPage(1).then(p => {
      const v = p.getViewport({ scale: 1 });
      setBaseAspect(v.width / v.height);
    });
  }, [doc]);

  useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;
    const inflight = inflightRef.current;
    const density = Math.min(window.devicePixelRatio || 1, 2) * 1.5;
    const wanted = [page, page + 1, page - 1, page + 2].filter(n => n >= 1 && n <= total);

    (async () => {
      for (const [i, n] of wanted.entries()) {
        if (i === 1) await sleep(450);
        if (cancelled) return;
        if (cache.get(n)?.key === renderKey) continue;
        const id = `${n}@${renderKey}`;
        let job = inflight.get(id);
        if (!job) {
          job = renderPage(doc, n, boxW, boxH, density)
            .then(({ bitmap, aspect }) => {
              if (renderKeyRef.current !== renderKey) {
                bitmap.close();
                return;
              }
              const old = cache.get(n);
              cache.set(n, { bitmap, aspect, key: renderKey });
              old?.bitmap.close();
              setCacheVersion(v => v + 1);
            })
            .catch(() => {})
            .finally(() => inflight.delete(id));
          inflight.set(id, job);
        }
        await job;
      }
      for (const [n, entry] of cache) {
        if (Math.abs(n - pageRef.current) > 3) {
          entry.bitmap.close();
          cache.delete(n);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page, total, renderKey, boxW, boxH]);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      cache.forEach(entry => entry.bitmap.close());
      cache.clear();
    };
  }, []);

  const entry = page <= total ? cacheRef.current.get(page) : undefined;
  const aspect = entry?.aspect ?? baseAspect;
  const slideW = Math.min(boxW, boxH * aspect);
  const slideH = slideW / aspect;

  useEffect(() => {
    if (board) {
      setSurface('dark');
      return;
    }
    if (!entry) return;
    setSurface(slideSurface(entry.bitmap));
  }, [board, entry]);

  /* ---------- zoom ---------- */
  const zoomTarget = useMotionValue(1);
  const zoom = useSpring(zoomTarget, { stiffness: 220, damping: 28, mass: 0.9 });
  const originX = useMotionValue(window.innerWidth / 2);
  const originY = useMotionValue(window.innerHeight / 2);
  const transformOrigin = useMotionTemplate`${originX}px ${originY}px`;
  const [zoomText, setZoomText] = useState('1.0×');
  useMotionValueEvent(zoom, 'change', v => setZoomText(fmtZoom(v)));

  const setZoomLevel = useCallback(
    (level: number, ox?: number, oy?: number, follow = false) => {
      const clamped = clamp(level, 1, 3);
      if (ox !== undefined && oy !== undefined) {
        if (!follow || zoomTarget.get() === 1) {
          originX.jump(ox);
          originY.jump(oy);
        } else {
          originX.set(ox);
          originY.set(oy);
        }
      }
      zoomTarget.set(clamped);
    },
    [originX, originY, zoomTarget],
  );

  /* ---------- navigation ---------- */
  const goTo = useCallback(
    (target: number) => {
      const next = clamp(target, 1, total + 1);
      const current = pageRef.current;
      if (next === current && !boardRef.current) return false;
      setDir(next > current ? 1 : -1);
      pageRef.current = next;
      setPage(next);
      boardRef.current = false;
      setBoard(false);
      setZoomLevel(1);
      inkRef.current?.setPage(`p${next}`);
      return true;
    },
    [setZoomLevel, total],
  );

  const turn = useCallback(
    (delta: 1 | -1) => {
      if (boardRef.current) {
        boardRef.current = false;
        setBoard(false);
        inkRef.current?.setPage(`p${pageRef.current}`);
        return;
      }
      if (!goTo(pageRef.current + delta)) {
        showToast(delta > 0 ? 'End of presentation' : 'First slide');
      }
    },
    [goTo, showToast],
  );

  const toggleBoard = useCallback(() => {
    boardRef.current = !boardRef.current;
    setBoard(boardRef.current);
    inkRef.current?.setPage(boardRef.current ? 'board' : `p${pageRef.current}`);
  }, []);

  useEffect(() => {
    onPage?.(Math.min(page, total));
  }, [onPage, page, total]);

  /* ---------- canvases: ink and overlay ---------- */
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const overlay = new OverlayRenderer(canvas, 10);
    overlayRef.current = overlay;
    return () => {
      overlay.destroy();
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const ink = new InkLayer(canvas);
    inkRef.current = ink;
    ink.setPage(boardRef.current ? 'board' : `p${pageRef.current}`);
    return () => {
      ink.destroy();
      inkRef.current = null;
    };
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const inkChoice = prefs.inkColor;
    const resolved = resolveInk(inkChoice, surface);
    overlay.setTheme(surface, resolved);
    inkRef.current?.setColor(resolved);
  }, [prefs.inkColor, surface]);

  const slideSpace = useCallback((): SlideSpace => {
    const el = inkCanvasRef.current;
    const rect = el?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
    const z = zoom.get();
    return {
      screen: () => ({ width: window.innerWidth, height: window.innerHeight }),
      toSlide: (x: number, y: number) => ({
        x: (x - rect.left) / (rect.width || 1),
        y: (y - rect.top) / (rect.height || 1),
      }),
      pxPerUnit: () => rect.width * z,
    };
  }, [zoom]);

  /* ---------- controller setup ---------- */
  useEffect(() => {
    const engine = new GestureEngine({
      smoothing: SMOOTHING[prefs.smoothing],
      reach: prefs.profile?.reach ?? DEFAULT_REACH,
      pointerTool: prefs.pointerTool,
    });
    const controller = new GestureController(engine);
    controllerRef.current = controller;
  }, [prefs.profile, prefs.smoothing, prefs.pointerTool]);

  useEffect(() => {
    controllerRef.current?.engine.setPointerTool(pointerTool);
  }, [pointerTool]);

  const actions: ControllerActions = {
    next: () => turn(1),
    prev: () => turn(-1),
    zoom: (level, ox, oy, follow) => setZoomLevel(level, ox, oy, follow),
    resetZoom: () => setZoomLevel(1),
    clear: () => inkRef.current?.clearPage(),
    history: (kind, done) => {
      if (done) showToast(kind === 'undo' ? 'Undo' : 'Redo');
    },
  };

  /* ---------- hand tracking loop ---------- */
  const onFrame = useCallback(
    (f: HandFrame) => {
      const controller = controllerRef.current;
      const overlay = overlayRef.current;
      const ink = inkRef.current;
      if (!controller || !overlay || !ink) return;

      const space = slideSpace();
      const res = controller.update(f, space, actions);
      const out = res.out;

      setTool(out.tool);
      if (trackingRef.current !== out.tracking) {
        trackingRef.current = out.tracking;
        setTracking(out.tracking);
      }

      overlay.setZoom(zoom.get(), originX.get(), originY.get());
      overlay.render(out);

      if (res.erased) poke();
    },
    [actions, originX, originY, poke, slideSpace, zoom],
  );

  const { status: cameraStatus } = useHandTracking(onFrame, cameraOn);

  /* ---------- keyboard controls ---------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      poke();

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          turn(1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          turn(-1);
          break;
        case 'b':
        case 'B':
          toggleBoard();
          break;
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) inkRef.current?.redo();
            else inkRef.current?.undo();
          } else {
            inkRef.current?.undo();
          }
          break;
        case 'y':
        case 'Y':
          inkRef.current?.redo();
          break;
        case 'e':
        case 'E':
          inkRef.current?.clearPage();
          break;
        case '+':
        case '=':
          setZoomLevel(zoomTarget.get() + 0.5);
          break;
        case '-':
        case '_':
          setZoomLevel(zoomTarget.get() - 0.5);
          break;
        case '0':
          setZoomLevel(1);
          break;
        case 'c':
        case 'C':
          setCameraOn(v => !v);
          break;
        case 'f':
        case 'F':
          if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
          break;
        case 'Escape':
          onExit();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExit, poke, setZoomLevel, toggleBoard, turn, zoomTarget]);

  const chip = trackingChip(cameraOn, cameraStatus, tracking);
  const chromeVisible = hudVisible;

  return (
    <div className={`presenter${chromeVisible ? '' : ' is-idle'}`}>
      <motion.div className="zoom-layer" style={{ scale: zoom, transformOrigin }}>
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={board ? 'board' : page}
            className="slide-frame"
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.42, ease: GLIDE }}
            style={{ width: slideW, height: slideH }}
          >
            {board ? (
              <div className="board">
                <span className="board-mark">
                  <Mark size={18} />
                  <Wordmark />
                </span>
              </div>
            ) : page > total ? (
              <div className="end-card">
                <Mark size={44} />
                <h2>End of presentation</h2>
                <p>{name}</p>
                <span className="mono">Two fingers pointing left or ← to go back · Esc to exit</span>
              </div>
            ) : entry ? (
              <SlideCanvas bitmap={entry.bitmap} width={slideW} height={slideH} className="slide" />
            ) : (
              <div className="slide-loading" role="status" aria-label="Loading slide" />
            )}
          </motion.div>
        </AnimatePresence>
        <canvas ref={inkCanvasRef} className="ink" style={{ width: slideW, height: slideH }} aria-hidden="true" />
      </motion.div>

      <Hud
        visible={chromeVisible}
        chip={chip}
        page={page}
        total={total}
        zoomText={zoomText}
        tool={tool}
        pointerTool={pointerTool}
        board={board}
        cameraOn={cameraOn}
        isFullscreen={isFullscreen}
        panel={null}
        onMenu={() => {}}
        onHelp={() => {}}
        onTrain={() => {}}
        onSettings={() => {}}
        onCamera={() => setCameraOn(v => !v)}
        onFullscreen={() => {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        }}
        onExit={onExit}
      />

      <canvas ref={overlayCanvasRef} className="overlay overlay-top" aria-hidden="true" />

      <div className={`rail${chromeVisible ? '' : ' is-hidden'}`} aria-hidden="true">
        <div style={{ transform: `scaleX(${Math.min(page, total) / total})` }} />
      </div>

      <div className="toasts" aria-live="polite">
        {toast && <div className="toast toast-hint">{toast}</div>}
      </div>
    </div>
  );
}
