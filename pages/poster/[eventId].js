import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import PosterCanvas from '../../components/PosterCanvas';
import { isSessionValid } from '../../lib/auth';
import db from '../../lib/db';
import {
  DEFAULT_PAGE,
  PAGE_PRESETS,
  emptyLayout,
  normalizeLayout,
  pagePx,
  presetIdFor,
} from '../../lib/pageSize';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `s${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const SHAPE_COLORS = ['#c1963a', '#1a2330', '#b85a4e', '#ffffff', '#4a7c59', '#3d5a80', '#c45c26'];
const DEFAULT_SHAPE_FILL = '#c1963a';

function asHex(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_SHAPE_FILL;
}

export async function getServerSideProps({ req, params }) {
  if (!isSessionValid(req.headers.cookie)) {
    return { redirect: { destination: '/login', permanent: false } };
  }
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(params.eventId);
  if (!event) return { notFound: true };
  return { props: { event } };
}

export default function PosterBuilder({ event }) {
  const router = useRouter();
  const [images, setImages] = useState([]);
  const [layout, setLayout] = useState(emptyLayout());
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [scale, setScale] = useState(0.25);
  const [shapeColor, setShapeColor] = useState(DEFAULT_SHAPE_FILL);
  const exportRef = useRef(null);
  const fileRef = useRef(null);
  const stageRef = useRef(null);

  const page = layout.page || DEFAULT_PAGE;
  const canvasPx = pagePx(page);
  const preset = presetIdFor(page);

  useEffect(() => {
    refreshImages();
    fetch(`/api/events/${event.id}/layout`)
      .then((r) => r.json())
      .then((d) => setLayout(normalizeLayout(d.layout)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const item = (layout.items || []).find((it) => it.id === selectedId);
    if (item?.type === 'shape' && item.fill) setShapeColor(asHex(item.fill));
    // Only sync when the selection changes, not on every layout drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function fit() {
      const pad = 24;
      const availW = Math.max(120, stage.clientWidth - pad);
      const availH = Math.max(120, stage.clientHeight - pad);
      if (stage.clientWidth < 40 || stage.clientHeight < 40) return;
      const next = Math.min(availW / canvasPx.width, availH / canvasPx.height);
      const clamped = Math.max(0.05, Math.min(next, 1));
      setScale((prev) => (Math.abs(prev - clamped) < 0.002 ? prev : clamped));
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [canvasPx.width, canvasPx.height]);

  function refreshImages() {
    return fetch(`/api/events/${event.id}/images`)
      .then((r) => r.json())
      .then((d) => setImages(d.images || []))
      .catch(() => setNote('Could not load images from Drive.'));
  }

  async function addHrPhotos(e) {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    if (!picked.length) return;
    setUploading(true);
    setNote('');
    const form = new FormData();
    for (const file of picked) form.append('images', file);
    try {
      const res = await fetch(`/api/events/${event.id}/images`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNote(data.error || 'Could not add photos.');
      else {
        setNote(`Added ${data.uploaded} photo${data.uploaded === 1 ? '' : 's'}.`);
        await refreshImages();
      }
    } catch {
      setNote('Could not add photos.');
    }
    setUploading(false);
  }

  function applyPage(widthMm, heightMm) {
    const nextPage = {
      widthMm: clamp(Number(widthMm) || DEFAULT_PAGE.widthMm, 50, 500),
      heightMm: clamp(Number(heightMm) || DEFAULT_PAGE.heightMm, 50, 500),
    };
    const px = pagePx(nextPage);
    setLayout((prev) => ({
      page: nextPage,
      items: (prev.items || []).map((it) => ({
        ...it,
        x: clamp(it.x, 0, Math.max(0, px.width - it.width)),
        y: clamp(it.y, 0, Math.max(0, px.height - it.height)),
      })),
    }));
  }

  function onPresetChange(id) {
    const found = PAGE_PRESETS.find((p) => p.id === id);
    if (!found) return;
    const landscape = page.widthMm > page.heightMm && found.widthMm !== found.heightMm;
    applyPage(
      landscape ? found.heightMm : found.widthMm,
      landscape ? found.widthMm : found.heightMm
    );
  }

  function rotatePage() {
    applyPage(page.heightMm, page.widthMm);
  }

  function rotateSelected(delta) {
    if (!selectedId) return;
    setLayout((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.id === selectedId ? { ...it, rotation: ((it.rotation || 0) + delta + 360) % 360 } : it
      ),
    }));
  }

  function removeSelected() {
    if (!selectedId) return;
    setLayout((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== selectedId) }));
    setSelectedId(null);
  }

  function patchSelected(patch) {
    if (!selectedId) return;
    setLayout((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== selectedId) return it;
        const next = { ...it, ...patch };
        const locked = it.type === 'shape' && (it.shape === 'square' || it.shape === 'circle');
        if (locked && (patch.width != null || patch.height != null)) {
          const side = patch.width ?? patch.height;
          next.width = side;
          next.height = side;
        }
        next.width = clamp(next.width, 24, canvasPx.width);
        next.height = clamp(next.height, 24, canvasPx.height);
        next.x = clamp(next.x, 0, Math.max(0, canvasPx.width - next.width));
        next.y = clamp(next.y, 0, Math.max(0, canvasPx.height - next.height));
        return next;
      }),
    }));
  }

  function applyShapeColor(color) {
    const fill = asHex(color);
    setShapeColor(fill);
    const selected = layout.items.find((it) => it.id === selectedId);
    if (selected?.type === 'shape') patchSelected({ fill });
  }

  function addShape(shape) {
    const locked = shape === 'square' || shape === 'circle';
    const width = locked ? 180 : 280;
    const height = locked ? 180 : 160;
    const count = (layout.items || []).filter((it) => it.type === 'shape').length;
    const offset = (count % 6) * 28;
    const maxZ = Math.max(0, ...(layout.items || []).map((it) => it.z || 0));
    const item = {
      id: newId(),
      type: 'shape',
      shape,
      fill: shapeColor,
      x: clamp((canvasPx.width - width) / 2 + offset, 0, Math.max(0, canvasPx.width - width)),
      y: clamp((canvasPx.height - height) / 2 + offset, 0, Math.max(0, canvasPx.height - height)),
      width,
      height,
      rotation: 0,
      z: maxZ + 1,
    };
    setLayout((prev) => ({ ...prev, items: [...(prev.items || []), item] }));
    setSelectedId(item.id);
  }

  async function saveLayout() {
    setSaving(true);
    await fetch(`/api/events/${event.id}/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout }),
    });
    setSaving(false);
    setNote('Layout saved.');
    setTimeout(() => setNote(''), 2000);
  }

  async function exportPdf() {
    setExporting(true);
    setNote('');
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvasEl = exportRef.current;
      const rendered = await html2canvas(canvasEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = rendered.toDataURL('image/jpeg', 0.95);
      const w = page.widthMm;
      const h = page.heightMm;
      const pdf = new jsPDF({
        orientation: w > h ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [w, h],
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, w, h);
      pdf.save(`${event.person_name.replace(/\s+/g, '-')}-farewell-poster.pdf`);
    } catch (err) {
      console.error(err);
      setNote('Export failed — see console for details.');
    }
    setExporting(false);
  }

  const selectedItem = (layout.items || []).find((it) => it.id === selectedId);
  const selectedShape = selectedItem?.type === 'shape' ? selectedItem : null;
  const activeFill = asHex(selectedShape?.fill || shapeColor);

  return (
    <Layout fluid>
      <div className="builder-page">
        <div className="builder-toolbar">
          <button className="btn secondary" onClick={() => router.push(`/dashboard/${event.id}`)}>
            ← Event
          </button>
          <h2>{event.person_name}</h2>

          <div className="toolbar-group">
            <label>
              Page
              <select value={preset} onChange={(e) => onPresetChange(e.target.value)}>
                {PAGE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                {preset === 'custom' && <option value="custom">Custom</option>}
              </select>
            </label>
            <button className="btn secondary" type="button" onClick={rotatePage} title="Rotate page">
              Rotate page
            </button>
          </div>

          <div className="toolbar-group">
            <button className="btn secondary" type="button" onClick={() => rotateSelected(-15)} disabled={!selectedId}>
              ↺
            </button>
            <button className="btn secondary" type="button" onClick={() => rotateSelected(15)} disabled={!selectedId}>
              ↻
            </button>
            <button className="btn secondary" type="button" onClick={removeSelected} disabled={!selectedId}>
              Remove
            </button>
          </div>

          <div className="toolbar-group toolbar-end">
            <button className="btn secondary" onClick={saveLayout} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" onClick={exportPdf} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </div>

        {note && <p className="hint-text builder-note">{note}</p>}

        <div className="builder-layout">
          <aside className="builder-tray">
            <p className="hint-text">Drag photos onto the page. Add a shape, then drag the gold handle to resize.</p>
            <div className="shape-tools">
              <p className="tray-label">Shapes</p>
              <div className="shape-swatches">
                {SHAPE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`shape-swatch${activeFill === color ? ' active' : ''}`}
                    style={{ background: color }}
                    title={color}
                    onClick={() => applyShapeColor(color)}
                  />
                ))}
                <input
                  className="color-input"
                  type="color"
                  value={activeFill}
                  onChange={(e) => applyShapeColor(e.target.value)}
                  title="Custom color"
                />
              </div>
              <div className="shape-buttons">
                <button className="shape-btn" type="button" title="Square" onClick={() => addShape('square')}>
                  <span className="shape-icon square" style={{ background: activeFill }} />
                </button>
                <button className="shape-btn" type="button" title="Rectangle" onClick={() => addShape('rectangle')}>
                  <span className="shape-icon rectangle" style={{ background: activeFill }} />
                </button>
                <button className="shape-btn" type="button" title="Circle" onClick={() => addShape('circle')}>
                  <span className="shape-icon circle" style={{ background: activeFill }} />
                </button>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={addHrPhotos} />
            <button
              className="btn secondary"
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Adding…' : 'Add photos'}
            </button>
            <div className="image-grid">
              {images.map((img) => (
                <img
                  key={img.id}
                  src={img.url}
                  alt={img.name}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/image-id', img.id);
                    e.dataTransfer.setData('text/plain', img.id);
                  }}
                  title={img.name}
                />
              ))}
            </div>
            {images.length === 0 && <p className="hint-text">No photos yet.</p>}
          </aside>

          <div className="poster-stage" ref={stageRef}>
            <PosterCanvas
              images={images}
              layout={layout}
              scale={scale}
              interactive
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={setLayout}
            />
          </div>
        </div>
      </div>

      <div className="export-offscreen">
        <PosterCanvas ref={exportRef} images={images} layout={layout} scale={1} />
      </div>
    </Layout>
  );
}
