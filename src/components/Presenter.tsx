import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { renderPage, type PDFDocumentProxy } from '../lib/pdf';
import { GestureEngine, type TrackingState } from '../lib/gestures';
import { useHandTracking, type HandFrame } from '../hooks/useHandTracking';
import { Mark } from './Brand';
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
  const [engine] = useState(() => new GestureEngine());

  const [page, setPage] = useState(() => Math.min(Math.max(startPage, 1), total));
  const pageRef = useRef(page);
  const [dir, setDir] = useState(1);
  const [cameraOn, setCameraOn] = useState(true);
  const [tracking, setTracking] = useState<TrackingState>('searching');
  const trackingRef = useRef<TrackingState>('searching');
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  const [toast, setToast] = useState<string | null>(null);
  const [navFlash, setNavFlash] = useState<'left' | 'right' | null>(null);

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
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
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
        if (i === 1) await sleep(400);
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

  /* ---------- navigation ---------- */
  const goTo = useCallback(
    (target: number) => {
      const next = clamp(target, 1, total + 1);
      const current = pageRef.current;
      if (next === current) return false;
      setDir(next > current ? 1 : -1);
      pageRef.current = next;
      setPage(next);
      return true;
    },
    [total],
  );

  const turn = useCallback(
    (delta: 1 | -1) => {
      setNavFlash(delta > 0 ? 'right' : 'left');
      setTimeout(() => setNavFlash(null), 400);
      if (!goTo(pageRef.current + delta)) {
        showToast(delta > 0 ? 'End of presentation' : 'First slide');
      }
    },
    [goTo, showToast],
  );

  useEffect(() => {
    onPage?.(Math.min(page, total));
  }, [onPage, page, total]);

  /* ---------- hand tracking ---------- */
  const onFrame = useCallback(
    (f: HandFrame) => {
      const out = engine.update({
        hands: f.hands,
        aspect: f.aspect,
        t: f.t,
        width: window.innerWidth,
        height: window.innerHeight,
      });

      if (out.tracking !== trackingRef.current) {
        trackingRef.current = out.tracking;
        setTracking(out.tracking);
        if (out.tracking === 'lost') poke();
      }

      for (const ev of out.events) {
        if (ev.type === 'next') {
          turn(1);
          poke();
        } else if (ev.type === 'prev') {
          turn(-1);
          poke();
        }
      }
    },
    [engine, poke, turn],
  );

  const cameraStatus = useHandTracking(cameraOn, onFrame);

  useEffect(() => {
    if (cameraOn) return;
    trackingRef.current = 'searching';
    setTracking('searching');
  }, [cameraOn]);

  /* ---------- fullscreen ---------- */
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => showToast('Browser blocked fullscreen'));
  }, [showToast]);

  /* ---------- keyboard navigation ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, button')) return;
      poke();

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
        case 'Enter':
        case 'n':
          e.preventDefault();
          turn(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
        case 'p':
          e.preventDefault();
          turn(-1);
          break;
        case 'Home':
          goTo(1);
          break;
        case 'End':
          goTo(total);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'c':
        case 'C':
          setCameraOn(v => !v);
          break;
        case 'Escape':
          if (!document.fullscreenElement) onExit();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, onExit, poke, toggleFullscreen, total, turn]);

  const chip = trackingChip(cameraOn, cameraStatus, tracking);

  return (
    <div className={`presenter${hudVisible ? '' : ' is-idle'}`} onPointerMove={poke} onClick={poke}>
      <div className="zoom-layer">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={page}
            className="slide-frame"
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.38, ease: GLIDE }}
            style={{ width: slideW, height: slideH }}
          >
            {page > total ? (
              <div className="end-card">
                <Mark size={44} />
                <h2>End of presentation</h2>
                <p>{name}</p>
                <span className="mono">Point left or press ← to return · Esc to exit</span>
              </div>
            ) : entry ? (
              <SlideCanvas bitmap={entry.bitmap} width={slideW} height={slideH} className="slide" />
            ) : (
              <div className="slide-loading" role="status" aria-label="Loading slide" />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {navFlash && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            [navFlash === 'right' ? 'right' : 'left']: '32px',
            transform: 'translateY(-50%)',
            background: 'rgba(10, 10, 10, 0.75)',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '15px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 100,
            pointerEvents: 'none',
            border: '2px solid #0a0a0a',
          }}
        >
          {navFlash === 'right' ? 'Next Slide →' : '← Previous Slide'}
        </div>
      )}

      <Hud
        visible={hudVisible}
        chip={chip}
        page={page}
        total={total}
        cameraOn={cameraOn}
        isFullscreen={isFullscreen}
        onPrev={() => turn(-1)}
        onNext={() => turn(1)}
        onCamera={() => setCameraOn(v => !v)}
        onFullscreen={toggleFullscreen}
        onExit={onExit}
      />

      <div className={`rail${hudVisible ? '' : ' is-hidden'}`} aria-hidden="true">
        <div style={{ transform: `scaleX(${Math.min(page, total) / total})` }} />
      </div>

      <div className="toasts" aria-live="polite">
        {toast && <div className="toast toast-hint">{toast}</div>}
      </div>
    </div>
  );
}
