import { html, useState, useEffect, useRef, useLayoutEffect } from '../../vendor/preact-htm.mjs';
import { Icon, Modal, toast, useImageUrl } from '../ui.js';

const OUT_W = 960;
const OUT_H = 720; // карточки 4:3
const PAPER = '#fbf6eb';

// Обрезка под формат карточки: перетаскивание, колесо/щипок/ползунок для масштаба.
function Cropper({ src, onDone, onCancel }) {
  const frameRef = useRef();
  const imgRef = useRef();
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const [nat, setNat] = useState(null);
  const [fw, setFw] = useState(0);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });

  useLayoutEffect(() => {
    const measure = () => frameRef.current && setFw(frameRef.current.clientWidth);
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, []);

  const fh = fw * (OUT_H / OUT_W);
  const cover = nat ? Math.max(fw / nat.w, fh / nat.h) : 1;
  const contain = nat ? Math.min(fw / nat.w, fh / nat.h) : 1;
  const minZoom = contain / cover;

  const clamp = (v) => {
    const zoom = Math.min(5, Math.max(minZoom, v.zoom));
    const w = nat.w * cover * zoom;
    const h = nat.h * cover * zoom;
    const mx = Math.abs(w - fw) / 2;
    const my = Math.abs(h - fh) / 2;
    return { zoom, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };
  const update = (fn) => nat && setView((v) => clamp(fn(v)));

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  };
  const onMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      update((v) => ({ ...v, zoom: (pinch.current.zoom * dist) / pinch.current.dist }));
    } else if (pointers.current.size === 1) {
      update((v) => ({ ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }));
    }
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onWheel = (e) => {
    e.preventDefault();
    update((v) => ({ ...v, zoom: v.zoom * Math.exp(-e.deltaY * 0.0015) }));
  };

  useEffect(() => {
    const el = frameRef.current;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const done = () => {
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    const k = OUT_W / fw;
    const w = nat.w * cover * view.zoom;
    const h = nat.h * cover * view.zoom;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgRef.current, (fw / 2 + view.x - w / 2) * k, (fh / 2 + view.y - h / 2) * k, w * k, h * k);
    canvas.toBlob((blob) => (blob ? onDone(blob) : toast('Не получилось обработать картинку')), 'image/jpeg', 0.86);
  };

  const w = nat ? nat.w * cover * view.zoom : 0;
  const h = nat ? nat.h * cover * view.zoom : 0;

  return html`<${Modal} title="Кадрирование" onClose=${onCancel} wide>
    <div class="crop-frame" ref=${frameRef} style=${{ height: fh + 'px' }}
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}>
      <img ref=${imgRef} src=${src} alt="" draggable="false" crossorigin="anonymous"
        onLoad=${(e) => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        style=${nat && fw ? { width: w + 'px', height: h + 'px', left: fw / 2 + view.x - w / 2 + 'px', top: fh / 2 + view.y - h / 2 + 'px' } : { opacity: 0 }} />
    </div>
    <div class="crop-controls">
      <span class="muted small">Двигайте картинку пальцем или мышью</span>
      <input type="range" min=${minZoom} max="5" step="0.01" value=${view.zoom} aria-label="Масштаб"
        onInput=${(e) => update((v) => ({ ...v, zoom: parseFloat(e.target.value) }))} />
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onClick=${onCancel}>Отмена</button>
      <button class="btn primary" disabled=${!nat} onClick=${done}><${Icon} name="check" />Готово</button>
    </div>
  <//>`;
}

export function ImageField({ value, onChange }) {
  const url = useImageUrl(value);
  const fileRef = useRef();
  const [source, setSource] = useState(null);
  const [drag, setDrag] = useState(false);
  const [link, setLink] = useState('');

  const openBlob = (blob) => {
    if (!blob || !blob.type.startsWith('image/')) return toast('Это не картинка');
    setSource(URL.createObjectURL(blob));
  };
  const closeCropper = () => {
    if (source?.startsWith('blob:') && source !== url) URL.revokeObjectURL(source);
    setSource(null);
  };

  // Вставка картинки из буфера обмена (Ctrl+V) в любом месте экрана.
  useEffect(() => {
    const onPaste = (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        openBlob(file);
      }
    };
    addEventListener('paste', onPaste);
    return () => removeEventListener('paste', onPaste);
  }, []);

  const loadLink = async () => {
    try {
      const res = await fetch(link.trim());
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error();
      setLink('');
      openBlob(blob);
    } catch {
      toast('Сайт не отдаёт картинку по ссылке. Скопируйте саму картинку («Копировать изображение») и вставьте сюда, или сохраните её файлом.', 'long');
    }
  };

  return html`<div class="image-field">
    ${url
      ? html`<div class="img-preview">
          <img src=${url} alt="" />
          <div class="img-actions">
            <button type="button" class="btn small" onClick=${() => setSource(url)}><${Icon} name="crop" size=${18} />Кадр</button>
            <button type="button" class="btn small" onClick=${() => fileRef.current.click()}><${Icon} name="image" size=${18} />Заменить</button>
            <button type="button" class="btn small ghost" onClick=${() => onChange(null)}><${Icon} name="trash" size=${18} />Убрать</button>
          </div>
        </div>`
      : html`<button type="button" class=${'dropzone' + (drag ? ' drag' : '')}
            onClick=${() => fileRef.current.click()}
            onDragOver=${(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave=${() => setDrag(false)}
            onDrop=${(e) => { e.preventDefault(); setDrag(false); openBlob(e.dataTransfer.files[0]); }}>
            <${Icon} name="image" size=${34} />
            <b>Добавить картинку</b>
            <span>Нажмите, перетащите файл или вставьте из буфера (Ctrl+V)</span>
          </button>
          <div class="url-row">
            <input class="input" type="url" placeholder="…или ссылка на картинку" value=${link}
              onInput=${(e) => setLink(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && (e.preventDefault(), loadLink())} />
            <button type="button" class="btn" disabled=${!link.trim()} onClick=${loadLink}>Загрузить</button>
          </div>`}
    <input type="file" accept="image/*" hidden ref=${fileRef}
      onChange=${(e) => { openBlob(e.target.files[0]); e.target.value = ''; }} />
    ${source && html`<${Cropper} src=${source} onCancel=${closeCropper} onDone=${(blob) => { onChange(blob); closeCropper(); }} />`}
  </div>`;
}
