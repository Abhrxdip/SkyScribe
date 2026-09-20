import type { CameraStatus } from '../hooks/useHandTracking';
import type { TrackingState } from '../lib/gestures';
import { Icon } from './Icon';

type ChipState = 'ok' | 'search' | 'lost' | 'off';

export function trackingChip(cameraOn: boolean, status: CameraStatus, tracking: TrackingState): { state: ChipState; text: string } {
  if (!cameraOn) return { state: 'off', text: 'Camera off' };
  switch (status) {
    case 'off':
    case 'starting':
      return { state: 'search', text: 'Starting camera' };
    case 'denied':
      return { state: 'lost', text: 'Camera blocked' };
    case 'unavailable':
      return { state: 'lost', text: 'No camera' };
    case 'error':
      return { state: 'lost', text: 'Tracking failed' };
  }
  if (tracking === 'tracking') return { state: 'ok', text: 'Hand detected' };
  if (tracking === 'lost') return { state: 'lost', text: 'Hand lost' };
  return { state: 'search', text: 'Looking for hand' };
}

interface HudProps {
  visible: boolean;
  chip: { state: ChipState; text: string };
  page: number;
  total: number;
  cameraOn: boolean;
  isFullscreen: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCamera: () => void;
  onFullscreen: () => void;
  onExit: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function Hud(props: HudProps) {
  const { visible, chip, page, total } = props;

  return (
    <div className={`hud${visible ? '' : ' is-hidden'}`}>
      <div className="hudbar" aria-live="polite">
        <span className="chip" data-state={chip.state}>
          <i />
          {chip.text}
        </span>
        <span className="hud-div" />
        <button
          className="icon-btn"
          type="button"
          onClick={props.onPrev}
          disabled={page <= 1}
          title="Previous slide (←)"
          style={{ width: 28, height: 28, padding: 0 }}
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <span className="chip mono">{`${pad2(Math.min(page, total))} / ${pad2(total)}`}</span>
        <button
          className="icon-btn"
          type="button"
          onClick={props.onNext}
          disabled={page >= total}
          title="Next slide (→)"
          style={{ width: 28, height: 28, padding: 0 }}
        >
          <Icon name="arrowRight" size={16} />
        </button>
      </div>

      <div className="hudbar">
        <button className="icon-btn" type="button" onClick={props.onCamera} title={props.cameraOn ? 'Turn camera off' : 'Turn camera on'}>
          <Icon name={props.cameraOn ? 'camera' : 'cameraOff'} />
        </button>
        <button className="icon-btn" type="button" onClick={props.onFullscreen} title="Fullscreen (F)">
          <Icon name={props.isFullscreen ? 'shrink' : 'expand'} />
        </button>
        <span className="hud-div" />
        <button className="icon-btn" type="button" onClick={props.onExit} title="Exit presentation (Esc)">
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
