import { forwardRef, useEffect, useRef, useState } from 'react';
import { DEFAULT_PAGE, pagePx } from '../lib/pageSize';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isShapeItem(item) {
  return item?.type === 'shape';
}

function shapeLocksRatio(item) {
  return item?.shape === 'square' || item?.shape === 'circle';
}

const PosterCanvas = forwardRef(function PosterCanvas(
  { images, layout, scale = 1, interactive = false, selectedId = null, onChange, onSelect },
  ref
) {
  const page = layout?.page || DEFAULT_PAGE;
  const size = pagePx(page);
  const items = layout?.items || [];

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [dragging, setDragging] = useState(false);

  function setNode(node) {
    canvasRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }

  function canvasPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const currentScale = scaleRef.current || 1;
    return {
      x: (e.clientX - rect.left) / currentScale,
      y: (e.clientY - rect.top) / currentScale,
    };
  }

  function commit(patch) {
    const current = layoutRef.current || { page: DEFAULT_PAGE, items: [] };
    onChange({ ...current, ...patch });
  }

  function setItems(next) {
    commit({ items: next });
  }

  function patchItem(id, patch) {
    setItems(itemsRef.current.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function bringToFront(id) {
    const maxZ = Math.max(0, ...itemsRef.current.map((it) => it.z || 0));
    patchItem(id, { z: maxZ + 1 });
  }

  function sizeForImage(imageId) {
    const meta = images.find((img) => img.id === imageId);
    let nw = 4;
    let nh = 3;
    if (meta?.url && typeof document !== 'undefined') {
      const loaded = [...document.images].find((el) => {
        const src = el.getAttribute('src') || '';
        return src === meta.url || el.src.endsWith(meta.url);
      });
      if (loaded?.naturalWidth) {
        nw = loaded.naturalWidth;
        nh = loaded.naturalHeight;
      }
    }
    const maxSide = Math.min(320, sizeRef.current.width * 0.35);
    if (nw >= nh) {
      return { width: maxSide, height: Math.max(48, maxSide * (nh / nw)) };
    }
    return { width: Math.max(48, maxSide * (nw / nh)), height: maxSide };
  }

  function addImageAt(imageId, x, y) {
    const { width, height } = sizeForImage(imageId);
    const canvas = sizeRef.current;
    const maxZ = Math.max(0, ...itemsRef.current.map((it) => it.z || 0));
    const item = {
      id: newId(),
      imageId,
      x: clamp(x - width / 2, 0, Math.max(0, canvas.width - width)),
      y: clamp(y - height / 2, 0, Math.max(0, canvas.height - height)),
      width,
      height,
      rotation: 0,
      z: maxZ + 1,
    };
    setItems([...itemsRef.current, item]);
    onSelect?.(item.id);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const imageId = e.dataTransfer.getData('text/image-id') || e.dataTransfer.getData('text/plain');
    if (!imageId) return;
    const p = canvasPoint(e);
    addImageAt(imageId, p.x, p.y);
  }

  useEffect(() => {
    if (!interactive) return;

    function onMove(e) {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      const p = canvasPoint(e);
      const item = itemsRef.current.find((it) => it.id === drag.id);
      if (!item) return;
      const canvas = sizeRef.current;

      if (drag.mode === 'press') {
        const dist = Math.hypot(p.x - drag.startX, p.y - drag.startY);
        if (dist < 4) return;
        drag.mode = 'move';
        setDragging(true);
      }

      if (drag.mode === 'move') {
        patchItem(drag.id, {
          x: clamp(p.x - drag.ox, 0, Math.max(0, canvas.width - item.width)),
          y: clamp(p.y - drag.oy, 0, Math.max(0, canvas.height - item.height)),
        });
      } else if (drag.mode === 'resize') {
        const minSide = isShapeItem(item) ? 24 : 48;
        if (drag.lockRatio) {
          const ratio = drag.ratio || 1;
          let width = clamp(p.x - item.x, minSide, canvas.width - item.x);
          let height = width * ratio;
          if (item.y + height > canvas.height) {
            height = Math.max(minSide, canvas.height - item.y);
            width = height / ratio;
          }
          patchItem(drag.id, { width, height });
        } else {
          patchItem(drag.id, {
            width: clamp(p.x - item.x, minSide, canvas.width - item.x),
            height: clamp(p.y - item.y, minSide, canvas.height - item.y),
          });
        }
      } else if (drag.mode === 'rotate') {
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        const deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
        patchItem(drag.id, { rotation: deg });
      }
    }

    function onUp() {
      dragRef.current = null;
      setDragging(false);
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [interactive, scale, onChange]);

  useEffect(() => {
    if (!interactive) return;
    function onKey(e) {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      if (!selectedId) return;
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      e.preventDefault();
      setItems(itemsRef.current.filter((it) => it.id !== selectedId));
      onSelect?.(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, selectedId, onChange, onSelect]);

  const imageById = Object.fromEntries(images.map((img) => [img.id, img]));

  return (
    <div
      ref={setNode}
      className="poster-canvas"
      style={{
        width: size.width * scale,
        height: size.height * scale,
        background: '#fff',
      }}
      onClick={interactive ? () => onSelect?.(null) : undefined}
      onDoubleClick={interactive ? (e) => e.preventDefault() : undefined}
      onDragOver={
        interactive
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          : undefined
      }
      onDrop={interactive ? handleDrop : undefined}
    >
      {items.map((item) => {
        const shape = isShapeItem(item);
        const image = shape ? null : imageById[item.imageId];
        if (!shape && !image) return null;
        const selected = interactive && selectedId === item.id;
        return (
          <div
            key={item.id}
            className={`poster-item${selected ? ' selected' : ''}`}
            style={{
              left: item.x * scale,
              top: item.y * scale,
              width: item.width * scale,
              height: item.height * scale,
              zIndex: item.z || 1,
              transform: `rotate(${item.rotation || 0}deg)`,
            }}
            onDragOver={
              interactive
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }
                : undefined
            }
            onDrop={interactive ? handleDrop : undefined}
            onClick={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    onSelect?.(item.id);
                    bringToFront(item.id);
                  }
                : undefined
            }
            onPointerDown={
              interactive
                ? (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore if capture is not available.
                    }
                    onSelect?.(item.id);
                    const p = canvasPoint(e);
                    dragRef.current = {
                      mode: 'press',
                      id: item.id,
                      ox: p.x - item.x,
                      oy: p.y - item.y,
                      startX: p.x,
                      startY: p.y,
                    };
                    bringToFront(item.id);
                  }
                : undefined
            }
          >
            {shape ? (
              <div
                className={`poster-shape poster-shape-${item.shape || 'rectangle'}`}
                style={{ backgroundColor: item.fill || '#c1963a' }}
              />
            ) : (
              <img src={image.url} alt={image.name} crossOrigin="anonymous" draggable={false} />
            )}
            {selected && !dragging && (
              <>
                <div
                  className="rotate-handle"
                  title="Drag to rotate"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDragging(true);
                    dragRef.current = { mode: 'rotate', id: item.id };
                  }}
                />
                <div
                  className="resize-handle"
                  title="Drag to resize"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const lockRatio = !shape || shapeLocksRatio(item);
                    setDragging(true);
                    dragRef.current = {
                      mode: 'resize',
                      id: item.id,
                      lockRatio,
                      ratio: shape && shapeLocksRatio(item) ? 1 : item.height / item.width,
                    };
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default PosterCanvas;
