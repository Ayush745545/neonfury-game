import { CHARACTERS, type CharacterDef } from '../fighters/characters';
import type { CharId } from '../game/types';

/* Parametric SVG portraits generated from each character's palette,
   hair style and accessory — 15 distinct faces, zero image assets. */

function Hair({ def }: { def: CharacterDef }) {
  const c = def.palette.hair;
  switch (def.hair) {
    case 'short':
      return <path d="M21 26 Q20 12 32 11 Q44 12 43 26 L40 20 Q38 16 32 16 Q26 16 24 20 Z" fill={c} />;
    case 'spiky':
      return <path d="M21 25 L19 14 L25 19 L26 9 L31 16 L34 7 L37 16 L42 10 L41 20 L45 17 L43 26 Q40 15 32 14.5 Q24 15 21 25 Z" fill={c} />;
    case 'long':
      return (
        <g>
          <path d="M20 27 Q19 12 32 11 Q45 12 44 27 L44 44 L39 44 L39 24 Q38 16 32 16 Q26 16 25 24 L25 44 L20 44 Z" fill={c} />
        </g>
      );
    case 'ponytail':
      return (
        <g>
          <path d="M21 25 Q20 12 32 11 Q44 12 43 25 L40 19 Q38 15.5 32 15.5 Q26 15.5 24 19 Z" fill={c} />
          <path d="M40 16 Q50 20 48 34 Q47 42 42 46 L44 32 Q44 22 38 19 Z" fill={c} />
          <circle cx="40.5" cy="17" r="2.2" fill={def.color} />
        </g>
      );
    case 'mohawk':
      return (
        <g>
          <path d="M29 14 L32 4 L35 14 L33.5 12 L32 15 L30.5 12 Z" fill={c} />
          <path d="M27.5 16 L29 8 L31.5 15 Z M36.5 16 L35 8 L32.5 15 Z" fill={c} />
          <path d="M24 24 Q26 18 32 17.5 Q38 18 40 24 L38 21 Q36 19 32 19 Q28 19 26 21 Z" fill={c} opacity="0.6" />
        </g>
      );
    case 'hood':
      return (
        <g>
          <path d="M18 30 Q17 10 32 9 Q47 10 46 30 L46 40 L41 40 L41 26 Q41 15 32 15 Q23 15 23 26 L23 40 L18 40 Z" fill={def.palette.clothMain} />
          <path d="M18 30 Q17 10 32 9 Q47 10 46 30" fill="none" stroke={def.color} strokeWidth="1.2" opacity="0.8" />
        </g>
      );
    case 'bald':
    default:
      return <path d="M23 20 Q26 15 32 15 Q38 15 41 20" fill="none" stroke={def.color} strokeWidth="1.4" opacity="0.55" />;
  }
}

function Accessory({ def }: { def: CharacterDef }) {
  switch (def.accessory) {
    case 'headband':
      return (
        <g>
          <path d="M20.5 24.5 Q32 20 43.5 24.5 L43.5 29 Q32 24.8 20.5 29 Z" fill={def.palette.belt ?? def.color} />
          <path d="M43 27 L53 21 L51 30 L43 30 Z" fill={def.palette.belt ?? def.color} />
        </g>
      );
    case 'visor':
      return (
        <g>
          <path d="M21 29.5 Q32 26.5 43 29.5 L43 33.5 Q32 30.8 21 33.5 Z" fill={def.color} opacity="0.92" />
          <path d="M21 29.5 Q32 26.5 43 29.5" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.5" />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path d="M24 44 Q32 48 40 44 L41 49 Q32 53 23 49 Z" fill={def.palette.clothAlt} />
          <path d="M38 47 L44 58 L39 57 L36 48 Z" fill={def.palette.clothAlt} />
        </g>
      );
    case 'mask':
      return (
        <g>
          <path d="M23.5 34 Q32 32 40.5 34 L40 43 Q32 46.5 24 43 Z" fill={def.palette.clothMain} />
          <path d="M25 37.5 L39 37.5" stroke={def.color} strokeWidth="1.1" opacity="0.85" />
        </g>
      );
    case 'goggles':
      return (
        <g>
          <circle cx="26.5" cy="19" r="4.2" fill="#101318" stroke={def.color} strokeWidth="1.4" />
          <circle cx="37.5" cy="19" r="4.2" fill="#101318" stroke={def.color} strokeWidth="1.4" />
          <path d="M21 19 L22.5 19 M41.5 19 L43 19" stroke={def.color} strokeWidth="1.6" />
        </g>
      );
    default:
      return null;
  }
}

export function Portrait({ char, size = 64 }: { char: CharId; size?: number }) {
  const def = CHARACTERS[char];
  const P = def.palette;
  const gid = `bg-${char}`;
  const masked = def.accessory === 'mask';
  const visored = def.accessory === 'visor';
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={P.clothAlt} />
          <stop offset="1" stopColor="#05060a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${gid})`} />
      {/* energy backdrop glyph */}
      <circle cx="32" cy="30" r="24" fill="none" stroke={def.color} strokeWidth="0.8" opacity="0.25" />
      <path d="M0 64 L16 42 L28 54 L44 36 L64 58 L64 64 Z" fill={def.color} opacity="0.16" />
      {/* shoulders */}
      <path d="M18 64 Q21 47 32 45 Q43 47 46 64 Z" fill={P.clothMain} />
      <path d="M30 46 L32 64 L34 46 Z" fill={def.color} opacity="0.7" />
      <path d="M26 45.5 h12 v8 h-12 Z" fill={P.skin} />
      {/* head */}
      <path d="M23 29 Q23 14 32 13 Q41 14 41 29 Q41 41 32 43 Q23 41 23 29 Z" fill={P.skin} />
      <Hair def={def} />
      {!masked && !visored && (
        <>
          <path d="M25.5 30.5 L30 29.8 L30 32.6 L26 33 Z" fill="#101318" />
          <path d="M38.5 30.5 L34 29.8 L34 32.6 L38 33 Z" fill="#101318" />
          <circle cx="28" cy="31.3" r="1.05" fill={def.color} />
          <circle cx="36" cy="31.3" r="1.05" fill={def.color} />
          <path d="M28 38 Q32 39.6 36 37.6" stroke="rgba(0,0,0,0.45)" strokeWidth="1.3" fill="none" />
        </>
      )}
      <Accessory def={def} />
      {/* element spark */}
      <path d={`M52 6 L47 17 L50.5 17 L46.5 27 L55 14 L51 14 L54.5 6 Z`} fill={def.color} opacity="0.9" />
    </svg>
  );
}
