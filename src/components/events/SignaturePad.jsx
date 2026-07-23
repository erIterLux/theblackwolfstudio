import { Eraser } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 260;

export default function SignaturePad({ value, onChange, disabled = false }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [hasSignature, setHasSignature] = useState(Boolean(value));

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 5;
    context.strokeStyle = '#151515';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = value;
    }
  }, [value]);

  useEffect(() => {
    prepareCanvas();
  }, [prepareCanvas]);

  const pointForEvent = (event) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const start = (event) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointForEvent(event);
  };

  const move = (event) => {
    if (disabled || !drawingRef.current || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const point = pointForEvent(event);
    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
    if (!hasSignature) setHasSignature(true);
  };

  const finish = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    setHasSignature(true);
    onChange(dataUrl);
  };

  const clear = () => {
    onChange('');
    setHasSignature(false);
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className={`signature-pad${disabled ? ' is-disabled' : ''}`}>
      <div className="signature-pad__heading">
        <div>
          <strong>Draw signature</strong>
          <span>Use a mouse, trackpad, finger, or stylus.</span>
        </div>
        <button
          type="button"
          className="text-link"
          onClick={clear}
          disabled={disabled || !hasSignature}
        >
          <Eraser size={16} /> Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="Electronic signature drawing area"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={(event) => {
          if (event.buttons === 0) finish();
        }}
      />
      <p>Sign inside the box. Your signature is submitted only when you select “Sign waiver.”</p>
    </div>
  );
}
