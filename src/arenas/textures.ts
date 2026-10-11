import * as THREE from 'three';

/* Canvas-generated textures for the arena (no external assets). */

const CJK_FONTS = '"Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans JP", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Building facade with randomly lit windows. */
export function makeWindowsTexture(tint: string, density = 0.4): THREE.Texture {
  const [c, ctx] = makeCanvas(256, 512);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, 256, 512);
  const cols = 8, rows = 16;
  const w = 256 / cols, h = 512 / rows;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const lit = Math.random() < density;
      if (lit) {
        const warm = Math.random() < 0.72;
        ctx.fillStyle = warm ? 'rgba(255, 214, 140, 0.85)' : tint;
        ctx.globalAlpha = 0.35 + Math.random() * 0.6;
      } else {
        ctx.fillStyle = '#0b0e16';
        ctx.globalAlpha = 0.9;
      }
      ctx.fillRect(x * w + w * 0.18, y * h + h * 0.22, w * 0.64, h * 0.56);
      ctx.globalAlpha = 1;
    }
  }
  // floor separator lines
  ctx.strokeStyle = 'rgba(20,26,40,0.9)';
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * h); ctx.lineTo(256, y * h); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Neon shop sign: framed panel with CJK text + abstract fallback graphics. */
export function makeSignTexture(text: string, color: string, vertical = false): THREE.Texture {
  const w = vertical ? 160 : 420;
  const h = vertical ? 460 : 160;
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#07080d';
  ctx.fillRect(0, 0, w, h);
  // border glow
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  ctx.font = `bold ${vertical ? 74 : 84}px ${CJK_FONTS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    const chars = text.split('');
    const step = (h - 60) / Math.max(1, chars.length);
    chars.forEach((ch, i) => ctx.fillText(ch, w / 2, 44 + step * (i + 0.5)));
  } else {
    ctx.fillText(text, w / 2, h / 2);
  }
  // decorative circuit dots so the panel reads even without CJK fonts
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.65;
  for (let i = 0; i < 6; i++) {
    const x = vertical ? 24 + (i % 2) * (w - 48) : 34 + i * 66;
    const y = vertical ? 30 + i * 70 : h - 26;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Holographic billboard base image. */
export function makeHoloTexture(main: string, sub: string): THREE.Texture {
  const [c, ctx] = makeCanvas(512, 288);
  const g = ctx.createLinearGradient(0, 0, 512, 288);
  g.addColorStop(0, '#0a1830');
  g.addColorStop(0.5, '#111c3a');
  g.addColorStop(1, '#0a1428');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 288);
  // big glyph
  ctx.fillStyle = 'rgba(120, 220, 255, 0.92)';
  ctx.font = `bold 150px ${CJK_FONTS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#39c6ff';
  ctx.shadowBlur = 30;
  ctx.fillText(main, 150, 140);
  // sub lines
  ctx.shadowBlur = 12;
  ctx.font = `bold 44px ${CJK_FONTS}`;
  ctx.fillStyle = 'rgba(255, 90, 160, 0.95)';
  ctx.fillText(sub, 360, 90);
  ctx.fillStyle = 'rgba(160, 255, 220, 0.8)';
  ctx.font = `bold 26px ${CJK_FONTS}`;
  ctx.fillText('NEON TOKYO · 24H', 360, 150);
  // grid + barcode deco
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(90, 160, 255, 0.25)';
  for (let x = 0; x < 512; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 288); ctx.stroke(); }
  for (let y = 0; y < 288; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,90,160,0.7)' : 'rgba(120,220,255,0.5)';
    ctx.fillRect(300 + i * 8, 210, 4 + (i % 3) * 2, 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial puff (steam / mist). */
export function makePuffTexture(color = 'rgba(190,210,235,0.55)'): THREE.Texture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Wet asphalt roughness variation + faint paint. */
export function makeAsphaltTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2400; i++) {
    const a = Math.random() * 0.06;
    ctx.fillStyle = `rgba(${140 + Math.random() * 60},${150 + Math.random() * 60},${170 + Math.random() * 60},${a})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.6, 1.6);
  }
  // cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 90;
      y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

/** Banner cloth (festival style). */
export function makeBannerTexture(text: string, bg: string, fg: string): THREE.Texture {
  const [c, ctx] = makeCanvas(128, 384);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 384);
  ctx.fillStyle = fg;
  ctx.font = `bold 64px ${CJK_FONTS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = text.split('');
  chars.forEach((ch, i) => ctx.fillText(ch, 64, 60 + i * 96));
  ctx.strokeStyle = fg;
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 112, 368);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
