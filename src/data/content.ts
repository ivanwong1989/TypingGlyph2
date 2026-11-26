import { AbilityDef, AbilityId, BossId, DifficultyPreset, UpgradeCard } from '../game/types';

export const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  {
    id: 'relaxed',
    label: 'Relaxed',
    speedMult: 0.65,
    spawnRateMult: 0.72,
    damageMult: 0.7,
    description: 'Slower waves & gentler damage — chill studio pace',
  },
  {
    id: 'standard',
    label: 'Standard',
    speedMult: 0.85,
    spawnRateMult: 0.88,
    damageMult: 0.85,
    description: 'Balanced roguelike challenge across all 3 bosses',
  },
  {
    id: 'challenging',
    label: 'Challenging',
    speedMult: 1.0,
    spawnRateMult: 1.02,
    damageMult: 1.0,
    description: 'Brisk waves & sharp reflexes required',
  },
  {
    id: 'master',
    label: 'Master',
    speedMult: 1.22,
    spawnRateMult: 1.2,
    damageMult: 1.2,
    description: 'Relentless ink swarms for high-WPM masters',
  },
];

export const ALL_ABILITIES: Record<AbilityId, AbilityDef> = {
  pulse: {
    id: 'pulse',
    command: 'pulse',
    label: '!pulse',
    cost: 25,
    description: 'Drafting shockwave that knocks back nearby enemies',
  },
  still: {
    id: 'still',
    command: 'still',
    label: '!still',
    cost: 50,
    description: 'Slows all enemies by 65% for 4.5 seconds',
  },
  ward: {
    id: 'ward',
    command: 'ward',
    label: '!ward',
    cost: 50,
    description: 'Rotating geometric barrier that blocks 2 hits',
  },
  nova: {
    id: 'nova',
    command: 'nova',
    label: '!nova',
    cost: 75,
    description: 'Crimson ink ring stripping 1 layer from nearby foes',
  },
  lance: {
    id: 'lance',
    command: 'lance',
    label: '!lance',
    cost: 50,
    description: 'Piercing ruler-line beam through the closest enemy',
  },
  mend: {
    id: 'mend',
    command: 'mend',
    label: '!mend',
    cost: 75,
    description: 'Restores 55 HP to your center glyph',
  },
  blot: {
    id: 'blot',
    command: 'blot',
    label: '!blot',
    cost: 25,
    description: 'Clears Smudge & blasts nearest enemy with ink',
  },
  swarm: {
    id: 'swarm',
    command: 'swarm',
    label: '!swarm',
    cost: 50,
    description: 'Launches 6 homing calligraphy ink darts across the page',
  },
  orbit: {
    id: 'orbit',
    command: 'orbit',
    label: '!orbit',
    cost: 75,
    description: 'Dual spinning pencil lasers sweep the arena for 4.5s',
  },
  drone: {
    id: 'drone',
    command: 'drone',
    label: '!drone',
    cost: 50,
    description: 'Deploys 2 origami hunter drones that auto-zap foes for 8s',
  },
};

export const UPGRADE_POOL: UpgradeCard[] = [
  // Draftable Active ! Abilities
  {
    id: 'ab_still',
    keyword: 'still',
    title: '!still',
    kind: 'ability',
    abilityId: 'still',
    description: 'Active (50): Slow all enemies by 65% for 4.5s.',
  },
  {
    id: 'ab_ward',
    keyword: 'ward',
    title: '!ward',
    kind: 'ability',
    abilityId: 'ward',
    description: 'Active (50): Geometric barrier blocking next 2 hits.',
  },
  {
    id: 'ab_nova',
    keyword: 'nova',
    title: '!nova',
    kind: 'ability',
    abilityId: 'nova',
    description: 'Active (75): Crimson ink blast clearing nearby foes.',
  },
  {
    id: 'ab_lance',
    keyword: 'lance',
    title: '!lance',
    kind: 'ability',
    abilityId: 'lance',
    description: 'Active (50): Piercing ruler-beam through closest foe.',
  },
  {
    id: 'ab_mend',
    keyword: 'mend',
    title: '!mend',
    kind: 'ability',
    abilityId: 'mend',
    description: 'Active (75): Restore 55 HP to your center glyph.',
  },
  {
    id: 'ab_blot',
    keyword: 'blot',
    title: '!blot',
    kind: 'ability',
    abilityId: 'blot',
    description: 'Active (25): Wipe Smudge & blast nearest enemy.',
  },
  {
    id: 'ab_swarm',
    keyword: 'darts',
    title: '!swarm',
    kind: 'ability',
    abilityId: 'swarm',
    description: 'Active (50): Fire 6 curving homing ink darts at foes.',
  },
  {
    id: 'ab_orbit',
    keyword: 'orbit',
    title: '!orbit',
    kind: 'ability',
    abilityId: 'orbit',
    description: 'Active (75): Dual spinning pencil lasers sweep for 4.5s.',
  },
  {
    id: 'ab_drone',
    keyword: 'drone',
    title: '!drone',
    kind: 'ability',
    abilityId: 'drone',
    description: 'Active (50): Launch 2 hunting paper drones for 8s.',
  },

  // Passive Modifiers
  {
    id: 'pas_sharp',
    keyword: 'sharp',
    title: 'Sharp Lead',
    kind: 'passive',
    description: '+45% knockback on every per-letter graphite dart.',
  },
  {
    id: 'pas_chain',
    keyword: 'chain',
    title: 'Chain Sketch',
    kind: 'passive',
    description: 'Finishing a word strikes 2 letters off a nearby foe.',
  },
  {
    id: 'pas_flow',
    keyword: 'flow',
    title: 'Ink Flow',
    kind: 'passive',
    description: '+40% shared charge gain from every completed word.',
  },
  {
    id: 'pas_compass',
    keyword: 'arc',
    title: 'Auto-Compass',
    kind: 'passive',
    description: 'Every 3rd word fires a free dart damaging closest foe.',
  },
  {
    id: 'pas_burst',
    keyword: 'char',
    title: 'Charcoal Burst',
    kind: 'passive',
    description: 'Smudged enemies explode in a crimson shockwave on death.',
  },

  // Survival / Random Healing & Smudge Control
  {
    id: 'sur_fresh',
    keyword: 'fresh',
    title: 'Fresh Sheet',
    kind: 'survival',
    description: '+60 Max HP and immediately restore 60 HP.',
  },
  {
    id: 'sur_vamp',
    keyword: 'quill',
    title: 'Vampiric Nib',
    kind: 'survival',
    description: 'Restore 4 HP per completed word while below 50% HP.',
  },
  {
    id: 'sur_dry',
    keyword: 'dry',
    title: 'Blotter Paper',
    kind: 'survival',
    description: '-35% Smudge buildup and +60% faster drying speed.',
  },
];

export interface BossConfig {
  id: BossId;
  name: string;
  subtitle: string;
  passages: string[];
}

export const BOSS_CONFIGS: Record<BossId, BossConfig> = {
  compass: {
    id: 'compass',
    name: 'The Compass',
    subtitle: 'Stage 1 Guardian',
    passages: [
      'to be or not to be that is the measure of the circle and the line',
      'draw the arc hold the center every point obeys the steady hand',
    ],
  },
  eraser: {
    id: 'eraser',
    name: 'The Eraser',
    subtitle: 'Stage 2 Guardian',
    passages: [
      'fade the margin wipe the slate only crisp strokes survive the rubber tide keep your rhythm never hesitate',
      'what is written can be undone smudge the letter blur the ink keep typing through the fading page',
    ],
  },
  architect: {
    id: 'architect',
    name: 'The Architect',
    subtitle: 'Final Guardian',
    passages: [
      'every angle every glyph converges at the center of the sheet steady your breath break the symmetry shatter the frame and claim the final line',
      'from single dot to grand design the compass turns the ink runs deep outpace the swarm rewrite the blueprint and finish the page',
    ],
  },
};
