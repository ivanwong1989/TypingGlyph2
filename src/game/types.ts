export type GameMode = 'title' | 'playing' | 'draft' | 'paused' | 'gameover' | 'victory';

export type EnemyKind = 'dot' | 'ring' | 'arrow' | 'pentagon' | 'diamond';

export type AbilityId = 'pulse' | 'still' | 'ward' | 'nova' | 'lance' | 'mend' | 'blot';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  radius: number;
  speed: number;
  damage: number;
  word: string;
  typedCount: number;
  armor: number; // 1 = normal, 2+ = armored (²)
  isSmudged: boolean;
  hitFlash: number;
  hitScale: number; // pop scale on hit
  shakeTimer: number;
  knockVx: number;
  knockVy: number;
  rotation: number;
  spawnAnim: number; // 0 -> 1
  fadeTimer: number; // >0 when Boss 2 (The Eraser) temporarily fades letters
  fadedIndices: number[];
}

export type BossId = 'compass' | 'eraser' | 'architect';

export interface BossState {
  id: BossId;
  name: string;
  subtitle: string;
  passage: string;
  typedIndex: number;
  phase: 1 | 2;
  attackTimer: number;
  hesitationTimer: number;
  eraseWaveY: number | null; // animated wipe line for The Eraser
  hitFlash: number;
  shakeTimer: number;
  rotation: number;
  enterAnim: number; // 0 -> 1
}

export interface Projectile {
  x: number;
  y: number;
  targetId: number | 'boss';
  targetX: number;
  targetY: number;
  speed: number;
  trail: Array<{ x: number; y: number }>;
  isFinal: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: 'dot' | 'line' | 'shard';
  rotation: number;
  vRot: number;
}

export interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  lineWidth: number;
  dashed?: boolean;
}

export interface InkStain {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
  blobs: Array<{ dx: number; dy: number; r: number }>;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export interface BeamEffect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface DeathBoom {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  sides: number; // geometric wireframe polygon burst (3, 4, 5, 6)
  rotation: number;
  rays: Array<{ angle: number; length: number }>;
}

export interface AbilityDef {
  id: AbilityId;
  command: string;
  label: string;
  cost: number; // out of 100
  description: string;
}

export type UpgradeKind = 'ability' | 'passive' | 'survival';

export interface UpgradeCard {
  id: string;
  keyword: string; // typed on desktop to select the card!
  title: string;
  kind: UpgradeKind;
  description: string;
  abilityId?: AbilityId;
}

export interface PlayerPassives {
  knockbackMult: number;
  chargeGainMult: number;
  smudgeGainMult: number;
  smudgeDryMult: number;
  chainSketch: boolean; // finishing a word damages nearest enemy's first 2 letters
  charcoalBurst: boolean; // smudged enemies explode on death
  vampiricNib: boolean; // heal 3 HP per word when < 50% HP
  autoCompass: boolean; // every 3rd word fires a free stray dart that strips 2 letters
}
