import { useCallback, useEffect, useRef, useState } from 'react';
import { closePdf, openPdf, openPdfBytes, PdfError, renderPage, type PDFDocumentProxy } from '../lib/pdf';
import { clearPrefs } from '../lib/prefs';
import { forgetRecentDeck, loadRecentDeck, saveRecentDeck, type RecentDeck } from '../lib/recent';
import { Lockup } from './Brand';
import { GestureList } from './GestureCards';
import { Icon } from './Icon';
import { Scribble } from './Scribble';
import { SlideDemo } from './SlideDemo';
import { SlideCanvas } from './SlideCanvas';
import InteractiveGridBackground from './InteractiveGridBackground';

interface LoadedDeck {
  doc: PDFDocumentProxy;
  name: string;
  thumb: ImageBitmap;
  startPage: number;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; name: string }
  | { kind: 'ready'; deck: LoadedDeck }
  | { kind: 'error'; message: string };

const thumbOf = (doc: PDFDocumentProxy, page: number) => renderPage(doc, page, 1280, 720, Math.min(window.devicePixelRatio || 1, 2)).then(r => r.bitmap);

/** The launcher: a sheet of paper with the app's own annotations. Open a PDF, check the gestures, present. */
export function Home({ onPresent }: { onPresent: (doc: PDFDocumentProxy, name: string, startPage: number) => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The last deck, to pick up where the presentation stopped.
  const [recent, setRecent] = useState<RecentDeck | null>(null);
  useEffect(() => {
    let alive = true;
    loadRecentDeck().then(deck => {
      if (alive) setRecent(deck);
    });
    return () => {
      alive = false;
    };
  }, []);

  const release = () => {
    const previous = stateRef.current;
    if (previous.kind === 'ready') {
      previous.deck.thumb.close();
      closePdf(previous.deck.doc);
    }
  };

  const openFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    release();
    setState({ kind: 'loading', name: file.name });
    try {
      const { doc, bytes } = await openPdf(file);
      const name = file.name.replace(/\.pdf$/i, '');
      setState({ kind: 'ready', deck: { doc, name, thumb: await thumbOf(doc, 1), startPage: 1 } });
      const deck = { name, bytes, pages: doc.numPages, page: 1 };
      if (await saveRecentDeck(deck)) setRecent({ ...deck, savedAt: Date.now() });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof PdfError ? err.message : 'Couldn’t open this PDF.' });
    }
  }, []);

  const resume = async () => {
    if (!recent) return;
    release();
    setState({ kind: 'loading', name: recent.name });
    try {
      const doc = await openPdfBytes(recent.bytes);
      const startPage = Math.min(Math.max(recent.page, 1), doc.numPages);
      setState({ kind: 'ready', deck: { doc, name: recent.name, thumb: await thumbOf(doc, startPage), startPage } });
    } catch {
      forgetRecentDeck();
      setRecent(null);
      setState({ kind: 'error', message: 'The saved PDF won’t open anymore. Choose the file again.' });
    }
  };

  const fromFirstSlide = async () => {
    const current = stateRef.current;
    if (current.kind !== 'ready') return;
    const thumb = await thumbOf(current.deck.doc, 1);
    current.deck.thumb.close();
    setState({ kind: 'ready', deck: { ...current.deck, thumb, startPage: 1 } });
  };

  // Accept a drop anywhere in the window.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(depth - 1, 0);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      openFile(e.dataTransfer?.files[0]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [openFile]);

  /** Must run inside a click so the browser counts it as a user gesture for fullscreen. */
  const startPresenting = () => {
    const current = stateRef.current;
    if (current.kind !== 'ready') return;
    const { doc, name, thumb, startPage } = current.deck;
    document.documentElement.requestFullscreen?.().catch(() => {});
    thumb.close();
    onPresent(doc, name, startPage);
  };

  const present = () => {
    startPresenting();
  };

  const forgetData = async () => {
    clearPrefs();
    await forgetRecentDeck();
    window.location.reload();
  };

  const choose = () => inputRef.current?.click();
  const pages = state.kind === 'ready' ? state.deck.doc.numPages : 0;

  return (
    <div className="home paper">
      <InteractiveGridBackground />

      {/* Floating Geometric Neubrutalist Background Shapes */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
        <div className="float-a" style={{
          position: 'absolute', top: '9%', left: '3%', width: 75, height: 75, background: '#FBBF24',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', opacity: 0.65, border: '2px solid #0a0a0a', transform: 'rotate(15deg)'
        }} />
        <div className="float-b" style={{
          position: 'absolute', top: '12%', right: '5%', width: 65, height: 65, background: '#60A5FA',
          clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)', opacity: 0.6, border: '2px solid #0a0a0a'
        }} />
        <div className="float-c" style={{
          position: 'absolute', top: '46%', left: '1.5%', width: 55, height: 55, background: '#A78BFA',
          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)', opacity: 0.55, border: '2px solid #0a0a0a'
        }} />
        <div className="float-a" style={{
          position: 'absolute', bottom: '8%', right: '3.5%', width: 50, height: 50, background: '#34D399',
          clipPath: 'polygon(33% 0%,66% 0%,66% 33%,100% 33%,100% 66%,66% 66%,66% 100%,33% 100%,33% 66%,0% 66%,0% 33%,33% 33%)', opacity: 0.6, border: '2px solid #0a0a0a'
        }} />
        <div className="float-b" style={{
          position: 'absolute', bottom: '5%', left: '5%', width: 85, height: 65, background: '#F472B6',
          clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)', opacity: 0.55, border: '2px solid #0a0a0a'
        }} />
        <div className="float-c" style={{
          position: 'absolute', top: '65%', right: '9%', width: 60, height: 60, background: '#FCD34D',
          clipPath: 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)', opacity: 0.6, border: '2px solid #0a0a0a'
        }} />
      </div>

      <header className="home-bar">
        <Lockup size={24} />
      </header>

      <main className="home-main">
        <section className="home-hero">
          <p className="label">Gesture-controlled presentations · right in your browser</p>
          <h1 className="display home-title">
            Present
            <br />
            with your{' '}
            <span className="scribbled">
              hands
              <Scribble kind="ellipse" delay={350} />
            </span>
            .
          </h1>
          <p className="home-lead">Present and change slides hands-free using natural gestures through your computer’s camera.</p>

          <div className={`sheet${dragging ? ' is-dragging' : ''}`} data-state={state.kind}>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={e => {
                openFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            {state.kind === 'idle' && (
              <div className="sheet-idle">
              <div className="sheet-body">
                {recent && !dragging && (
                  <div className="resume">
                    <span className="resume-icon">
                      <Icon name="file" size={18} />
                    </span>
                    <span className="resume-text">
                      <b className="truncate">{recent.name}</b>
                      <span className="mono">
                        stopped at slide {recent.page} of {recent.pages}
                      </span>
                    </span>
                    <button className="btn btn-quiet btn-small" type="button" onClick={resume}>
                      Resume
                    </button>
                  </div>
                )}
                <h2 className="display sheet-title">
                  {dragging ? (
                    'Let it go.'
                  ) : (
                    <>
                      Drop a PDF <span className="hl">here</span>.
                    </>
                  )}
                </h2>
                <p>Or pick one from your computer. The file never leaves this device.</p>
                <div className="sheet-actions">
                  <button className="btn btn-primary btn-big" type="button" onClick={choose}>
                    <Icon name="file" size={18} /> Choose PDF
                  </button>
                  <span className="mono sheet-hint">Exported from PowerPoint, Keynote, Canva or Google Slides</span>
                </div>
              </div>
              <SlideDemo />
              </div>
            )}

            {state.kind === 'loading' && (
              <div className="sheet-body is-center" role="status">
                <span className="spinner" aria-hidden="true" />
                <h2 className="display sheet-title is-small">Opening the PDF</h2>
                <span className="mono truncate">{state.name}</span>
              </div>
            )}

            {state.kind === 'error' && (
              <div className="sheet-body" role="alert">
                <h2 className="display sheet-title is-error">{state.message}</h2>
                <p>{dragging ? 'Let it go.' : 'Drop another file or choose again.'}</p>
                <div className="sheet-actions">
                  <button className="btn btn-quiet" type="button" onClick={choose}>
                    Choose another PDF
                  </button>
                </div>
              </div>
            )}

            {state.kind === 'ready' && (
              <div className="deck-ready">
                <figure className="deck-photo">
                  <SlideCanvas bitmap={state.deck.thumb} width="auto" height="auto" />
                </figure>
                <div className="deck-info">
                  <span className="label">Ready to present</span>
                  <h2 className="display deck-name">{state.deck.name}</h2>
                  <span className="mono deck-meta">
                    {pages} {pages === 1 ? 'slide' : 'slides'}
                    {state.deck.startPage > 1 && ` · resumes at slide ${state.deck.startPage}`}
                  </span>
                  <div className="deck-go">
                    <button className="btn btn-primary btn-big" type="button" onClick={present} autoFocus>
                      Present <Icon name="arrowRight" size={18} />
                    </button>
                    <Scribble kind="arrow" delay={450} />
                  </div>
                  <p className="deck-note">The camera and fullscreen turn on when you start.</p>
                  <div className="deck-links">
                    {state.deck.startPage > 1 && (
                      <button className="link" type="button" onClick={fromFirstSlide}>
                        Start from slide 1
                      </button>
                    )}
                    <button className="link" type="button" onClick={choose}>
                      Change file
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <ol className="home-steps">
            <li data-done={state.kind === 'ready'}>
              <span className="step-num">1</span>
              <span>Open a PDF</span>
            </li>
            <li>
              <span className="step-num">2</span>
              <span>Allow camera access</span>
            </li>
            <li>
              <span className="step-num">3</span>
              <span>Present with gestures</span>
            </li>
          </ol>
        </section>

        <aside className="home-index" aria-label="Gestures">
          <header className="index-head">
            <h2 className="display">Gestures</h2>
          </header>
          <div className="index-scroll">
            <GestureList />
          </div>
          <footer className="index-foot">
            <div>
              <Icon name="sun" size={16} />
              <span>Light in front of you, hand at chest height, 1–2 m from the camera.</span>
            </div>
            <div>
              <Icon name="shield" size={16} />
              <span>
                Your PDF, camera and hand data stay on this computer.{' '}
                <button className="link" type="button" onClick={forgetData}>
                  Delete my data
                </button>
              </span>
            </div>
            <div>
              <Icon name="github" size={16} />
              <span>
                Built by{' '}
                <a className="link" href="https://github.com/Abhrxdip" target="_blank" rel="noopener noreferrer">
                  Abhrxdip
                </a>
              </span>
            </div>
          </footer>
        </aside>
      </main>
    </div>
  );
}
