/* ================================================================== */
/*  15 playable city locations. Pure data — the CityStage component    */
/*  builds each arena from its StageDef.                               */
/* ================================================================== */

export type WeatherKind = 'rain' | 'storm' | 'snow' | 'embers' | 'petals' | 'mist' | 'clear';

export type PropKind =
  | 'torii' | 'lanterns' | 'cranes' | 'containers' | 'arcade' | 'helipad'
  | 'benches' | 'trainlights' | 'tesla' | 'sakura' | 'market' | 'pillars';

export interface SignSpec {
  text: string; color: string; pos: [number, number, number];
  rotY?: number; vertical?: boolean; scale?: number; flicker?: boolean;
}

export interface StageDef {
  id: string;
  name: string;
  subtitle: string;
  sky: string;
  fogColor: string;
  fogDensity: number;
  ground: { color: string; wet: boolean; lineColor: string };
  buildingTint: string;
  windowTints: [string, string, string];
  signs: SignSpec[];
  holos: { main: string; sub: string }[];
  lampColor: string;
  neonL: string;
  neonR: string;
  moonColor: string;
  ambient: [string, string, number];
  weather: WeatherKind;
  props: PropKind[];
  banners: { text: string; bg: string; fg: string }[];
  crowdTint: string;
  uiGradient: [string, string];
}

const CJK = [
  'ラーメン', '電脳', '酒', 'カラオケ', '寿司', '格闘', '24時間', 'ネオン', '東京',
  '夜', '炎', '雷', '龍', '闘', '祭', '氷', '毒', '鉄', '光', '影', '風', '星', '魂',
];

function signSet(colors: string[], zBase = -8): SignSpec[] {
  return [
    { text: CJK[0], color: colors[0], pos: [-7.4, 3.3, zBase + 0.4], rotY: 0.24, scale: 1.1 },
    { text: CJK[1], color: colors[1], pos: [-5.1, 4.6, zBase - 0.6], vertical: true },
    { text: CJK[2], color: colors[2], pos: [5.6, 3.1, zBase + 0.1], rotY: -0.2, scale: 0.95 },
    { text: CJK[3], color: colors[0], pos: [7.6, 4.4, zBase - 0.2], rotY: -0.3, vertical: true, scale: 1.05, flicker: true },
    { text: CJK[4], color: colors[1], pos: [-8.6, 2.4, zBase + 1.8], rotY: 0.5, scale: 0.8 },
    { text: CJK[5], color: colors[2], pos: [8.8, 2.5, zBase + 1.6], rotY: -0.5, scale: 0.85, flicker: true },
    { text: CJK[6], color: colors[0], pos: [3.2, 5.6, zBase - 1.4], scale: 0.9 },
    { text: CJK[7], color: colors[1], pos: [-3.0, 5.9, zBase - 1.8], scale: 1 },
    { text: CJK[8], color: colors[2], pos: [0.6, 3.9, zBase - 2.6], scale: 1.35 },
    { text: CJK[9], color: colors[0], pos: [-10.2, 3.4, -zBase - 12.4], rotY: Math.PI - 0.4 },
    { text: CJK[10], color: colors[1], pos: [10.6, 3.8, -zBase - 12.0], rotY: -(Math.PI - 0.4) },
  ];
}

const mkStage = (s: StageDef): StageDef => s;

export const STAGES: StageDef[] = [
  mkStage({
    id: 'neon-tokyo', name: 'NEON TOKYO', subtitle: 'MIDNIGHT ARENA',
    sky: '#04050a', fogColor: '#05070d', fogDensity: 0.033,
    ground: { color: '#0e1016', wet: true, lineColor: '#8b8f7a' },
    buildingTint: '#0a0c12', windowTints: ['rgba(120,200,255,0.8)', 'rgba(255,140,220,0.8)', 'rgba(140,255,200,0.8)'],
    signs: [
      { text: 'ラーメン', color: '#ff2d6f', pos: [-7.4, 3.3, -7.6], rotY: 0.24, scale: 1.1 },
      { text: '電脳', color: '#39c6ff', pos: [-5.1, 4.6, -8.6], vertical: true },
      { text: '酒', color: '#ffb02e', pos: [5.6, 3.1, -7.9], rotY: -0.2, scale: 0.95 },
      { text: 'カラオケ', color: '#b14dff', pos: [7.6, 4.4, -8.2], rotY: -0.3, vertical: true, scale: 1.05, flicker: true },
      { text: '寿司', color: '#2effb1', pos: [-8.6, 2.4, -6.2], rotY: 0.5, scale: 0.8 },
      { text: '格闘', color: '#ff4444', pos: [8.8, 2.5, -6.4], rotY: -0.5, scale: 0.85, flicker: true },
      { text: '24時間', color: '#ffe94d', pos: [3.2, 5.6, -9.4], scale: 0.9 },
      { text: 'ネオン', color: '#ff6ad5', pos: [-3.0, 5.9, -9.8], scale: 1 },
      { text: '東京', color: '#4dd2ff', pos: [0.6, 3.9, -10.6], scale: 1.35 },
      { text: '夜', color: '#ff6ad5', pos: [-10.2, 3.4, 4.2], rotY: Math.PI - 0.4 },
      { text: '炎', color: '#ffb02e', pos: [10.6, 3.8, 4.6], rotY: -(Math.PI - 0.4) },
    ],
    holos: [{ main: '龍', sub: 'NEON FURY' }, { main: '闘', sub: 'MIDNIGHT GP' }],
    lampColor: '#ffd9a0', neonL: '#ff2d6f', neonR: '#39c6ff', moonColor: '#a8c4ff',
    ambient: ['#28406b', '#0a0c12', 0.55],
    weather: 'storm', props: [],
    banners: [{ text: '祭', bg: '#7a1024', fg: '#ffd9c2' }, { text: '雷', bg: '#10243f', fg: '#bfe0ff' }, { text: '炎', bg: '#3f2410', fg: '#ffe0b0' }],
    crowdTint: '#0b0d13', uiGradient: ['#0b1024', '#2a0a1e'],
  }),
  mkStage({
    id: 'shibuya', name: 'SHIBUYA CROSSING', subtitle: 'SCRAMBLE IN THE STORM',
    sky: '#05070e', fogColor: '#070a12', fogDensity: 0.036,
    ground: { color: '#101318', wet: true, lineColor: '#c8ccd4' },
    buildingTint: '#0b0e15', windowTints: ['rgba(255,220,150,0.85)', 'rgba(120,200,255,0.8)', 'rgba(255,140,220,0.75)'],
    signs: signSet(['#ff3b6b', '#3bd6ff', '#ffd23b']),
    holos: [{ main: '渋', sub: 'SCRAMBLE' }, { main: '街', sub: 'CITY POP 24' }],
    lampColor: '#fff0c8', neonL: '#ff3b6b', neonR: '#3bd6ff', moonColor: '#b8ccff',
    ambient: ['#2c4270', '#0c0e14', 0.6],
    weather: 'rain', props: ['benches'],
    banners: [{ text: '渋', bg: '#123a5f', fg: '#cfe8ff' }, { text: '谷', bg: '#5f1230', fg: '#ffd0e0' }, { text: '音', bg: '#3f3010', fg: '#ffe9b0' }],
    crowdTint: '#0d1016', uiGradient: ['#101830', '#301028'],
  }),
  mkStage({
    id: 'market', name: 'OSAKA MARKET', subtitle: 'STREET FOOD BRAWL',
    sky: '#0a0705', fogColor: '#120c08', fogDensity: 0.04,
    ground: { color: '#171009', wet: true, lineColor: '#8f7a5a' },
    buildingTint: '#120c08', windowTints: ['rgba(255,190,110,0.9)', 'rgba(255,140,90,0.7)', 'rgba(255,220,150,0.8)'],
    signs: signSet(['#ff8a2e', '#ffd23b', '#ff5a3b'], -7),
    holos: [{ main: '市', sub: 'NIGHT MARKET' }, { main: '味', sub: 'OSAKA EATS' }],
    lampColor: '#ffcf8a', neonL: '#ff8a2e', neonR: '#ffd23b', moonColor: '#d8b890',
    ambient: ['#4a3018', '#120a06', 0.5],
    weather: 'mist', props: ['market', 'lanterns'],
    banners: [{ text: '味', bg: '#5f2a10', fg: '#ffe0b0' }, { text: '市', bg: '#5f1010', fg: '#ffc0c0' }, { text: '祭', bg: '#4a3a10', fg: '#fff0b0' }],
    crowdTint: '#140e08', uiGradient: ['#241206', '#3a2208'],
  }),
  mkStage({
    id: 'temple', name: 'KYOTO TEMPLE GATE', subtitle: 'UNDER THE TORII',
    sky: '#050810', fogColor: '#0a1020', fogDensity: 0.045,
    ground: { color: '#14161c', wet: false, lineColor: '#7a7f8a' },
    buildingTint: '#0e1018', windowTints: ['rgba(255,210,130,0.7)', 'rgba(160,200,255,0.5)', 'rgba(255,180,120,0.6)'],
    signs: signSet(['#ffb02e', '#ff4d4d', '#e8d8a0'], -9),
    holos: [{ main: '寺', sub: 'SACRED GROUND' }, { main: '禅', sub: 'KYOTO 1200Y' }],
    lampColor: '#ffe0a8', neonL: '#ff4d4d', neonR: '#ffb02e', moonColor: '#d8e0ff',
    ambient: ['#2a3450', '#0c0e16', 0.5],
    weather: 'mist', props: ['torii', 'lanterns'],
    banners: [{ text: '禅', bg: '#3f1010', fg: '#ffd0b0' }, { text: '寺', bg: '#3a2c10', fg: '#fff0c0' }, { text: '静', bg: '#102438', fg: '#c0e0ff' }],
    crowdTint: '#10121a', uiGradient: ['#1a1028', '#301410'],
  }),
  mkStage({
    id: 'rooftop', name: 'NEO SHINJUKU ROOFTOP', subtitle: 'ABOVE THE SPRawl',
    sky: '#030514', fogColor: '#060a1c', fogDensity: 0.022,
    ground: { color: '#12141c', wet: false, lineColor: '#aab4c8' },
    buildingTint: '#080a12', windowTints: ['rgba(120,200,255,0.85)', 'rgba(255,140,220,0.7)', 'rgba(140,255,220,0.75)'],
    signs: signSet(['#39c6ff', '#ff6ad5', '#7dffb2'], -12),
    holos: [{ main: '空', sub: 'SKY DUEL' }, { main: '星', sub: 'ROOFTOP VIP' }],
    lampColor: '#c8e0ff', neonL: '#39c6ff', neonR: '#ff6ad5', moonColor: '#c8d8ff',
    ambient: ['#20305c', '#080a12', 0.65],
    weather: 'clear', props: ['helipad', 'pillars'],
    banners: [{ text: '空', bg: '#10243f', fg: '#bfe0ff' }, { text: '星', bg: '#241038', fg: '#e0c0ff' }, { text: '風', bg: '#0f2c26', fg: '#b0ffd8' }],
    crowdTint: '#0a0c14', uiGradient: ['#060a20', '#1c1038'],
  }),
  mkStage({
    id: 'docks', name: 'DOCKSIDE FREIGHT YARD', subtitle: 'SALT, STEEL & RAIN',
    sky: '#04080c', fogColor: '#081016', fogDensity: 0.042,
    ground: { color: '#0d1216', wet: true, lineColor: '#7f9098' },
    buildingTint: '#0a1014', windowTints: ['rgba(140,220,255,0.6)', 'rgba(255,200,120,0.6)', 'rgba(120,255,200,0.5)'],
    signs: signSet(['#2effb1', '#ffb02e', '#4dc8ff'], -7),
    holos: [{ main: '港', sub: 'DOCK 13' }, { main: '鉄', sub: 'CARGO CO.' }],
    lampColor: '#d8f0ff', neonL: '#2effb1', neonR: '#ffb02e', moonColor: '#a8c8d8',
    ambient: ['#1e3a44', '#080e12', 0.55],
    weather: 'rain', props: ['cranes', 'containers'],
    banners: [{ text: '港', bg: '#0f3028', fg: '#b0ffe0' }, { text: '鉄', bg: '#30240f', fg: '#ffe8b0' }, { text: '波', bg: '#0f2430', fg: '#b0e0ff' }],
    crowdTint: '#0a1014', uiGradient: ['#08181c', '#182410'],
  }),
  mkStage({
    id: 'arcade', name: 'UNDERGROUND ARCADE', subtitle: 'INSERT COIN, INSERT PAIN',
    sky: '#0a0412', fogColor: '#120820', fogDensity: 0.05,
    ground: { color: '#140a1e', wet: false, lineColor: '#b06ad5' },
    buildingTint: '#120820', windowTints: ['rgba(255,100,220,0.9)', 'rgba(100,220,255,0.9)', 'rgba(180,120,255,0.9)'],
    signs: signSet(['#ff4dd8', '#4dfff2', '#b14dff'], -6),
    holos: [{ main: '遊', sub: 'GAME OVER' }, { main: '電', sub: 'HIGH SCORE' }],
    lampColor: '#e8b0ff', neonL: '#ff4dd8', neonR: '#4dfff2', moonColor: '#c890ff',
    ambient: ['#38184c', '#100418', 0.7],
    weather: 'clear', props: ['arcade', 'pillars'],
    banners: [{ text: '遊', bg: '#3f1050', fg: '#f0c0ff' }, { text: '電', bg: '#103f48', fg: '#c0fff0' }, { text: '夢', bg: '#301050', fg: '#d8c0ff' }],
    crowdTint: '#160a22', uiGradient: ['#240838', '#08283c'],
  }),
  mkStage({
    id: 'skybridge', name: 'SKYBRIDGE EXPRESS', subtitle: 'DUEL ABOVE THE TRAFFIC',
    sky: '#120a08', fogColor: '#1c100c', fogDensity: 0.03,
    ground: { color: '#1a1410', wet: true, lineColor: '#c8a878' },
    buildingTint: '#14100c', windowTints: ['rgba(255,180,110,0.9)', 'rgba(255,140,90,0.8)', 'rgba(255,220,150,0.85)'],
    signs: signSet(['#ff8a4d', '#ffd23b', '#ff5a7a'], -10),
    holos: [{ main: '橋', sub: 'SKYLINE EXP' }, { main: '夕', sub: 'DUEL 19:00' }],
    lampColor: '#ffc890', neonL: '#ff8a4d', neonR: '#ffd23b', moonColor: '#ffc8a0',
    ambient: ['#4c2c18', '#140c08', 0.6],
    weather: 'clear', props: ['trainlights', 'cranes'],
    banners: [{ text: '橋', bg: '#5f2c10', fg: '#ffdcc0' }, { text: '夕', bg: '#5f1028', fg: '#ffc0d0' }, { text: '速', bg: '#4a3a10', fg: '#fff0c0' }],
    crowdTint: '#161008', uiGradient: ['#301408', '#402010'],
  }),
  mkStage({
    id: 'alley', name: 'RAIN ALLEY', subtitle: 'ONE LIGHT. ONE WAY OUT.',
    sky: '#030408', fogColor: '#06080e', fogDensity: 0.055,
    ground: { color: '#0a0c10', wet: true, lineColor: '#5a6070' },
    buildingTint: '#07090e', windowTints: ['rgba(255,90,90,0.8)', 'rgba(160,180,220,0.4)', 'rgba(255,120,90,0.6)'],
    signs: signSet(['#ff2d3d', '#8fb4d8', '#ff6a5a'], -5.5),
    holos: [{ main: '影', sub: 'BACK STREET' }],
    lampColor: '#ffb0a0', neonL: '#ff2d3d', neonR: '#5a7a9a', moonColor: '#8fa8c8',
    ambient: ['#1c2438', '#06080c', 0.45],
    weather: 'storm', props: ['containers', 'benches'],
    banners: [{ text: '影', bg: '#3f0c14', fg: '#ffc0c0' }, { text: '雨', bg: '#101c30', fg: '#c0d8ff' }, { text: '刃', bg: '#2c1010', fg: '#ffd0c0' }],
    crowdTint: '#08090e', uiGradient: ['#14040a', '#0a0e1c'],
  }),
  mkStage({
    id: 'sakura', name: 'CHERRY BLOSSOM PLAZA', subtitle: 'BEAUTY BEFORE VIOLENCE',
    sky: '#0c0812', fogColor: '#140e1a', fogDensity: 0.035,
    ground: { color: '#181220', wet: false, lineColor: '#c8a0b8' },
    buildingTint: '#140e1a', windowTints: ['rgba(255,180,220,0.8)', 'rgba(255,220,240,0.7)', 'rgba(220,160,255,0.7)'],
    signs: signSet(['#ff8ac2', '#ffc2e0', '#c88aff'], -9),
    holos: [{ main: '桜', sub: 'HANAMI NIGHT' }, { main: '花', sub: 'PETAL FALL' }],
    lampColor: '#ffd8ec', neonL: '#ff8ac2', neonR: '#c88aff', moonColor: '#e8d0ff',
    ambient: ['#40244c', '#120c18', 0.6],
    weather: 'petals', props: ['sakura', 'lanterns'],
    banners: [{ text: '桜', bg: '#4c1834', fg: '#ffd0e8' }, { text: '花', bg: '#34184c', fg: '#e8d0ff' }, { text: '春', bg: '#4c1828', fg: '#ffd8d0' }],
    crowdTint: '#16101c', uiGradient: ['#2c1030', '#3c1830'],
  }),
  mkStage({
    id: 'foundry', name: 'INDUSTRIAL FOUNDRY', subtitle: 'SPARKS FLY BOTH WAYS',
    sky: '#0e0604', fogColor: '#180c06', fogDensity: 0.048,
    ground: { color: '#1c120c', wet: false, lineColor: '#a07048' },
    buildingTint: '#18100a', windowTints: ['rgba(255,140,60,0.95)', 'rgba(255,200,90,0.8)', 'rgba(255,90,40,0.85)'],
    signs: signSet(['#ff6a2e', '#ffa02e', '#ff3d2e'], -7),
    holos: [{ main: '鋼', sub: 'FOUNDRY 7' }, { main: '炎', sub: 'MOLTEN LINE' }],
    lampColor: '#ffb070', neonL: '#ff6a2e', neonR: '#ffa02e', moonColor: '#ff9060',
    ambient: ['#4c2410', '#160c06', 0.6],
    weather: 'embers', props: ['cranes', 'containers', 'pillars'],
    banners: [{ text: '鋼', bg: '#5f2410', fg: '#ffd8b0' }, { text: '炎', bg: '#5f1408', fg: '#ffc8a0' }, { text: '鍛', bg: '#4a2c10', fg: '#ffe0b0' }],
    crowdTint: '#1a100a', uiGradient: ['#38140a', '#4a2208'],
  }),
  mkStage({
    id: 'metro', name: 'METRO STATION 9', subtitle: 'LAST TRAIN TO NOWHERE',
    sky: '#04080a', fogColor: '#081214', fogDensity: 0.04,
    ground: { color: '#101618', wet: true, lineColor: '#d8d8a0' },
    buildingTint: '#0c1214', windowTints: ['rgba(200,255,220,0.8)', 'rgba(140,220,255,0.7)', 'rgba(255,240,180,0.75)'],
    signs: signSet(['#7dff9e', '#4dc8ff', '#e8ff7d'], -8),
    holos: [{ main: '駅', sub: 'LINE 9' }, { main: '次', sub: 'NEXT: 00:47' }],
    lampColor: '#e0ffe8', neonL: '#7dff9e', neonR: '#4dc8ff', moonColor: '#b8d8c8',
    ambient: ['#1c3a30', '#08100e', 0.65],
    weather: 'clear', props: ['trainlights', 'pillars', 'benches'],
    banners: [{ text: '駅', bg: '#10402c', fg: '#c0ffe0' }, { text: '電', bg: '#102c40', fg: '#c0e8ff' }, { text: '速', bg: '#2c4010', fg: '#f0ffc0' }],
    crowdTint: '#0c1416', uiGradient: ['#0c2c24', '#10283c'],
  }),
  mkStage({
    id: 'highway', name: 'HARBOR HIGHWAY', subtitle: 'UNDER THE OVERPASS',
    sky: '#04060c', fogColor: '#080c14', fogDensity: 0.038,
    ground: { color: '#0e1116', wet: true, lineColor: '#9aa0ac' },
    buildingTint: '#0a0e14', windowTints: ['rgba(255,90,90,0.75)', 'rgba(240,248,255,0.8)', 'rgba(120,200,255,0.7)'],
    signs: signSet(['#ff4d5e', '#e8f4ff', '#4da8ff'], -8),
    holos: [{ main: '道', sub: 'ROUTE 1' }, { main: '湾', sub: 'HARBOR EXPY' }],
    lampColor: '#ffe8c0', neonL: '#ff4d5e', neonR: '#4da8ff', moonColor: '#b0c4de',
    ambient: ['#24304c', '#0a0e14', 0.55],
    weather: 'rain', props: ['trainlights', 'containers'],
    banners: [{ text: '湾', bg: '#10243f', fg: '#c0dcff' }, { text: '道', bg: '#3f1018', fg: '#ffc0c8' }, { text: '走', bg: '#243040', fg: '#d0e0f0' }],
    crowdTint: '#0c1016', uiGradient: ['#101828', '#281018'],
  }),
  mkStage({
    id: 'electric', name: 'ELECTRIC DISTRICT', subtitle: 'GRID OVERLOAD',
    sky: '#040810', fogColor: '#081020', fogDensity: 0.034,
    ground: { color: '#0c1018', wet: true, lineColor: '#a8b8d0' },
    buildingTint: '#0a0e18', windowTints: ['rgba(255,240,120,0.9)', 'rgba(120,240,255,0.85)', 'rgba(200,255,150,0.7)'],
    signs: signSet(['#ffe14d', '#4df0ff', '#a8ff4d'], -8),
    holos: [{ main: '雷', sub: 'GRID 99%' }, { main: '電', sub: 'TESLA WORKS' }],
    lampColor: '#fff4b0', neonL: '#ffe14d', neonR: '#4df0ff', moonColor: '#c8d8ff',
    ambient: ['#303c58', '#0c1018', 0.65],
    weather: 'storm', props: ['tesla', 'pillars'],
    banners: [{ text: '雷', bg: '#4c4410', fg: '#fff8c0' }, { text: '電', bg: '#104048', fg: '#c0f8ff' }, { text: '光', bg: '#2c4010', fg: '#e0ffc0' }],
    crowdTint: '#0e1218', uiGradient: ['#2c2c0c', '#0c2c3c'],
  }),
  mkStage({
    id: 'dawn', name: 'DAWN SKYLINE', subtitle: 'THE FINAL SHOWDOWN',
    sky: '#1a1024', fogColor: '#241830', fogDensity: 0.026,
    ground: { color: '#1c1626', wet: false, lineColor: '#d8b890' },
    buildingTint: '#181220', windowTints: ['rgba(255,200,140,0.85)', 'rgba(255,160,120,0.7)', 'rgba(200,180,255,0.6)'],
    signs: signSet(['#ffb05e', '#ff7a8a', '#c8a0ff'], -10),
    holos: [{ main: '曙', sub: 'DAYBREAK' }, { main: '決', sub: 'FINAL DUEL' }],
    lampColor: '#ffd8a8', neonL: '#ff9a5e', neonR: '#ff7a9a', moonColor: '#ffc8a0',
    ambient: ['#5c3c50', '#1c1424', 0.75],
    weather: 'clear', props: ['sakura', 'benches'],
    banners: [{ text: '曙', bg: '#5f2c3c', fg: '#ffd8d0' }, { text: '決', bg: '#5f3c1c', fg: '#ffe8c0' }, { text: '朝', bg: '#3c2c5f', fg: '#e0d0ff' }],
    crowdTint: '#1c1420', uiGradient: ['#3c1c30', '#5f3418'],
  }),
];

export const STAGE_IDS = STAGES.map((s) => s.id);

export function getStage(id: string | null | undefined): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}
