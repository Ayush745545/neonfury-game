import * as THREE from 'three';

/* Canvas-generated textures for the arena (no external assets). */

const CJK_FONTS = '"Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans JP", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export interface AsphaltSurface {
  color: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
}

/** Original, repeatable PBR maps. Data maps stay linear; only albedo is sRGB. */
export function makeAsphaltSurface(): AsphaltSurface {
  const size = 256;
  const height = new Float32Array(size * size);
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const grain = hash(x, y);
    // Periodic large-scale wet patches tile without seams.
    const patch = Math.sin(x / size * Math.PI * 4 + Math.cos(y / size * Math.PI * 2)) *
      Math.cos(y / size * Math.PI * 4 - Math.sin(x / size * Math.PI * 2));
    const wet = THREE.MathUtils.smoothstep(patch, -0.25, 0.65);
    height[i] = grain * (0.5 - wet * 0.35);
    const light = 37 + grain * 28 - wet * 12;
    color.set([light * 0.91, light * 0.98, light * 1.05, 255], i * 4);
    const r = 210 - wet * 155 + grain * 22;
    roughness.set([r, r, r, 255], i * 4);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = height[y * size + (x + 1) % size] - height[y * size + (x + size - 1) % size];
    const dy = height[((y + 1) % size) * size + x] - height[((y + size - 1) % size) * size + x];
    const n = new THREE.Vector3(-dx * 1.5, -dy * 1.5, 1).normalize();
    normal.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
  }
  const texture = (data: Uint8Array, albedo = false) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(9, 6);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = albedo ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return { color: texture(color, true), normal: texture(normal), roughness: texture(roughness) };
}

/** Concrete panel albedo with aggregate, stains and expansion seams. */
export function makeConcreteTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#737983';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const n = Math.sin(i * 19.13) * 43758.5;
    const fraction = n - Math.floor(n);
    ctx.fillStyle = i % 3 ? 'rgba(20,25,31,0.08)' : 'rgba(205,215,220,0.10)';
    ctx.fillRect(fraction * 256, (i * 37.7) % 256, 1.5, 1.5);
  }
  ctx.fillStyle = 'rgba(18,22,30,0.3)';
  for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 2, 256);
  for (let y = 0; y < 256; y += 128) ctx.fillRect(0, y, 256, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 5);
  return tex;
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
