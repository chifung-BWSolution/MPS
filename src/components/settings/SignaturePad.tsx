import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  width?: number;
  height?: number;
  className?: string;
}

const PEN_CURSOR =
  'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M12 19l7-7 3 3-7 7-3-3z\'/><path d=\'M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z\'/><path d=\'M2 2l7.586 7.586\'/><circle cx=\'11\' cy=\'11\' r=\'2\'/></svg>") 2 22, crosshair';

export function SignaturePad({ value, onChange, width = 380, height = 90, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Restore saved signature when value or canvas size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0d1a2d';

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        setIsEmpty(false);
      };
      img.src = value;
    } else {
      ctx.clearRect(0, 0, width, height);
      setIsEmpty(true);
    }
  }, [width, height, value]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const point = getPoint(e);
    if (!point) return;
    drawingRef.current = true;
    lastPointRef.current = point;
    canvas?.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    // dot for tap
    ctx.arc(point.x, point.y, 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1a2d';
    ctx.fill();
    setIsEmpty(false);
  };

  const moveStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const point = getPoint(e);
    if (!point || !lastPointRef.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture might already be released
    }
    onChange(canvas.toDataURL('image/png'));
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, width, height);
    setIsEmpty(true);
    onChange('');
  };

  return (
    <div className={cn('inline-flex flex-col items-end gap-1', className)}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={startStroke}
          onPointerMove={moveStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={(e) => {
            if (drawingRef.current) endStroke(e);
          }}
          className="border border-border rounded-sm bg-white touch-none select-none"
          style={{ cursor: PEN_CURSOR, width, height }}
        />
        {isEmpty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground/60">
            請於此處簽署
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleClear}
        disabled={isEmpty}
        className={cn(
          'inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded transition-colors',
          isEmpty
            ? 'text-muted-foreground/40 cursor-not-allowed'
            : 'text-rose-600 hover:bg-rose-50'
        )}
      >
        <Eraser size={10} /> 清除
      </button>
    </div>
  );
}
