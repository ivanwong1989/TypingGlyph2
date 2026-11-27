import { SoundEngine } from '../audio/sound';
import { ALL_ABILITIES, BOSS_CONFIGS, DIFFICULTY_PRESETS, UPGRADE_POOL } from '../data/content';
import { MEDIUM_WORDS, SHORT_WORDS, pickWord } from '../data/words';
import { MobileKeyboardUI } from '../ui/mobileKeyboard';
import { NativeKeyboardController } from '../ui/nativeKeyboard';
import {
  AbilityDef,
  AbilityId,
  BeamEffect,
  BossId,
  BossState,
  DeathBoom,
  DifficultyPreset,
  Enemy,
  EnemyKind,
  FloatingText,
  GameMode,
  HomingDart,
  HunterDrone,
  InkStain,
  OrbitLaserState,
  Particle,
  PlayerPassives,
  Projectile,
  Ripple,
  UpgradeCard,
} from './types';

const PALETTE = {
  paper: '#F2EFE9',
  ink: '#2B2A29',
  inkMuted: '#8C8984',
  inkFaint: '#C4BFB6',
  crimson: '#B83A3A',
  smudge: '#3A3836',
  slotBg: '#E3DFD6',
  slotBorder: '#BDB7AC',
  gold: '#9E7332',
};

const BASE_MAX_HP = 300;
const PLAYER_RADIUS = 18;
const SMUDGE_PER_TYPO = 25;
const SMUDGE_DRY_DELAY = 0.85;
const SMUDGE_DRY_RATE = 9;
const MAX_CHARGE = 100;
const STAGE_WAVE_DURATION = 75; // 1:15 per stage wave -> ~5 min full 3-stage boss run

export class TypingGlyphGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sound = new SoundEngine();
  private mobileKb = new MobileKeyboardUI();
  private nativeKb: NativeKeyboardController;
  private mobileOverride: boolean | null = null;
  private mobileKeyboardMode: 'builtin' | 'native' = 'builtin';

  private width = window.innerWidth;
  private height = window.innerHeight;
  private visibleHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private paperPattern: CanvasPattern | null = null;

  private mode: GameMode = 'title';
  private titleBuffer = '';
  private retryBuffer = '';
  private difficultyIndex = 1; // 0=Relaxed, 1=Standard, 2=Challenging, 3=Master

  // Active weapon ability entities
  private homingDarts: HomingDart[] = [];
  private hunterDrones: HunterDrone[] = [];
  private orbitLaser: OrbitLaserState | null = null;

  // Run & Stage state
  private elapsed = 0;
  private stage: 1 | 2 | 3 = 1;
  private stageTimer = 0;
  private maxHp = BASE_MAX_HP;
  private hp = BASE_MAX_HP;
  private score = 0;
  private charge = 25;
  private xp = 0;
  private xpToNext = 120;
  private level = 1;
  private wardHits = 0;
  private slowTimer = 0;

  // Passives & Loadout (5 slots)
  private equippedAbilities: AbilityId[] = ['pulse'];
  private ownedUpgradeIds = new Set<string>();
  private passives: PlayerPassives = this.defaultPassives();
  private autoCompassCounter = 0;

  // Draft state (typing-to-select 3 cards!)
  private draftCards: UpgradeCard[] = [];
  private draftLockedIndex: number | null = null;
  private draftTypedCount = 0;
  private draftShakeTimer = 0;
  private draftTitle = 'Choose an Upgrade';
  private pendingNextStage = false;

  // Boss state
  private boss: BossState | null = null;
  private bossLocked = false;

  // Smudge state
  private smudge = 0;
  private smudgeDryWait = 0;
  private smudgePrimed = false;
  private smudgeFlash = 0;
  private smudgesTriggered = 0;

  // Combat & Input state
  private enemies: Enemy[] = [];
  private nextEnemyId = 1;
  private lockedEnemyId: number | null = null;
  private abilityMode = false;
  private abilityBuffer = '';
  private abilityShake = 0;
  private toastText = '';
  private toastTimer = 0;

  // Stats
  private correctKeys = 0;
  private totalKeys = 0;
  private wordsCompleted = 0;
  private streak = 0;
  private bestStreak = 0;

  // Juice & VFX
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private inkStains: InkStain[] = [];
  private floatingTexts: FloatingText[] = [];
  private beams: BeamEffect[] = [];
  private deathBooms: DeathBoom[] = [];
  private spawnTimer = 0.6;
  private screenShake = 0;
  private damageFlash = 0;
  private glyphKick = 0;
  private glyphAngle = 0;
  private pulseTime = 0;

  // Loop
  private rafId = 0;
  private lastTimestamp = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize 2D canvas context');
    this.ctx = ctx;

    this.nativeKb = new NativeKeyboardController({
      onLetter: (letter) => {
        if (this.isNativeKeyboardActive() && this.mode === 'playing') {
          this.handleCombatTyping(letter);
        }
      },
      onUnlock: () => {
        if (this.isNativeKeyboardActive() && this.mode === 'playing') {
          this.unlockCurrentTarget();
        }
      },
    });

    this.createPaperGrainPattern();
    this.loadDifficulty();
    this.loadMobileKeyboardMode();
    this.resize();

    window.addEventListener('resize', this.handleResize);
    window.visualViewport?.addEventListener('resize', this.handleVisualViewport);
    window.visualViewport?.addEventListener('scroll', this.handleVisualViewport);
    window.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
  }

  private defaultPassives(): PlayerPassives {
    return {
      knockbackMult: 1,
      chargeGainMult: 1,
      smudgeGainMult: 1,
      smudgeDryMult: 1,
      chainSketch: false,
      charcoalBurst: false,
      vampiricNib: false,
      autoCompass: false,
    };
  }

  public startLoop(): void {
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - this.lastTimestamp) / 1000, 0.05);
      this.lastTimestamp = now;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.sound.music.stop();
    this.nativeKb.destroy();
    window.removeEventListener('resize', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleVisualViewport);
    window.visualViewport?.removeEventListener('scroll', this.handleVisualViewport);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
  }

  private isMobileMode(): boolean {
    if (this.mobileOverride !== null) return this.mobileOverride;
    const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    return coarse || this.width < 768;
  }

  private isNativeKeyboardActive(): boolean {
    return this.isMobileMode() && this.mobileKeyboardMode === 'native';
  }

  private layoutMobileKb(): void {
    const nativeActive = this.isNativeKeyboardActive();
    const effectiveH = nativeActive ? this.visibleHeight : this.height;
    this.mobileKb.layout(this.width, effectiveH, nativeActive);
  }

  private unlockCurrentTarget(): void {
    if (this.lockedEnemyId !== null) {
      const locked = this.enemies.find((en) => en.id === this.lockedEnemyId);
      if (locked) locked.typedCount = 0;
      this.lockedEnemyId = null;
      this.sound.playDetarget();
    } else if (this.bossLocked) {
      this.bossLocked = false;
      this.sound.playDetarget();
    }
  }

  private getArenaBottomY(): number {
    return this.isMobileMode() ? this.mobileKb.abilityBarTopY - 18 : this.height;
  }

  private getArenaCenterY(): number {
    if (!this.isMobileMode()) return this.height / 2;
    const topMargin = 52;
    const bottom = this.getArenaBottomY();
    return Math.max(130, topMargin + (bottom - topMargin) * 0.54);
  }

  private createPaperGrainPattern(): void {
    const size = 128;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d');
    if (!octx) return;

    octx.fillStyle = PALETTE.paper;
    octx.fillRect(0, 0, size, size);

    const img = octx.getImageData(0, 0, size, size);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 11;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    octx.putImageData(img, 0, 0);
    this.paperPattern = this.ctx.createPattern(off, 'repeat');
  }

  private handleResize = (): void => {
    this.resize();
  };

  private handleVisualViewport = (): void => {
    this.visibleHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
    if (this.isNativeKeyboardActive()) {
      if (window.scrollY !== 0 || window.scrollX !== 0 || (window.visualViewport?.offsetTop ?? 0) > 0) {
        window.scrollTo(0, 0);
      }
    }
    this.layoutMobileKb();
  };

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.visibleHeight = Math.round(window.visualViewport?.height ?? this.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layoutMobileKb();
  }

  private loadMobileKeyboardMode(): void {
    try {
      const saved = window.localStorage.getItem('typingglyph_mobile_kb');
      if (saved === 'builtin' || saved === 'native') {
        this.mobileKeyboardMode = saved;
      }
    } catch {
      // ignore storage errors
    }
  }

  private setMobileKeyboardMode(mode: 'builtin' | 'native'): void {
    this.mobileKeyboardMode = mode;
    try {
      window.localStorage.setItem('typingglyph_mobile_kb', mode);
    } catch {
      // ignore
    }
    this.layoutMobileKb();
  }

  private loadDifficulty(): void {
    try {
      const saved = window.localStorage.getItem('typingglyph_difficulty');
      if (saved !== null) {
        const idx = Number(saved);
        if (idx >= 0 && idx < DIFFICULTY_PRESETS.length) {
          this.difficultyIndex = idx;
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  private setDifficultyIndex(idx: number): void {
    this.difficultyIndex = Math.max(0, Math.min(DIFFICULTY_PRESETS.length - 1, idx));
    try {
      window.localStorage.setItem('typingglyph_difficulty', String(this.difficultyIndex));
    } catch {
      // ignore
    }
  }

  private getDifficulty(): DifficultyPreset {
    return DIFFICULTY_PRESETS[this.difficultyIndex] ?? DIFFICULTY_PRESETS[1];
  }

  private handlePointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;

    // Top-right Audio toggle
    if (x > this.width - 92 && y < 44) {
      this.sound.toggleMute();
      return;
    }

    // Top-right Mobile/Desktop preview toggle (to the left of Audio)
    if (x > this.width - 196 && x <= this.width - 96 && y < 44) {
      this.mobileOverride = !this.isMobileMode();
      this.layoutMobileKb();
      if (!this.isNativeKeyboardActive()) {
        this.nativeKb.blur();
      } else if (this.mode === 'playing') {
        this.nativeKb.focus();
      }
      return;
    }

    // Mobile second row: [KB: Built-in]/[KB: Native] toggle + Pause/Resume button
    if (this.isMobileMode() && (this.mode === 'playing' || this.mode === 'paused')) {
      if (x > this.width - 175 && x <= this.width - 70 && y >= 44 && y < 78) {
        const nextMode = this.mobileKeyboardMode === 'builtin' ? 'native' : 'builtin';
        this.setMobileKeyboardMode(nextMode);
        this.sound.playKeyHit(nextMode === 'native' ? 10 : 6);
        this.showToast(nextMode === 'native' ? 'Keyboard: Native OS' : 'Keyboard: Built-in');
        if (this.mode === 'playing') {
          if (nextMode === 'native') this.nativeKb.focus();
          else this.nativeKb.blur();
        } else {
          this.nativeKb.blur();
        }
        return;
      }

      if (x > this.width - 70 && y >= 44 && y < 78) {
        if (this.mode === 'paused') {
          this.mode = 'playing';
          this.sound.music.setMuffled(false);
          if (this.isNativeKeyboardActive()) this.nativeKb.focus();
        } else {
          this.mode = 'paused';
          this.sound.music.setMuffled(true);
          this.nativeKb.blur();
        }
        return;
      }
    }

    // Title screen interactions (Difficulty Slider + Mobile KB Toggle + Tap-to-Start)
    if (this.mode === 'title') {
      this.sound.startMusic();
      this.sound.music.setIntensity(0);
      const slider = this.getDifficultySliderRect();
      if (
        x >= slider.x - 24 &&
        x <= slider.x + slider.w + 24 &&
        y >= slider.y - 24 &&
        y <= slider.y + 38
      ) {
        const t = Math.max(0, Math.min(1, (x - slider.x) / slider.w));
        const idx = Math.round(t * (DIFFICULTY_PRESETS.length - 1));
        this.setDifficultyIndex(idx);
        this.sound.playKeyHit(4 + idx * 3);
        return;
      }

      if (this.isMobileMode()) {
        const kbToggle = this.getKeyboardToggleRect();
        if (
          x >= kbToggle.x &&
          x <= kbToggle.x + kbToggle.w &&
          y >= kbToggle.y &&
          y <= kbToggle.y + kbToggle.h
        ) {
          const nextMode = this.mobileKeyboardMode === 'builtin' ? 'native' : 'builtin';
          this.setMobileKeyboardMode(nextMode);
          this.sound.playKeyHit(nextMode === 'native' ? 10 : 6);
          return;
        }
      }

      const startBtn = this.getStartButtonRect();
      if (x >= startBtn.x && x <= startBtn.x + startBtn.w && y >= startBtn.y && y <= startBtn.y + startBtn.h) {
        this.sound.playAbilityCast();
        this.startNewRun();
        if (this.isNativeKeyboardActive()) this.nativeKb.focus();
        return;
      }
      return;
    }

    // Paused screen tap to resume
    if (this.mode === 'paused') {
      this.mode = 'playing';
      this.sound.music.setMuffled(false);
      if (this.isNativeKeyboardActive()) this.nativeKb.focus();
      return;
    }

    // Game Over / Victory tap-to-retry button
    if (this.mode === 'gameover' || this.mode === 'victory') {
      const btn = this.getRetryButtonRect();
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        this.sound.playAbilityCast();
        this.startNewRun();
        if (this.isNativeKeyboardActive()) this.nativeKb.focus();
      }
      return;
    }

    // Draft screen: tap any card directly
    if (this.mode === 'draft' && this.draftCards.length > 0) {
      const layout = this.getDraftCardRects();
      for (let i = 0; i < layout.length; i++) {
        const r = layout[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          this.applyUpgradeCard(this.draftCards[i]);
          if (this.isNativeKeyboardActive()) this.nativeKb.focus();
          return;
        }
      }
      return;
    }

    // Mobile Playing: Touch-Tap Ability Bar & Custom QWERTY Keyboard (or Native OS Keyboard focus)
    if (this.mode === 'playing' && this.isMobileMode()) {
      const abIdx = this.mobileKb.hitTestAbility(x, y);
      if (abIdx !== null) {
        const equipped = this.getEquippedAbilityDefs();
        const ab = equipped[abIdx];
        if (ab) this.castAbility(ab);
        if (this.isNativeKeyboardActive()) this.nativeKb.focus();
        return;
      }

      if (this.isNativeKeyboardActive()) {
        this.nativeKb.focus();
        return;
      }

      const tappedKey = this.mobileKb.hitTestKey(x, y);
      if (tappedKey !== null) {
        if (tappedKey === 'UNLOCK') {
          this.unlockCurrentTarget();
        } else {
          this.handleCombatTyping(tappedKey);
        }
      }
    }
  };

  private startNewRun(): void {
    this.sound.startMusic();
    this.sound.music.setMuffled(false);
    this.sound.music.setIntensity(1);

    this.mode = 'playing';
    this.elapsed = 0;
    this.stage = 1;
    this.stageTimer = 0;
    this.maxHp = BASE_MAX_HP;
    this.hp = BASE_MAX_HP;
    this.score = 0;
    this.charge = 25;
    this.xp = 0;
    this.xpToNext = 120;
    this.level = 1;
    this.wardHits = 0;
    this.slowTimer = 0;

    this.equippedAbilities = ['pulse'];
    this.ownedUpgradeIds.clear();
    this.passives = this.defaultPassives();
    this.autoCompassCounter = 0;

    this.draftCards = [];
    this.draftLockedIndex = null;
    this.draftTypedCount = 0;
    this.pendingNextStage = false;

    this.boss = null;
    this.bossLocked = false;

    this.smudge = 0;
    this.smudgeDryWait = 0;
    this.smudgePrimed = false;
    this.smudgeFlash = 0;
    this.smudgesTriggered = 0;

    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.ripples = [];
    this.inkStains = [];
    this.floatingTexts = [];
    this.beams = [];
    this.deathBooms = [];
    this.homingDarts = [];
    this.hunterDrones = [];
    this.orbitLaser = null;
    this.lockedEnemyId = null;
    this.abilityMode = false;
    this.abilityBuffer = '';
    this.abilityShake = 0;
    this.toastText = 'Stage 1 — Sketch';
    this.toastTimer = 2.0;

    this.correctKeys = 0;
    this.totalKeys = 0;
    this.wordsCompleted = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.spawnTimer = this.isMobileMode() ? 1.6 : 0.5;
    this.screenShake = 0;
    this.damageFlash = 0;

    this.spawnEnemy('dot');
    if (!this.isMobileMode()) {
      this.spawnEnemy('dot');
    }
  }

  private getEquippedAbilityDefs(): AbilityDef[] {
    return this.equippedAbilities.map((id) => ALL_ABILITIES[id]);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;

    if (this.mode === 'title') {
      this.sound.startMusic();
      this.sound.music.setIntensity(0);
      if (key === 'ArrowLeft') {
        e.preventDefault();
        this.setDifficultyIndex(this.difficultyIndex - 1);
        this.sound.playKeyHit(4 + this.difficultyIndex * 3);
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        this.setDifficultyIndex(this.difficultyIndex + 1);
        this.sound.playKeyHit(4 + this.difficultyIndex * 3);
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        this.sound.playAbilityCast();
        this.startNewRun();
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        this.titleBuffer = '';
        return;
      }
      if (/^[a-zA-Z]$/.test(key)) {
        const target = 'start';
        const lower = key.toLowerCase();
        if (target[this.titleBuffer.length] === lower) {
          this.titleBuffer += lower;
          this.sound.playKeyHit(this.titleBuffer.length);
          if (this.titleBuffer === target) {
            this.titleBuffer = '';
            this.sound.playAbilityCast();
            this.startNewRun();
          }
        } else {
          this.titleBuffer = lower === 's' ? 's' : '';
          this.sound.playTypo();
        }
      }
      return;
    }

    if (this.mode === 'gameover' || this.mode === 'victory') {
      if (key === 'Enter') {
        e.preventDefault();
        this.sound.playAbilityCast();
        this.startNewRun();
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        this.retryBuffer = '';
        return;
      }
      if (/^[a-zA-Z]$/.test(key)) {
        const target = 'retry';
        const lower = key.toLowerCase();
        if (target[this.retryBuffer.length] === lower) {
          this.retryBuffer += lower;
          this.sound.playKeyHit(this.retryBuffer.length);
          if (this.retryBuffer === target) {
            this.retryBuffer = '';
            this.sound.playAbilityCast();
            this.startNewRun();
          }
        } else {
          this.retryBuffer = lower === 'r' ? 'r' : '';
          this.sound.playTypo();
        }
      }
      return;
    }

    // Typing-to-select Upgrade Draft
    if (this.mode === 'draft') {
      if (key === ' ') {
        e.preventDefault();
        if (this.draftLockedIndex !== null) {
          this.draftLockedIndex = null;
          this.draftTypedCount = 0;
          this.sound.playDetarget();
        }
        return;
      }
      if (!/^[a-zA-Z]$/.test(key)) return;
      e.preventDefault();
      this.handleDraftTyping(key.toLowerCase());
      return;
    }

    if (key === 'Escape') {
      e.preventDefault();
      if (this.mode === 'paused') {
        this.mode = 'playing';
        this.sound.music.setMuffled(false);
        if (this.isNativeKeyboardActive()) this.nativeKb.focus();
      } else if (this.mode === 'playing') {
        this.mode = 'paused';
        this.sound.music.setMuffled(true);
        this.nativeKb.blur();
      }
      return;
    }

    if (this.mode !== 'playing') return;

    // Prevent double-input: when Mobile Native OS Keyboard is active, NativeKeyboardController handles a-zA-Z and Space
    if (this.isNativeKeyboardActive() && (key === ' ' || /^[a-zA-Z]$/.test(key))) {
      return;
    }

    // Detargeting / canceling ability mode (Spacebar only)
    if (key === ' ') {
      e.preventDefault();
      if (this.abilityMode) {
        this.abilityMode = false;
        this.abilityBuffer = '';
        this.sound.playDetarget();
      } else if (this.lockedEnemyId !== null) {
        const locked = this.enemies.find((en) => en.id === this.lockedEnemyId);
        if (locked) locked.typedCount = 0;
        this.lockedEnemyId = null;
        this.sound.playDetarget();
      } else if (this.bossLocked) {
        this.bossLocked = false;
        this.sound.playDetarget();
      }
      return;
    }

    // Enter ! Glyph Cast Mode
    if (key === '!') {
      e.preventDefault();
      if (this.lockedEnemyId !== null) {
        const locked = this.enemies.find((en) => en.id === this.lockedEnemyId);
        if (locked) locked.typedCount = 0;
        this.lockedEnemyId = null;
      }
      this.bossLocked = false;
      this.abilityMode = true;
      this.abilityBuffer = '';
      this.sound.playKeyHit(8);
      return;
    }

    if (!/^[a-zA-Z]$/.test(key)) return;
    e.preventDefault();
    const letter = key.toLowerCase();

    if (this.abilityMode) {
      this.handleAbilityTyping(letter);
    } else {
      this.handleCombatTyping(letter);
    }
  };

  // ==================== DRAFT SYSTEM ====================

  private openDraft(title: string, advanceStageAfter = false): void {
    this.mode = 'draft';
    this.nativeKb.blur();
    this.draftTitle = title;
    this.pendingNextStage = advanceStageAfter;
    this.draftLockedIndex = null;
    this.draftTypedCount = 0;
    this.draftShakeTimer = 0;
    this.lockedEnemyId = null;
    this.bossLocked = false;
    this.abilityMode = false;
    this.abilityBuffer = '';
    this.screenShake = 0;
    this.sound.music.setMuffled(true);

    // Filter eligible cards
    const canAddAbility = this.equippedAbilities.length < 5;
    const eligible = UPGRADE_POOL.filter((card) => {
      if (card.kind === 'ability') {
        return canAddAbility && card.abilityId && !this.equippedAbilities.includes(card.abilityId);
      }
      if (card.id === 'sur_fresh' || card.id === 'pas_sharp' || card.id === 'pas_flow') {
        return true; // stackable
      }
      return !this.ownedUpgradeIds.has(card.id);
    });

    // Pick 3 cards with guaranteed unique starting letters (ensure at least 1 active ability if slots open)
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const chosen: UpgradeCard[] = [];
    const usedLetters = new Set<string>();

    if (canAddAbility) {
      const firstAbility = shuffled.find((c) => c.kind === 'ability');
      if (firstAbility) {
        chosen.push(firstAbility);
        usedLetters.add(firstAbility.keyword[0]);
      }
    }

    for (const card of shuffled) {
      if (chosen.length >= 3) break;
      if (chosen.includes(card)) continue;
      const first = card.keyword[0];
      if (!usedLetters.has(first)) {
        usedLetters.add(first);
        chosen.push(card);
      }
    }
    this.draftCards = chosen;
  }

  private handleDraftTyping(letter: string): void {
    if (this.draftLockedIndex === null) {
      const idx = this.draftCards.findIndex((c) => c.keyword[0] === letter);
      if (idx === -1) {
        this.draftShakeTimer = 0.2;
        this.sound.playTypo();
        return;
      }
      this.draftLockedIndex = idx;
      this.draftTypedCount = 1;
      this.sound.playKeyHit(6);
      if (this.draftTypedCount >= this.draftCards[idx].keyword.length) {
        this.applyUpgradeCard(this.draftCards[idx]);
      }
      return;
    }

    const card = this.draftCards[this.draftLockedIndex];
    if (card.keyword[this.draftTypedCount] === letter) {
      this.draftTypedCount += 1;
      this.sound.playKeyHit(6 + this.draftTypedCount);
      if (this.draftTypedCount >= card.keyword.length) {
        this.applyUpgradeCard(card);
      }
    } else {
      this.draftShakeTimer = 0.2;
      this.sound.playTypo();
    }
  }

  private applyUpgradeCard(card: UpgradeCard): void {
    this.sound.playAbilityCast();
    this.ownedUpgradeIds.add(card.id);

    if (card.kind === 'ability' && card.abilityId) {
      if (!this.equippedAbilities.includes(card.abilityId)) {
        this.equippedAbilities.push(card.abilityId);
      }
    } else {
      switch (card.id) {
        case 'pas_sharp':
          this.passives.knockbackMult += 0.45;
          break;
        case 'pas_chain':
          this.passives.chainSketch = true;
          break;
        case 'pas_flow':
          this.passives.chargeGainMult += 0.4;
          break;
        case 'pas_compass':
          this.passives.autoCompass = true;
          break;
        case 'pas_burst':
          this.passives.charcoalBurst = true;
          break;
        case 'sur_fresh':
          this.maxHp += 60;
          this.hp = Math.min(this.maxHp, this.hp + 60);
          this.spawnFloatingText(this.width / 2, this.height / 2 - 36, '+60 HP', PALETTE.gold, 15);
          break;
        case 'sur_vamp':
          this.passives.vampiricNib = true;
          break;
        case 'sur_dry':
          this.passives.smudgeGainMult *= 0.65;
          this.passives.smudgeDryMult *= 1.6;
          break;
      }
    }

    this.mode = 'playing';
    this.sound.music.setMuffled(false);

    if (this.pendingNextStage) {
      this.pendingNextStage = false;
      if (this.stage < 3) {
        this.stage = (this.stage + 1) as 1 | 2 | 3;
        this.stageTimer = 0;
        const stageNames: Record<number, string> = {
          2: 'Stage 2 — Crosshatch',
          3: 'Stage 3 — Calligraphy',
        };
        this.showToast(stageNames[this.stage] ?? `Stage ${this.stage}`);
        this.syncMusicIntensity();
      }
    } else {
      this.showToast(`Drafted: ${card.title}`);
    }
  }

  // ==================== ABILITIES ====================

  private handleAbilityTyping(letter: string): void {
    const equipped = this.getEquippedAbilityDefs();
    const nextBuf = this.abilityBuffer + letter;
    const matches = equipped.filter((ab) => ab.command.startsWith(nextBuf));

    if (matches.length === 0) {
      this.abilityShake = 0.2;
      this.sound.playTypo();
      return;
    }

    this.abilityBuffer = nextBuf;
    this.sound.playKeyHit(10);

    const exact = matches.find((ab) => ab.command === this.abilityBuffer);
    if (exact) {
      this.abilityMode = false;
      this.abilityBuffer = '';
      this.castAbility(exact);
    }
  }

  private castAbility(ability: AbilityDef): void {
    if (this.charge < ability.cost) {
      this.sound.playTypo();
      this.showToast(`Need ${ability.cost} charge for ${ability.label}`);
      return;
    }

    this.charge = Math.max(0, this.charge - ability.cost);
    this.sound.playAbilityCast();
    this.glyphKick = 1.0;

    const cx = this.width / 2;
    const cy = this.getArenaCenterY();

    switch (ability.id) {
      case 'pulse': {
        const radius = Math.min(this.width, this.height) * 0.44;
        this.ripples.push(
          { x: cx, y: cy, radius: PLAYER_RADIUS, maxRadius: radius, life: 0.45, maxLife: 0.45, color: PALETTE.ink, lineWidth: 2.5 },
          { x: cx, y: cy, radius: PLAYER_RADIUS, maxRadius: radius * 0.78, life: 0.35, maxLife: 0.35, color: PALETTE.crimson, lineWidth: 1.4, dashed: true }
        );
        this.screenShake = Math.max(this.screenShake, 4);
        for (const en of this.enemies) {
          const dx = en.x - cx;
          const dy = en.y - cy;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < radius * 1.15) {
            const push = 420;
            en.knockVx += (dx / dist) * push;
            en.knockVy += (dy / dist) * push;
            en.hitFlash = 0.14;
          }
        }
        this.showToast('!pulse — Shockwave');
        break;
      }

      case 'still': {
        this.slowTimer = 4.5;
        this.ripples.push({
          x: cx,
          y: cy,
          radius: PLAYER_RADIUS,
          maxRadius: Math.max(this.width, this.height) * 0.7,
          life: 0.65,
          maxLife: 0.65,
          color: PALETTE.inkMuted,
          lineWidth: 1.8,
          dashed: true,
        });
        this.showToast('!still — Time slowed 4.5s');
        break;
      }

      case 'ward': {
        this.wardHits = Math.min(this.wardHits + 2, 4);
        this.ripples.push({
          x: cx,
          y: cy,
          radius: PLAYER_RADIUS + 8,
          maxRadius: 72,
          life: 0.38,
          maxLife: 0.38,
          color: PALETTE.crimson,
          lineWidth: 2.2,
        });
        this.showToast(`!ward — Barrier (${this.wardHits} hits)`);
        break;
      }

      case 'nova': {
        const novaRadius = Math.min(this.width, this.height) * 0.4;
        this.ripples.push(
          { x: cx, y: cy, radius: PLAYER_RADIUS, maxRadius: novaRadius, life: 0.52, maxLife: 0.52, color: PALETTE.crimson, lineWidth: 4 },
          { x: cx, y: cy, radius: PLAYER_RADIUS, maxRadius: novaRadius * 0.65, life: 0.4, maxLife: 0.4, color: PALETTE.ink, lineWidth: 1.5, dashed: true }
        );
        this.screenShake = Math.max(this.screenShake, 8);
        this.spawnParticles(cx, cy, PALETTE.crimson, 24);

        const toCheck = [...this.enemies];
        for (const en of toCheck) {
          if (Math.hypot(en.x - cx, en.y - cy) <= novaRadius) {
            this.stripEnemyLayer(en, false);
          }
        }
        this.showToast('!nova — Crimson Ink Burst');
        break;
      }

      case 'lance': {
        const closest = this.findClosestEnemy();
        const angle = closest ? Math.atan2(closest.y - cy, closest.x - cx) : -Math.PI / 2;
        const len = Math.max(this.width, this.height);
        const x2 = cx + Math.cos(angle) * len;
        const y2 = cy + Math.sin(angle) * len;

        this.beams.push({ x1: cx, y1: cy, x2, y2, life: 0.38, maxLife: 0.38, color: PALETTE.crimson });
        this.screenShake = Math.max(this.screenShake, 7);

        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const toCheck = [...this.enemies];
        for (const en of toCheck) {
          const ex = en.x - cx;
          const ey = en.y - cy;
          const proj = ex * dirX + ey * dirY;
          if (proj > 0) {
            const perp = Math.abs(ex * -dirY + ey * dirX);
            if (perp <= en.radius + 28) {
              this.stripEnemyLayer(en, false);
            }
          }
        }
        this.showToast('!lance — Piercing Rule');
        break;
      }

      case 'mend': {
        const heal = 55;
        this.hp = Math.min(this.maxHp, this.hp + heal);
        this.ripples.push({
          x: cx,
          y: cy,
          radius: PLAYER_RADIUS,
          maxRadius: 85,
          life: 0.5,
          maxLife: 0.5,
          color: PALETTE.gold,
          lineWidth: 2.2,
        });
        this.spawnParticles(cx, cy, PALETTE.gold, 16);
        this.spawnFloatingText(cx, cy - 34, `+${heal} HP`, PALETTE.gold, 15);
        this.showToast('!mend — Page Restored');
        break;
      }

      case 'blot': {
        const hadSmudge = this.smudge > 0 || this.smudgePrimed;
        this.smudge = 0;
        this.smudgePrimed = false;
        const closest = this.findClosestEnemy();
        if (closest) {
          this.beams.push({
            x1: cx,
            y1: cy,
            x2: closest.x,
            y2: closest.y,
            life: 0.3,
            maxLife: 0.3,
            color: PALETTE.smudge,
          });
          this.stripEnemyLayer(closest, false);
        }
        this.showToast(hadSmudge ? '!blot — Smudge Cleared!' : '!blot — Ink Bolt');
        break;
      }

      case 'swarm': {
        const count = 6;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
          const speed = 360 + Math.random() * 80;
          const target = this.enemies.length > 0 ? this.enemies[i % this.enemies.length] : null;
          this.homingDarts.push({
            x: cx + Math.cos(angle) * (PLAYER_RADIUS + 4),
            y: cy + Math.sin(angle) * (PLAYER_RADIUS + 4),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            targetId: target ? target.id : null,
            life: 2.6,
            trail: [{ x: cx, y: cy }],
          });
        }
        this.ripples.push({
          x: cx,
          y: cy,
          radius: PLAYER_RADIUS,
          maxRadius: 90,
          life: 0.35,
          maxLife: 0.35,
          color: PALETTE.crimson,
          lineWidth: 2,
        });
        this.showToast('!swarm — Homing Ink Darts!');
        break;
      }

      case 'orbit': {
        this.orbitLaser = {
          timer: 4.5,
          maxTimer: 4.5,
          angle: Math.random() * Math.PI * 2,
          tickCooldowns: new Map(),
        };
        this.screenShake = Math.max(this.screenShake, 5);
        this.showToast('!orbit — Spinning Pencil Lasers!');
        break;
      }

      case 'drone': {
        for (let i = 0; i < 2; i++) {
          const a = i * Math.PI + Math.random() * 0.6;
          this.hunterDrones.push({
            x: cx + Math.cos(a) * 34,
            y: cy + Math.sin(a) * 34,
            vx: Math.cos(a) * 220,
            vy: Math.sin(a) * 220,
            angle: a,
            life: 8.0,
            maxLife: 8.0,
            fireCooldown: 0.2 + i * 0.25,
            targetId: null,
          });
        }
        this.ripples.push({
          x: cx,
          y: cy,
          radius: PLAYER_RADIUS,
          maxRadius: 72,
          life: 0.35,
          maxLife: 0.35,
          color: PALETTE.ink,
          lineWidth: 1.8,
          dashed: true,
        });
        this.showToast('!drone — Origami Hunters Deployed!');
        break;
      }
    }
  }

  // ==================== COMBAT TYPING ====================

  private handleCombatTyping(letter: string): void {
    this.totalKeys += 1;
    if (this.boss) {
      this.boss.hesitationTimer = 0;
    }

    // 1. If already locked onto Boss
    if (this.boss && this.bossLocked) {
      this.tryTypeBossLetter(letter);
      return;
    }

    // 2. If already locked onto an Enemy
    if (this.lockedEnemyId !== null) {
      const locked = this.enemies.find((en) => en.id === this.lockedEnemyId);
      if (!locked) {
        this.lockedEnemyId = null;
        this.handleCombatTyping(letter);
        return;
      }
      if (locked.word[locked.typedCount] === letter) {
        this.advanceLockedEnemy(locked);
      } else {
        this.registerTypo(locked);
      }
      return;
    }

    // 3. Unlocked: find closest matching enemy
    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    let bestEnemy: Enemy | null = null;
    let bestDist = Infinity;

    for (const en of this.enemies) {
      if (en.word[0] === letter) {
        const d = Math.hypot(en.x - cx, en.y - cy);
        if (d < bestDist) {
          bestDist = d;
          bestEnemy = en;
        }
      }
    }

    // Check if boss passage matches too
    const bossNextLetter = this.getBossExpectedLetter();
    const matchesBoss = this.boss !== null && bossNextLetter === letter;

    // Prioritize urgent minion if close, otherwise allow Boss lock
    const urgentDist = this.isMobileMode() ? 110 : 250;
    if (matchesBoss && (!bestEnemy || bestDist > urgentDist)) {
      this.bossLocked = true;
      this.tryTypeBossLetter(letter);
      return;
    }

    if (!bestEnemy) {
      this.registerTypo(null);
      return;
    }

    this.lockedEnemyId = bestEnemy.id;

    // Apply primed Smudge onto newly locked enemy
    if (this.smudgePrimed) {
      this.smudgePrimed = false;
      bestEnemy.armor += 1;
      bestEnemy.isSmudged = true;
      this.ripples.push({
        x: bestEnemy.x,
        y: bestEnemy.y,
        radius: bestEnemy.radius,
        maxRadius: 46,
        life: 0.42,
        maxLife: 0.42,
        color: PALETTE.smudge,
        lineWidth: 4,
      });
      this.spawnFloatingText(bestEnemy.x, bestEnemy.y - 34, 'SMUDGED ²', PALETTE.smudge, 12);
    }

    this.advanceLockedEnemy(bestEnemy);
  }

  private getBossExpectedLetter(): string | null {
    if (!this.boss) return null;
    let idx = this.boss.typedIndex;
    while (idx < this.boss.passage.length && this.boss.passage[idx] === ' ') {
      idx += 1;
    }
    return idx < this.boss.passage.length ? this.boss.passage[idx] : null;
  }

  private tryTypeBossLetter(letter: string): void {
    if (!this.boss) return;
    // Auto-skip spaces so typing flows seamlessly
    while (this.boss.typedIndex < this.boss.passage.length && this.boss.passage[this.boss.typedIndex] === ' ') {
      this.boss.typedIndex += 1;
    }
    const expected = this.boss.passage[this.boss.typedIndex];
    if (expected === letter) {
      this.advanceBossPassage();
    } else {
      this.boss.shakeTimer = 0.2;
      this.registerTypo(null);
    }
  }

  private advanceBossPassage(): void {
    if (!this.boss) return;
    this.correctKeys += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.glyphKick = 0.55;
    this.boss.typedIndex += 1;
    this.boss.hitFlash = 0.1;

    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    const bossY = this.isMobileMode() ? 94 : 104;

    this.projectiles.push({
      x: cx,
      y: cy,
      targetId: 'boss',
      targetX: cx,
      targetY: bossY,
      speed: 1650,
      trail: [{ x: cx, y: cy }],
      isFinal: this.boss.typedIndex >= this.boss.passage.length,
    });

    this.sound.playKeyHit(this.streak);
    this.charge = Math.min(MAX_CHARGE, this.charge + 1.4 * this.passives.chargeGainMult);

    // Phase 2 transition at 50% for The Architect
    const pct = this.boss.typedIndex / this.boss.passage.length;
    if (this.boss.id === 'architect' && this.boss.phase === 1 && pct >= 0.5) {
      this.boss.phase = 2;
      this.screenShake = 8;
      this.sound.playBossFanfare(false);
      this.showToast('Phase II — The Frame Tightens!');
      this.spawnEnemy('pentagon');
      this.spawnEnemy('pentagon');
      this.syncMusicIntensity();
    }

    // Boss Defeated!
    if (this.boss.typedIndex >= this.boss.passage.length) {
      this.defeatBoss();
    }
  }

  private advanceLockedEnemy(enemy: Enemy): void {
    this.correctKeys += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    enemy.typedCount += 1;
    enemy.hitFlash = 0.12;
    enemy.hitScale = 1.32;
    this.glyphKick = 0.55;

    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    const isWordComplete = enemy.typedCount >= enemy.word.length;

    // Per-letter graphite dart
    this.projectiles.push({
      x: cx,
      y: cy,
      targetId: enemy.id,
      targetX: enemy.x,
      targetY: enemy.y,
      speed: 1550,
      trail: [{ x: cx, y: cy }],
      isFinal: isWordComplete,
    });

    // Radial knockback scaled by passives (slightly stronger on mobile for breathing room)
    const dx = enemy.x - cx;
    const dy = enemy.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const baseKnock = isWordComplete ? 160 : 54;
    const mobileKnockBoost = this.isMobileMode() ? 1.2 : 1;
    const knock = baseKnock * this.passives.knockbackMult * mobileKnockBoost;
    enemy.knockVx += (dx / dist) * knock;
    enemy.knockVy += (dy / dist) * knock;

    if (isWordComplete) {
      this.wordsCompleted += 1;
      const chargeGain = Math.min(18, (6 + enemy.word.length) * this.passives.chargeGainMult);
      this.charge = Math.min(MAX_CHARGE, this.charge + chargeGain);

      // Vampiric Nib passive
      if (this.passives.vampiricNib && this.hp < this.maxHp * 0.5) {
        this.hp = Math.min(this.maxHp, this.hp + 4);
        this.spawnFloatingText(cx, cy - 30, '+4', PALETTE.gold, 11);
      }

      this.stripEnemyLayer(enemy, true);
      this.triggerOnWordCompletePassives(enemy.x, enemy.y);
    } else {
      this.sound.playKeyHit(this.streak);
    }
  }

  private stripEnemyLayer(enemy: Enemy, grantXpAndScore: boolean): void {
    if (enemy.armor > 1) {
      enemy.armor -= 1;
      enemy.isSmudged = false;
      enemy.typedCount = 0;
      enemy.word = this.pickFreshWord(enemy.kind);
      enemy.hitScale = 1.45;
      if (grantXpAndScore) this.score += 65;
      this.sound.playArmorCrack();
      this.spawnParticles(enemy.x, enemy.y, PALETTE.ink, 12);
      this.ripples.push({
        x: enemy.x,
        y: enemy.y,
        radius: enemy.radius,
        maxRadius: 38,
        life: 0.28,
        maxLife: 0.28,
        color: PALETTE.ink,
        lineWidth: 2,
      });
      this.spawnFloatingText(enemy.x, enemy.y - 24, 'CRACK', PALETTE.ink, 11);
      return;
    }

    // Destroy enemy
    const wasSmudged = enemy.isSmudged;
    const ex = enemy.x;
    const ey = enemy.y;
    const kind = enemy.kind;
    const pts = 100 + enemy.word.length * 15;

    if (grantXpAndScore) {
      this.score += pts;
      this.grantXp(kind === 'pentagon' || kind === 'diamond' ? 32 : 20);
      this.spawnFloatingText(ex, ey - 16, `+${pts}`, PALETTE.inkMuted, 11);
    }

    this.sound.playWordKill();
    const isHeavy = kind === 'pentagon' || kind === 'diamond';
    this.screenShake = Math.max(this.screenShake, isHeavy ? 6.5 : 4.2);
    this.spawnParticles(ex, ey, PALETTE.crimson, isHeavy ? 28 : 22);
    this.spawnParticles(ex, ey, PALETTE.ink, 8);
    this.spawnInkStain(ex, ey, wasSmudged ? PALETTE.smudge : PALETTE.crimson, isHeavy ? 24 : 17);
    const sides = kind === 'pentagon' ? 5 : kind === 'diamond' ? 4 : kind === 'arrow' ? 3 : 6;
    this.spawnDeathBoom(ex, ey, wasSmudged ? PALETTE.smudge : PALETTE.crimson, sides, isHeavy ? 1.35 : 1.0);
    this.ripples.push(
      { x: ex, y: ey, radius: enemy.radius, maxRadius: isHeavy ? 72 : 56, life: 0.38, maxLife: 0.38, color: PALETTE.crimson, lineWidth: 2.2 },
      { x: ex, y: ey, radius: enemy.radius, maxRadius: isHeavy ? 48 : 34, life: 0.26, maxLife: 0.26, color: PALETTE.ink, lineWidth: 1.2, dashed: true }
    );

    this.enemies = this.enemies.filter((e) => e.id !== enemy.id);
    if (this.lockedEnemyId === enemy.id) this.lockedEnemyId = null;

    // Diamond Splitter spawns 2 fast Dots!
    if (kind === 'diamond') {
      this.spawnFloatingText(ex, ey - 30, 'SPLIT!', PALETTE.crimson, 12);
      for (const offset of [-22, 22]) {
        this.spawnDotAt(ex + offset, ey + (Math.random() - 0.5) * 20);
      }
    }

    // Charcoal Burst passive: smudged enemies explode on death!
    if (wasSmudged && this.passives.charcoalBurst) {
      this.ripples.push({
        x: ex,
        y: ey,
        radius: 10,
        maxRadius: 115,
        life: 0.4,
        maxLife: 0.4,
        color: PALETTE.smudge,
        lineWidth: 3,
      });
      this.screenShake = Math.max(this.screenShake, 5);
      this.spawnFloatingText(ex, ey - 34, 'CHARCOAL BURST!', PALETTE.crimson, 13);
      for (const other of [...this.enemies]) {
        if (Math.hypot(other.x - ex, other.y - ey) <= 115) {
          this.stripEnemyLayer(other, false);
        }
      }
    }
  }

  private triggerOnWordCompletePassives(originX: number, originY: number): void {
    // Chain Sketch: strike 2 letters off a nearby foe
    if (this.passives.chainSketch && this.enemies.length > 0) {
      let nearest: Enemy | null = null;
      let bestD = 220;
      for (const en of this.enemies) {
        const d = Math.hypot(en.x - originX, en.y - originY);
        if (d < bestD && en.id !== this.lockedEnemyId) {
          bestD = d;
          nearest = en;
        }
      }
      if (nearest) {
        this.beams.push({ x1: originX, y1: originY, x2: nearest.x, y2: nearest.y, life: 0.2, maxLife: 0.2, color: PALETTE.inkMuted });
        this.damageEnemyLetters(nearest, 2);
      }
    }

    // Auto-Compass: every 3rd word fires a free dart at closest foe
    if (this.passives.autoCompass) {
      this.autoCompassCounter += 1;
      if (this.autoCompassCounter >= 3) {
        this.autoCompassCounter = 0;
        const closest = this.findClosestEnemy();
        if (closest) {
          this.beams.push({
            x1: this.width / 2,
            y1: this.getArenaCenterY(),
            x2: closest.x,
            y2: closest.y,
            life: 0.22,
            maxLife: 0.22,
            color: PALETTE.gold,
          });
          this.damageEnemyLetters(closest, 2);
        }
      }
    }
  }

  private damageEnemyLetters(en: Enemy, count: number): void {
    en.typedCount += count;
    en.hitFlash = 0.14;
    en.hitScale = 1.28;
    if (en.typedCount >= en.word.length) {
      this.stripEnemyLayer(en, true);
    }
  }

  private grantXp(amount: number): void {
    if (this.boss) return; // hold level-up drafts during boss fights for clean pacing
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.round(this.xpToNext * 1.45);
      this.openDraft(`Level ${this.level} — Type to Draft`, false);
    }
  }

  private registerTypo(enemy: Enemy | null): void {
    this.streak = 0;
    this.sound.playTypo();

    if (enemy) {
      enemy.shakeTimer = 0.22;
      this.spawnParticles(enemy.x, enemy.y - enemy.radius - 16, PALETTE.smudge, 5);
    }

    const smudgeBase = this.isMobileMode() ? 20 : SMUDGE_PER_TYPO;
    this.smudge = Math.min(100, this.smudge + smudgeBase * this.passives.smudgeGainMult);
    this.smudgeDryWait = SMUDGE_DRY_DELAY;

    if (this.smudge >= 100) {
      this.smudge = 0;
      this.smudgePrimed = true;
      this.smudgeFlash = 0.6;
      this.smudgesTriggered += 1;
      this.sound.playSmudgeProc();
      this.screenShake = Math.max(this.screenShake, 4);
      this.showToast('SMUDGE! Next target gets reinforced (²)');
    }
  }

  // ==================== BOSSES ====================

  private spawnStageBoss(): void {
    const bossOrder: Record<1 | 2 | 3, BossId> = {
      1: 'compass',
      2: 'eraser',
      3: 'architect',
    };
    const cfg = BOSS_CONFIGS[bossOrder[this.stage]];
    const passage = cfg.passages[Math.floor(Math.random() * cfg.passages.length)];

    this.boss = {
      id: cfg.id,
      name: cfg.name,
      subtitle: cfg.subtitle,
      passage,
      typedIndex: 0,
      phase: 1,
      attackTimer: 4.5,
      hesitationTimer: 0,
      eraseWaveY: null,
      hitFlash: 0,
      shakeTimer: 0,
      rotation: 0,
      enterAnim: 0,
    };

    this.sound.playBossFanfare(false);
    this.screenShake = 7;
    this.showToast(`${cfg.name} Appears!`);
    this.syncMusicIntensity();
  }

  private updateBoss(dt: number): void {
    if (!this.boss) return;
    const b = this.boss;
    b.enterAnim = Math.min(1, b.enterAnim + dt * 2.5);
    b.rotation += dt * (b.phase === 2 ? 1.1 : 0.45);
    if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);
    if (b.shakeTimer > 0) b.shakeTimer = Math.max(0, b.shakeTimer - dt);

    // Animated Erase Wave sweep
    if (b.eraseWaveY !== null) {
      b.eraseWaveY += this.height * 1.15 * dt;
      if (b.eraseWaveY > this.height + 40) {
        b.eraseWaveY = null;
      }
    }

    // Boss 2 (The Eraser): Hesitation Smudge if player stops typing for >2.2s
    if (b.id === 'eraser') {
      b.hesitationTimer += dt;
      if (b.hesitationTimer > 2.2) {
        this.smudge = Math.min(100, this.smudge + 10 * dt);
        this.smudgeDryWait = 0.3;
        if (this.smudge >= 100) {
          this.smudge = 0;
          this.smudgePrimed = true;
          this.smudgeFlash = 0.5;
          this.smudgesTriggered += 1;
          this.sound.playSmudgeProc();
          this.showToast('Eraser Smudge! Keep typing!');
        }
      }
    }

    b.attackTimer -= dt;
    if (b.attackTimer <= 0) {
      const cx = this.width / 2;
      const cy = this.getArenaCenterY();
      const arenaHalfH = Math.max(110, (this.getArenaBottomY() - 56) / 2);

      const mobile = this.isMobileMode();
      if (b.id === 'compass') {
        // Synchronized ring of Dots (fewer & wider on mobile to avoid crowding)
        this.ripples.push({
          x: cx,
          y: cy,
          radius: 40,
          maxRadius: Math.min(cx, arenaHalfH) * 0.9,
          life: 0.6,
          maxLife: 0.6,
          color: PALETTE.inkMuted,
          lineWidth: 1.5,
          dashed: true,
        });
        if (mobile) {
          // Spawn 3 well-spaced Dots at the outer perimeter via anti-clump spawner
          this.spawnEnemy('dot');
          this.spawnEnemy('dot');
          this.spawnEnemy('dot');
          b.attackTimer = 9.5;
        } else {
          const baseA = Math.random() * Math.PI * 2;
          const r = Math.min(cx - 26, arenaHalfH - 12);
          for (let i = 0; i < 4; i++) {
            const a = baseA + (i * Math.PI) / 2;
            this.spawnDotAt(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
          b.attackTimer = 7.5;
        }
      } else if (b.id === 'eraser') {
        // Sweep Erase Wave across the page, fading 1-2 letters on active minions
        b.eraseWaveY = 120;
        for (const en of this.enemies) {
          en.fadeTimer = 1.8;
          const count = Math.min(2, Math.max(1, Math.floor(en.word.length / 3)));
          const indices: number[] = [];
          for (let i = 0; i < count; i++) {
            const idx = 1 + Math.floor(Math.random() * Math.max(1, en.word.length - 1));
            if (!indices.includes(idx)) indices.push(idx);
          }
          en.fadedIndices = indices;
        }
        this.spawnEnemy('arrow');
        this.spawnEnemy('ring');
        b.attackTimer = mobile ? 9.5 : 7.2;
      } else if (b.id === 'architect') {
        if (b.phase === 1) {
          this.spawnEnemy('arrow');
          if (!mobile) this.spawnEnemy('arrow');
          this.spawnEnemy('diamond');
          b.attackTimer = mobile ? 9.0 : 7.0;
        } else {
          this.spawnEnemy('pentagon');
          this.spawnEnemy('dot');
          if (!mobile) this.spawnEnemy('arrow');
          b.attackTimer = mobile ? 8.2 : 6.2;
        }
      }
    }
  }

  private defeatBoss(): void {
    if (!this.boss) return;
    const cx = this.width / 2;
    const bossY = 98;
    const defeatedId = this.boss.id;

    this.score += 500 * this.stage;
    this.screenShake = 0; // keep transition into draft/victory crisp and shake-free
    this.spawnParticles(cx, bossY, PALETTE.crimson, 52);
    this.spawnParticles(cx, bossY, PALETTE.ink, 30);
    this.spawnInkStain(cx, bossY, PALETTE.crimson, 48);
    this.spawnDeathBoom(cx, bossY, PALETTE.crimson, 6, 2.4);
    this.spawnDeathBoom(cx, bossY, PALETTE.ink, 4, 1.8);
    this.ripples.push(
      { x: cx, y: bossY, radius: 20, maxRadius: 260, life: 0.7, maxLife: 0.7, color: PALETTE.crimson, lineWidth: 3 },
      { x: cx, y: bossY, radius: 10, maxRadius: 180, life: 0.55, maxLife: 0.55, color: PALETTE.ink, lineWidth: 1.5, dashed: true }
    );

    // Clear remaining minions cleanly
    for (const en of this.enemies) {
      this.spawnParticles(en.x, en.y, PALETTE.inkMuted, 8);
    }
    this.enemies = [];
    this.lockedEnemyId = null;
    this.boss = null;
    this.bossLocked = false;

    if (defeatedId === 'architect') {
      // VICTORY!
      this.sound.playBossFanfare(true);
      this.sound.music.setIntensity(0);
      this.sound.music.setMuffled(false);
      this.mode = 'victory';
      this.nativeKb.blur();
      this.retryBuffer = '';
    } else {
      this.sound.playBossFanfare(true);
      this.openDraft(`Stage ${this.stage} Cleared — Boss Draft`, true);
    }
  }

  private syncMusicIntensity(): void {
    if (this.mode === 'title' || this.mode === 'victory') {
      this.sound.music.setIntensity(0);
      return;
    }
    if (this.boss) {
      if (this.boss.id === 'compass') this.sound.music.setIntensity(2);
      else if (this.boss.id === 'eraser') this.sound.music.setIntensity(3);
      else this.sound.music.setIntensity(4);
    } else {
      this.sound.music.setIntensity(this.stage);
    }
  }

  // ==================== SPAWNING & HELPERS ====================

  private findClosestEnemy(): Enemy | null {
    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const en of this.enemies) {
      const d = Math.hypot(en.x - cx, en.y - cy);
      if (d < bestDist) {
        bestDist = d;
        best = en;
      }
    }
    return best;
  }

  private showToast(text: string): void {
    this.toastText = text;
    this.toastTimer = 2.0;
  }

  private pickFreshWord(kind: EnemyKind): string {
    const used = new Set<string>(this.enemies.map((e) => e.word[0]));
    // Avoid starting-letter collision with the Boss's current expected letter
    const bossLetter = this.getBossExpectedLetter();
    if (bossLetter) used.add(bossLetter);
    // Mobile ergonomic tuning: favor shorter 3-4 letter words for two-thumb comfort
    const useShort =
      kind === 'dot' || kind === 'arrow' || (this.isMobileMode() && Math.random() < 0.78);
    const pool = useShort ? SHORT_WORDS : MEDIUM_WORDS;
    return pickWord(pool, used);
  }

  private getMobileSpeedMultiplier(): number {
    if (!this.isMobileMode()) return 1;
    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    const arenaBottom = this.getArenaBottomY();
    const minRadius = Math.min(cx - 12, cy - 56, arenaBottom - cy - 10);
    // Scale enemy speed proportionally to the smaller portrait arena so players have fair typing time
    return Math.max(0.38, Math.min(0.56, (minRadius / 340) * 0.72));
  }

  private spawnDotAt(x: number, y: number): void {
    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    const diff = this.getDifficulty();
    const mobileSpeedMult = this.getMobileSpeedMultiplier();
    const speedScale = (1 + (this.stage - 1) * 0.14) * diff.speedMult * mobileSpeedMult;
    this.enemies.push({
      id: this.nextEnemyId++,
      kind: 'dot',
      x,
      y,
      radius: 6,
      speed: 44 * speedScale,
      damage: Math.round(15 * diff.damageMult),
      word: this.pickFreshWord('dot'),
      typedCount: 0,
      armor: 1,
      isSmudged: false,
      hitFlash: 0,
      hitScale: 1,
      shakeTimer: 0,
      knockVx: 0,
      knockVy: 0,
      rotation: Math.atan2(cy - y, cx - x),
      spawnAnim: 0,
      fadeTimer: 0,
      fadedIndices: [],
    });
  }

  private spawnEnemy(forcedKind?: EnemyKind): void {
    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    const arenaBottom = this.getArenaBottomY();

    let kind: EnemyKind = forcedKind ?? 'dot';
    if (!forcedKind) {
      const r = Math.random();
      if (this.stage === 1) {
        if (r < 0.55) kind = 'dot';
        else if (r < 0.85) kind = 'ring';
        else kind = 'pentagon';
      } else if (this.stage === 2) {
        if (r < 0.3) kind = 'dot';
        else if (r < 0.55) kind = 'ring';
        else if (r < 0.75) kind = 'arrow';
        else if (r < 0.9) kind = 'pentagon';
        else kind = 'diamond';
      } else {
        if (r < 0.22) kind = 'dot';
        else if (r < 0.44) kind = 'ring';
        else if (r < 0.68) kind = 'arrow';
        else if (r < 0.86) kind = 'pentagon';
        else kind = 'diamond';
      }
    }

    const mobile = this.isMobileMode();
    const halfW = mobile ? cx - 10 : cx - 34;
    const halfHTop = Math.max(80, cy - (mobile ? 56 : 64));
    const halfHBot = Math.max(80, arenaBottom - cy - (mobile ? 8 : 16));

    // Anti-clumping: sample 10 perimeter candidates and pick the best-spaced spawn point
    let x = cx;
    let y = 54;
    let bestScore = -Infinity;
    const candidates = 10;
    const baseOffset = Math.random() * Math.PI * 2;
    for (let i = 0; i < candidates; i++) {
      const angle = baseOffset + (i / candidates) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const scaleX = Math.abs(cos) > 0.001 ? halfW / Math.abs(cos) : 9999;
      const targetHalfH = sin >= 0 ? halfHBot : halfHTop;
      const scaleY = Math.abs(sin) > 0.001 ? targetHalfH / Math.abs(sin) : 9999;
      const edgeDist = Math.min(scaleX, scaleY) + (mobile ? 8 : 34);

      const candX = Math.max(mobile ? 12 : 24, Math.min(this.width - (mobile ? 12 : 24), cx + cos * edgeDist));
      const candY = Math.max(54, Math.min(arenaBottom - (mobile ? 6 : 10), cy + sin * edgeDist));

      let minDist = 9999;
      for (const en of this.enemies) {
        const d = Math.hypot(en.x - candX, en.y - candY);
        if (d < minDist) minDist = d;
      }

      // Avoid spawning on top of the Boss ticker header
      let penalty = 0;
      if (this.boss && candY < (mobile ? 175 : 190)) {
        penalty = 220;
      }
      // Prefer slightly farther corners on mobile for extra reaction runway
      const distFromPlayer = Math.hypot(candX - cx, candY - cy);
      const score = minDist + (mobile ? distFromPlayer * 0.35 : 0) - penalty;
      if (score > bestScore) {
        bestScore = score;
        x = candX;
        y = candY;
      }
    }

    const diff = this.getDifficulty();
    const mobileSpeedMult = this.getMobileSpeedMultiplier();
    const speedScale =
      (1 + (this.stage - 1) * 0.14 + Math.min(this.stageTimer / 200, 0.2)) * diff.speedMult * mobileSpeedMult;
    const word = this.pickFreshWord(kind);

    const configs: Record<EnemyKind, { radius: number; speed: number; damage: number; armor: number }> = {
      dot: { radius: 6, speed: 39 * speedScale, damage: Math.round(15 * diff.damageMult), armor: 1 },
      ring: { radius: 10, speed: 32 * speedScale, damage: Math.round(20 * diff.damageMult), armor: 1 },
      arrow: { radius: 9, speed: 56 * speedScale, damage: Math.round(20 * diff.damageMult), armor: 1 },
      pentagon: { radius: 11, speed: 24 * speedScale, damage: Math.round(35 * diff.damageMult), armor: 2 },
      diamond: { radius: 11, speed: 30 * speedScale, damage: Math.round(25 * diff.damageMult), armor: 1 },
    };

    const cfg = configs[kind];
    this.enemies.push({
      id: this.nextEnemyId++,
      kind,
      x,
      y,
      radius: cfg.radius,
      speed: cfg.speed,
      damage: cfg.damage,
      word,
      typedCount: 0,
      armor: cfg.armor,
      isSmudged: false,
      hitFlash: 0,
      hitScale: 1,
      shakeTimer: 0,
      knockVx: 0,
      knockVy: 0,
      rotation: Math.atan2(cy - y, cx - x),
      spawnAnim: 0,
      fadeTimer: 0,
      fadedIndices: [],
    });
  }

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 55 + Math.random() * 190;
      const maxLife = 0.28 + Math.random() * 0.38;
      const roll = Math.random();
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: maxLife,
        maxLife,
        size: 1.8 + Math.random() * 3.4,
        color,
        shape: roll < 0.35 ? 'shard' : roll < 0.72 ? 'line' : 'dot',
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 12,
      });
    }
  }

  private spawnInkStain(x: number, y: number, color: string, radius: number): void {
    const blobs: Array<{ dx: number; dy: number; r: number }> = [];
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * 0.7;
      blobs.push({
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d,
        r: radius * (0.25 + Math.random() * 0.55),
      });
    }
    this.inkStains.push({ x, y, radius, life: 6.0, maxLife: 6.0, color, blobs });
    if (this.inkStains.length > 26) this.inkStains.shift();
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, size: number): void {
    this.floatingTexts.push({ x, y, vy: -32, text, color, life: 0.9, maxLife: 0.9, size });
  }

  private spawnDeathBoom(x: number, y: number, color: string, sides: number, scale = 1): void {
    const rayCount = Math.round(7 + scale * 3);
    const rays: Array<{ angle: number; length: number }> = [];
    for (let i = 0; i < rayCount; i++) {
      const base = (i / rayCount) * Math.PI * 2;
      rays.push({
        angle: base + (Math.random() - 0.5) * 0.28,
        length: (28 + Math.random() * 34) * scale,
      });
    }
    this.deathBooms.push({
      x,
      y,
      radius: 6 * scale,
      maxRadius: 54 * scale,
      life: 0.36,
      maxLife: 0.36,
      color,
      sides,
      rotation: Math.random() * Math.PI * 2,
      rays,
    });
  }

  // ==================== UPDATE ====================

  private update(dt: number): void {
    this.pulseTime += dt;
    this.mobileKb.update(dt);
    if (this.draftShakeTimer > 0) this.draftShakeTimer = Math.max(0, this.draftShakeTimer - dt);

    if (this.mode !== 'playing') return;

    this.elapsed += dt;
    this.glyphAngle += dt * (0.25 + Math.min(this.streak, 20) * 0.04);
    if (this.glyphKick > 0) this.glyphKick = Math.max(0, this.glyphKick - dt * 5.5);
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 26);
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    if (this.smudgeFlash > 0) this.smudgeFlash = Math.max(0, this.smudgeFlash - dt * 1.6);
    if (this.abilityShake > 0) this.abilityShake = Math.max(0, this.abilityShake - dt);
    if (this.toastTimer > 0) this.toastTimer = Math.max(0, this.toastTimer - dt);

    // Dry Smudge Bar
    if (this.smudgeDryWait > 0) {
      this.smudgeDryWait = Math.max(0, this.smudgeDryWait - dt);
    } else if (this.smudge > 0) {
      this.smudge = Math.max(0, this.smudge - SMUDGE_DRY_RATE * this.passives.smudgeDryMult * dt);
    }

    // Stage wave timer -> Boss spawn
    if (!this.boss) {
      this.stageTimer += dt;
      if (this.stageTimer >= STAGE_WAVE_DURATION) {
        this.spawnStageBoss();
      } else {
        // Wave spawner (scaled by difficulty slider & mobile ergonomics)
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const diff = this.getDifficulty();
          const mobile = this.isMobileMode();
          const mobRate = mobile ? 0.64 : 1;
          const effRate = diff.spawnRateMult * mobRate;
          const maxCap = mobile ? 9 : 18;
          const maxActive = Math.min(maxCap, Math.round((5 + this.stage * 2.5 + Math.floor(this.stageTimer / 22)) * effRate));
          if (this.enemies.length < Math.max(3, maxActive)) {
            this.spawnEnemy();
          }
          const minInterval = mobile ? 1.25 : 0.75;
          const baseInterval = Math.max(minInterval, 2.25 - (this.stage - 1) * 0.32 - this.stageTimer * 0.007) / effRate;
          this.spawnTimer = baseInterval * (0.88 + Math.random() * 0.24);
        }
      }
    } else {
      this.updateBoss(dt);
    }

    // Update enemies
    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    const slowMult = this.slowTimer > 0 ? 0.35 : 1;

    const remaining: Enemy[] = [];
    for (const en of this.enemies) {
      en.spawnAnim = Math.min(1, en.spawnAnim + dt * 4.5);
      if (en.hitFlash > 0) en.hitFlash = Math.max(0, en.hitFlash - dt);
      if (en.hitScale > 1) en.hitScale = Math.max(1, en.hitScale - dt * 4.2);
      if (en.shakeTimer > 0) en.shakeTimer = Math.max(0, en.shakeTimer - dt);
      if (en.fadeTimer > 0) en.fadeTimer = Math.max(0, en.fadeTimer - dt);

      const dx = cx - en.x;
      const dy = cy - en.y;
      const dist = Math.hypot(dx, dy) || 1;
      en.rotation = Math.atan2(dy, dx);

      en.x += ((dx / dist) * en.speed * slowMult + en.knockVx) * dt;
      en.y += ((dy / dist) * en.speed * slowMult + en.knockVy) * dt;
      en.knockVx *= Math.pow(0.015, dt);
      en.knockVy *= Math.pow(0.015, dt);

      const newDist = Math.hypot(cx - en.x, cy - en.y);
      if (newDist <= PLAYER_RADIUS + en.radius + 4) {
        if (this.lockedEnemyId === en.id) this.lockedEnemyId = null;
        this.handlePlayerHit(en);
      } else {
        remaining.push(en);
      }
    }
    this.enemies = remaining;

    // Update projectiles
    const activeProjectiles: Projectile[] = [];
    for (const p of this.projectiles) {
      if (p.targetId !== 'boss') {
        const target = this.enemies.find((e) => e.id === p.targetId);
        if (target) {
          p.targetX = target.x;
          p.targetY = target.y;
        }
      }
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step + 8) {
        this.spawnParticles(p.targetX, p.targetY, p.isFinal ? PALETTE.crimson : PALETTE.ink, p.isFinal ? 7 : 3);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 7) p.trail.shift();
        activeProjectiles.push(p);
      }
    }
    this.projectiles = activeProjectiles;

    // Update particles, ripples, stains, floating text, beams
    this.particles = this.particles.filter((pt) => {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.pow(0.06, dt);
      pt.vy *= Math.pow(0.06, dt);
      pt.rotation += pt.vRot * dt;
      return pt.life > 0;
    });

    this.ripples = this.ripples.filter((rp) => {
      rp.life -= dt;
      rp.radius = rp.maxRadius * (1 - rp.life / rp.maxLife);
      return rp.life > 0;
    });

    this.inkStains = this.inkStains.filter((st) => {
      st.life -= dt;
      return st.life > 0;
    });

    this.floatingTexts = this.floatingTexts.filter((ft) => {
      ft.life -= dt;
      ft.y += ft.vy * dt;
      return ft.life > 0;
    });

    this.beams = this.beams.filter((bm) => {
      bm.life -= dt;
      return bm.life > 0;
    });

    this.deathBooms = this.deathBooms.filter((db) => {
      db.life -= dt;
      const progress = 1 - db.life / db.maxLife;
      db.radius = db.maxRadius * (0.18 + 0.82 * Math.sqrt(progress));
      db.rotation += dt * 2.6;
      return db.life > 0;
    });

    this.updateWeaponAbilities(dt, cx, cy);
  }

  private updateWeaponAbilities(dt: number, cx: number, cy: number): void {
    // 1. Homing Ink Darts (!swarm)
    const activeDarts: HomingDart[] = [];
    for (const dart of this.homingDarts) {
      dart.life -= dt;
      if (dart.life <= 0) continue;

      let target = dart.targetId !== null ? this.enemies.find((e) => e.id === dart.targetId) : undefined;
      if (!target && this.enemies.length > 0) {
        // Pick nearest enemy to dart
        let bestD = Infinity;
        for (const en of this.enemies) {
          const d = Math.hypot(en.x - dart.x, en.y - dart.y);
          if (d < bestD) {
            bestD = d;
            target = en;
          }
        }
        dart.targetId = target ? target.id : null;
      }

      if (target) {
        const dx = target.x - dart.x;
        const dy = target.y - dart.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist <= target.radius + 14) {
          this.spawnParticles(target.x, target.y, PALETTE.crimson, 8);
          this.sound.playKeyHit(12);
          this.damageEnemyLetters(target, 2);
          continue; // dart consumed on hit
        }
        const desiredVx = (dx / dist) * 620;
        const desiredVy = (dy / dist) * 620;
        const steer = Math.min(1, dt * 7.5);
        dart.vx += (desiredVx - dart.vx) * steer;
        dart.vy += (desiredVy - dart.vy) * steer;
      }

      dart.x += dart.vx * dt;
      dart.y += dart.vy * dt;
      dart.trail.push({ x: dart.x, y: dart.y });
      if (dart.trail.length > 10) dart.trail.shift();
      activeDarts.push(dart);
    }
    this.homingDarts = activeDarts;

    // 2. Spinning Pencil Lasers (!orbit)
    if (this.orbitLaser) {
      const ol = this.orbitLaser;
      ol.timer -= dt;
      ol.angle += dt * 3.1; // brisk sweeping rotation
      for (const [id, cd] of ol.tickCooldowns.entries()) {
        if (cd - dt <= 0) ol.tickCooldowns.delete(id);
        else ol.tickCooldowns.set(id, cd - dt);
      }

      const beamLen = Math.min(this.width, this.height) * 0.48;
      for (const beamAngle of [ol.angle, ol.angle + Math.PI]) {
        const dirX = Math.cos(beamAngle);
        const dirY = Math.sin(beamAngle);
        for (const en of [...this.enemies]) {
          if (ol.tickCooldowns.has(en.id)) continue;
          const ex = en.x - cx;
          const ey = en.y - cy;
          const proj = ex * dirX + ey * dirY;
          if (proj > PLAYER_RADIUS && proj <= beamLen) {
            const perp = Math.abs(ex * -dirY + ey * dirX);
            if (perp <= en.radius + 14) {
              ol.tickCooldowns.set(en.id, 0.45);
              en.knockVx += (ex / (Math.hypot(ex, ey) || 1)) * 120;
              en.knockVy += (ey / (Math.hypot(ex, ey) || 1)) * 120;
              this.spawnParticles(en.x, en.y, PALETTE.crimson, 6);
              this.sound.playKeyHit(14);
              this.damageEnemyLetters(en, 2);
            }
          }
        }
      }

      if (ol.timer <= 0) {
        this.orbitLaser = null;
      }
    }

    // 3. Origami Hunter Drones (!drone)
    const activeDrones: HunterDrone[] = [];
    for (const dr of this.hunterDrones) {
      dr.life -= dt;
      if (dr.life <= 0) {
        this.spawnParticles(dr.x, dr.y, PALETTE.inkMuted, 10);
        continue;
      }

      dr.fireCooldown = Math.max(0, dr.fireCooldown - dt);
      let target = dr.targetId !== null ? this.enemies.find((e) => e.id === dr.targetId) : undefined;
      if (!target && this.enemies.length > 0) {
        let bestD = Infinity;
        for (const en of this.enemies) {
          const d = Math.hypot(en.x - dr.x, en.y - dr.y);
          if (d < bestD) {
            bestD = d;
            target = en;
          }
        }
        dr.targetId = target ? target.id : null;
      }

      if (target) {
        const dx = target.x - dr.x;
        const dy = target.y - dr.y;
        const dist = Math.hypot(dx, dy) || 1;
        // Orbit around target at ~85px distance
        const desiredSpeed = dist > 95 ? 290 : 120;
        const tx = dist > 95 ? dx / dist : -dy / dist;
        const ty = dist > 95 ? dy / dist : dx / dist;
        dr.vx += (tx * desiredSpeed - dr.vx) * Math.min(1, dt * 5);
        dr.vy += (ty * desiredSpeed - dr.vy) * Math.min(1, dt * 5);

        if (dist < 165 && dr.fireCooldown <= 0) {
          dr.fireCooldown = 0.52;
          this.beams.push({
            x1: dr.x,
            y1: dr.y,
            x2: target.x,
            y2: target.y,
            life: 0.16,
            maxLife: 0.16,
            color: PALETTE.crimson,
          });
          this.sound.playKeyHit(11);
          this.damageEnemyLetters(target, 2);
        }
      } else {
        // Patrol gracefully around center glyph
        const orbitA = this.pulseTime * 1.8 + activeDrones.length * Math.PI;
        const gx = cx + Math.cos(orbitA) * 95;
        const gy = cy + Math.sin(orbitA) * 95;
        dr.vx += ((gx - dr.x) * 3 - dr.vx) * Math.min(1, dt * 4);
        dr.vy += ((gy - dr.y) * 3 - dr.vy) * Math.min(1, dt * 4);
      }

      dr.x += dr.vx * dt;
      dr.y += dr.vy * dt;
      dr.angle = Math.atan2(dr.vy, dr.vx);
      activeDrones.push(dr);
    }
    this.hunterDrones = activeDrones;
  }

  private handlePlayerHit(enemy: Enemy): void {
    const cx = this.width / 2;
    const cy = this.getArenaCenterY();

    if (this.wardHits > 0) {
      this.wardHits -= 1;
      this.sound.playArmorCrack();
      this.spawnParticles(enemy.x, enemy.y, PALETTE.ink, 14);
      this.ripples.push({
        x: cx,
        y: cy,
        radius: PLAYER_RADIUS + 10,
        maxRadius: 62,
        life: 0.32,
        maxLife: 0.32,
        color: PALETTE.ink,
        lineWidth: 2.2,
      });
      this.spawnFloatingText(cx, cy - 32, 'WARDED', PALETTE.ink, 12);
      return;
    }

    this.hp = Math.max(0, this.hp - enemy.damage);
    this.streak = 0;
    this.screenShake = 10;
    this.damageFlash = 0.7;
    this.sound.playPlayerHit();
    this.spawnParticles(enemy.x, enemy.y, PALETTE.crimson, 18);
    this.spawnFloatingText(cx, cy - 30, `-${enemy.damage}`, PALETTE.crimson, 14);

    if (this.hp <= 0) {
      this.mode = 'gameover';
      this.nativeKb.blur();
      this.retryBuffer = '';
      this.lockedEnemyId = null;
      this.bossLocked = false;
      this.abilityMode = false;
      this.sound.music.setIntensity(0);
      this.sound.music.setMuffled(true);
    }
  }

  private getWpm(): number {
    if (this.elapsed < 1.5) return 0;
    return Math.round(this.correctKeys / 5 / (this.elapsed / 60));
  }

  private getAccuracy(): number {
    if (this.totalKeys === 0) return 100;
    return Math.round((this.correctKeys / this.totalKeys) * 100);
  }

  // ==================== RENDER ====================

  private render(): void {
    const ctx = this.ctx;
    ctx.save();

    if (this.mode === 'playing' && this.screenShake > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.screenShake, (Math.random() - 0.5) * this.screenShake);
    }

    // 1. Paper grain background
    ctx.fillStyle = this.paperPattern ?? PALETTE.paper;
    ctx.fillRect(-20, -20, this.width + 40, this.height + 40);

    // 2. Subtle architectural drafting circles in background (centered on arena)
    const cx = this.width / 2;
    const cy = this.getArenaCenterY();
    ctx.save();
    ctx.strokeStyle = 'rgba(140, 137, 132, 0.08)';
    ctx.lineWidth = 1;
    for (const r of [110, 220, 340]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Soft warm vignette (darkens subtly with Smudge)
    const maxR = Math.hypot(cx, cy);
    const vig = ctx.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR);
    vig.addColorStop(0, 'rgba(242, 239, 233, 0)');
    const smudgeAlpha = 0.22 + (this.smudge / 100) * 0.14 + this.smudgeFlash * 0.24;
    vig.addColorStop(1, `rgba(110, 104, 96, ${smudgeAlpha.toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.width, this.height);

    // !still subtle drafting-grid tint
    if (this.slowTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(180, 194, 210, 0.14)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.strokeStyle = 'rgba(110, 128, 148, 0.1)';
      ctx.lineWidth = 1;
      for (let x = 0; x < this.width; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Architect Phase 2 shrinking drafting margin frame
    if (this.boss?.id === 'architect' && this.boss.phase === 2) {
      const m = 22 + Math.sin(this.pulseTime * 4) * 3;
      ctx.save();
      ctx.strokeStyle = 'rgba(184, 58, 58, 0.38)';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(m, m, this.width - m * 2, this.height - m * 2);
      ctx.restore();
    }

    // Damage flash
    if (this.damageFlash > 0) {
      ctx.fillStyle = `rgba(184, 58, 58, ${(this.damageFlash * 0.18).toFixed(3)})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (this.mode === 'title') {
      this.renderPlayerGlyph(cx, cy);
      this.renderTitleOverlay(cx, cy);
      this.renderMuteButton();
      ctx.restore();
      return;
    }

    // 4. Lingering paper ink stains
    for (const st of this.inkStains) {
      const alpha = Math.min(0.11, (st.life / st.maxLife) * 0.11);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = st.color;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.radius * 0.65, 0, Math.PI * 2);
      for (const b of st.blobs) {
        ctx.moveTo(st.x + b.dx + b.r, st.y + b.dy);
        ctx.arc(st.x + b.dx, st.y + b.dy, b.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }

    // 5. Erase Wave sweep (Boss 2)
    if (this.boss?.eraseWaveY !== null && this.boss?.eraseWaveY !== undefined) {
      const wy = this.boss.eraseWaveY;
      const grad = ctx.createLinearGradient(0, wy - 36, 0, wy + 16);
      grad.addColorStop(0, 'rgba(242, 239, 233, 0)');
      grad.addColorStop(0.7, 'rgba(242, 239, 233, 0.85)');
      grad.addColorStop(1, 'rgba(184, 58, 58, 0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, wy - 36, this.width, 52);
    }

    // 6. Ripples & Flashy Geometric Death Booms
    for (const db of this.deathBooms) {
      const t = Math.max(0, db.life / db.maxLife);
      const progress = 1 - t;
      ctx.save();
      ctx.translate(db.x, db.y);

      // Crisp core flash disc on initial pop
      if (progress < 0.35) {
        const flashAlpha = (1 - progress / 0.35) * 0.55;
        ctx.fillStyle = db.color;
        ctx.globalAlpha = flashAlpha;
        ctx.beginPath();
        ctx.arc(0, 0, db.maxRadius * (0.28 + progress * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }

      // Calligraphic starburst rays shooting outward
      ctx.globalAlpha = t * 0.85;
      ctx.strokeStyle = db.color;
      ctx.lineWidth = 1.6 * t + 0.6;
      ctx.lineCap = 'round';
      for (const ray of db.rays) {
        const inner = ray.length * (0.15 + progress * 0.55);
        const outer = ray.length * (0.45 + progress * 0.75);
        ctx.beginPath();
        ctx.moveTo(Math.cos(ray.angle) * inner, Math.sin(ray.angle) * inner);
        ctx.lineTo(Math.cos(ray.angle) * outer, Math.sin(ray.angle) * outer);
        ctx.stroke();
      }

      // Expanding rotating geometric wireframe polygon
      ctx.rotate(db.rotation);
      ctx.strokeStyle = PALETTE.ink;
      ctx.globalAlpha = t * 0.6;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < db.sides; i++) {
        const a = (i * Math.PI * 2) / db.sides;
        const px = Math.cos(a) * db.radius;
        const py = Math.sin(a) * db.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    }

    for (const rp of this.ripples) {
      const alpha = Math.max(0, rp.life / rp.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.72;
      ctx.strokeStyle = rp.color;
      ctx.lineWidth = rp.lineWidth;
      if (rp.dashed) ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Ruler Beams (!lance / Chain Sketch / Auto-Compass) + Active Weapon Entities
    for (const bm of this.beams) {
      const alpha = Math.max(0, bm.life / bm.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = bm.color;
      ctx.lineWidth = 2 + alpha * 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bm.x1, bm.y1);
      ctx.lineTo(bm.x2, bm.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Dual Spinning Pencil Lasers (!orbit)
    if (this.orbitLaser) {
      const ol = this.orbitLaser;
      const beamLen = Math.min(this.width, this.height) * 0.48;
      const fade = Math.min(1, ol.timer * 2);
      ctx.save();
      ctx.globalAlpha = fade;
      for (const a of [ol.angle, ol.angle + Math.PI]) {
        const x2 = cx + Math.cos(a) * beamLen;
        const y2 = cy + Math.sin(a) * beamLen;
        // Soft crimson outer wash
        ctx.strokeStyle = 'rgba(184, 58, 58, 0.28)';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Razor sharp crimson core
        ctx.strokeStyle = PALETTE.crimson;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Homing Calligraphy Ink Darts (!swarm)
    for (const dart of this.homingDarts) {
      if (dart.trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = PALETTE.crimson;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(dart.trail[0].x, dart.trail[0].y);
        for (let i = 1; i < dart.trail.length; i++) {
          ctx.lineTo(dart.trail[i].x, dart.trail[i].y);
        }
        ctx.stroke();
        // Dart tip
        ctx.fillStyle = PALETTE.ink;
        ctx.beginPath();
        ctx.arc(dart.x, dart.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Origami Hunter Drones (!drone)
    for (const dr of this.hunterDrones) {
      const fade = Math.min(1, dr.life * 1.5);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(dr.x, dr.y);
      ctx.rotate(dr.angle);
      ctx.fillStyle = PALETTE.paper;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-9, -7);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Crimson center crease
      ctx.strokeStyle = PALETTE.crimson;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-5, 0);
      ctx.stroke();
      ctx.restore();
    }

    // 8. Targeting sightline (crisp animated crimson dashed line to active target)
    if (this.lockedEnemyId !== null) {
      const locked = this.enemies.find((e) => e.id === this.lockedEnemyId);
      if (locked) {
        ctx.save();
        ctx.strokeStyle = 'rgba(184, 58, 58, 0.52)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -this.pulseTime * 28;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(locked.x, locked.y);
        ctx.stroke();
        ctx.restore();
      }
    } else if (this.boss && this.bossLocked) {
      const targetY = this.isMobileMode() ? 152 : 166;
      ctx.save();
      ctx.strokeStyle = 'rgba(184, 58, 58, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -this.pulseTime * 28;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, targetY);
      ctx.stroke();
      ctx.restore();
    }

    // 9. Projectiles (tapered graphite darts)
    for (const p of this.projectiles) {
      if (p.trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = p.isFinal ? PALETTE.crimson : PALETTE.ink;
        ctx.lineWidth = p.isFinal ? 2.8 : 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let i = 1; i < p.trail.length; i++) {
          ctx.lineTo(p.trail[i].x, p.trail[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 10. Particles
    for (const pt of this.particles) {
      const alpha = Math.max(0, pt.life / pt.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rotation);
      if (pt.shape === 'line') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-pt.size * 1.8, 0);
        ctx.lineTo(pt.size * 1.8, 0);
        ctx.stroke();
      } else if (pt.shape === 'shard') {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.moveTo(pt.size * 1.4, 0);
        ctx.lineTo(-pt.size, -pt.size * 0.7);
        ctx.lineTo(-pt.size, pt.size * 0.7);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(0, 0, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 11. Center Player Glyph + Bars
    this.renderPlayerGlyph(cx, cy);
    this.renderPlayerBars(cx, cy);

    // 12. Enemies (locked on top)
    const sortedEnemies = [...this.enemies].sort((a, b) => {
      if (a.id === this.lockedEnemyId) return 1;
      if (b.id === this.lockedEnemyId) return -1;
      return 0;
    });
    for (const en of sortedEnemies) {
      this.renderEnemy(en, en.id === this.lockedEnemyId);
    }

    // 13. Boss Emblem & Scrolling Passage Ticker
    if (this.boss) {
      this.renderBoss(cx);
    }

    // 14. Floating Callouts
    for (const ft of this.floatingTexts) {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `600 ${ft.size}px "DM Sans", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = ft.color;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    // 15. ! Ability Cast Prompt
    if (this.abilityMode) {
      this.renderAbilityPrompt(cx, cy - 56);
    }

    // 16. Toast notification
    if (this.toastTimer > 0 && this.toastText) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toastTimer * 1.5);
      ctx.font = '600 13px "DM Sans", "Inter", system-ui, sans-serif';
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = 'center';
      ctx.fillText(this.toastText, cx, cy - 86);
      ctx.restore();
    }

    // 17. Top & Bottom Minimal HUD (or Custom Mobile Keyboard + Ability Bar)
    this.renderTopHud();
    if (this.isMobileMode()) {
      const nativeActive = this.isNativeKeyboardActive();
      const effectiveH = nativeActive ? this.visibleHeight : this.height;
      this.mobileKb.render(
        ctx,
        this.width,
        effectiveH,
        this.getEquippedAbilityDefs(),
        this.charge,
        true,
        this.lockedEnemyId !== null || this.bossLocked,
        nativeActive
      );
      if (nativeActive && this.mode === 'playing' && !this.nativeKb.isFocused()) {
        this.renderNativeKbPrompt(cx);
      }
    } else {
      this.renderBottomHud();
    }
    this.renderMuteButton();

    // 18. Modal Overlays (Draft / Pause / Game Over / Victory)
    if (this.mode === 'draft') {
      this.renderDraftOverlay(cx, this.height / 2);
    } else if (this.mode === 'paused') {
      this.renderPauseOverlay(cx, this.height / 2);
    } else if (this.mode === 'gameover' || this.mode === 'victory') {
      this.renderEndOverlay(cx, this.height / 2, this.mode === 'victory');
    }

    ctx.restore();
  }

  private renderPlayerGlyph(cx: number, cy: number): void {
    const ctx = this.ctx;
    const breathe = Math.sin(this.pulseTime * 2.4) * 1.1;
    const kick = this.glyphKick * 3.5;

    ctx.save();
    ctx.translate(cx, cy);

    // Subtle Flow State halo when streak >= 12
    if (this.streak >= 12) {
      ctx.save();
      ctx.rotate(this.glyphAngle);
      ctx.strokeStyle = 'rgba(184, 58, 58, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 14 + kick * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Faint compass tick ring rotating with typing rhythm
    ctx.save();
    ctx.rotate(this.glyphAngle);
    ctx.strokeStyle = 'rgba(43, 42, 41, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (PLAYER_RADIUS + 3), Math.sin(a) * (PLAYER_RADIUS + 3));
      ctx.lineTo(Math.cos(a) * (PLAYER_RADIUS + 7 + kick * 0.5), Math.sin(a) * (PLAYER_RADIUS + 7 + kick * 0.5));
      ctx.stroke();
    }
    ctx.restore();

    // Outer charcoal ring
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS + breathe * 0.4 + kick * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Inner offset ring
    ctx.strokeStyle = PALETTE.inkMuted;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(1.2, -0.8, PLAYER_RADIUS - 5.5, 0, Math.PI * 2);
    ctx.stroke();

    // Ward shield ring
    if (this.wardHits > 0) {
      ctx.save();
      ctx.rotate(-this.pulseTime * 0.85);
      ctx.strokeStyle = PALETTE.crimson;
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Primed Smudge pulse ring
    if (this.smudgePrimed) {
      ctx.save();
      ctx.strokeStyle = PALETTE.smudge;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.45 + Math.sin(this.pulseTime * 8) * 0.25;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private renderPlayerBars(cx: number, cy: number): void {
    const ctx = this.ctx;
    const barW = 72;
    const barH = 3.5;
    const barY = cy + PLAYER_RADIUS + 16;

    ctx.fillStyle = PALETTE.inkFaint;
    ctx.fillRect(cx - barW / 2, barY, barW, barH);

    const hpRatio = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = hpRatio > 0.35 ? PALETTE.ink : PALETTE.crimson;
    ctx.fillRect(cx - barW / 2, barY, barW * hpRatio, barH);

    ctx.font = '500 11px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.inkMuted;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(this.hp)} / ${this.maxHp}`, cx, barY + 15);

    if (this.smudge > 0 || this.smudgePrimed) {
      const smudgeY = barY + 23;
      ctx.fillStyle = 'rgba(43, 42, 41, 0.12)';
      ctx.fillRect(cx - barW / 2, smudgeY, barW, 2.8);

      ctx.fillStyle = this.smudgePrimed ? PALETTE.crimson : PALETTE.smudge;
      const fillW = this.smudgePrimed ? barW : barW * (this.smudge / 100);
      ctx.fillRect(cx - barW / 2, smudgeY, fillW, 2.8);

      if (this.smudgePrimed) {
        ctx.font = '600 9px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.fillStyle = PALETTE.crimson;
        ctx.fillText('SMUDGE PRIMED', cx, smudgeY + 12);
      }
    }
  }

  private renderEnemy(en: Enemy, isLocked: boolean): void {
    const ctx = this.ctx;
    const shakeX = en.shakeTimer > 0 ? Math.sin(en.shakeTimer * 70) * 4 : 0;
    const scale = en.spawnAnim * en.hitScale;
    const otherTargetLocked = (this.lockedEnemyId !== null && !isLocked) || this.bossLocked;

    ctx.save();
    ctx.translate(en.x + shakeX, en.y);
    ctx.scale(scale, scale);

    if (isLocked) {
      // Crisp pulsing crimson targeting reticle + crosshair ticks
      const pulse = Math.sin(this.pulseTime * 7) * 1.4;
      const reticleR = en.radius + 9 + pulse;
      ctx.save();
      ctx.rotate(this.pulseTime * 1.2);
      ctx.strokeStyle = 'rgba(184, 58, 58, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, reticleR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (reticleR - 3), Math.sin(a) * (reticleR - 3));
        ctx.lineTo(Math.cos(a) * (reticleR + 4), Math.sin(a) * (reticleR + 4));
        ctx.stroke();
      }
      ctx.restore();
    }

    const fill = en.hitFlash > 0 ? PALETTE.ink : PALETTE.crimson;

    switch (en.kind) {
      case 'dot': {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, 0, en.radius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ring': {
        ctx.strokeStyle = fill;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, en.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, 0, en.radius * 0.42, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'arrow': {
        ctx.rotate(en.rotation);
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(en.radius + 3, 0);
        ctx.lineTo(-en.radius, -en.radius * 0.78);
        ctx.lineTo(-en.radius * 0.45, 0);
        ctx.lineTo(-en.radius, en.radius * 0.78);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'pentagon': {
        ctx.rotate(en.rotation);
        ctx.fillStyle = fill;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const px = Math.cos(a) * en.radius;
          const py = Math.sin(a) * en.radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'diamond': {
        ctx.rotate(en.rotation + Math.PI / 4);
        ctx.strokeStyle = fill;
        ctx.lineWidth = 1.8;
        ctx.strokeRect(-en.radius * 0.85, -en.radius * 0.85, en.radius * 1.7, en.radius * 1.7);
        ctx.fillStyle = fill;
        ctx.fillRect(-en.radius * 0.45, -en.radius * 0.45, en.radius * 0.9, en.radius * 0.9);
        break;
      }
    }
    ctx.restore();

    // Word label above enemy
    ctx.save();
    if (otherTargetLocked) {
      ctx.globalAlpha = 0.52;
    }
    const fontSize = isLocked ? 18 : 15;
    ctx.font = `${isLocked ? '600' : '400'} ${fontSize}px "DM Sans", "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    const fullW = ctx.measureText(en.word).width;
    const rawWordX = en.x + shakeX - fullW / 2;
    const wordX = Math.max(18, Math.min(this.width - fullW - 18, rawWordX));
    const wordY = en.y - en.radius - (isLocked ? 22 : 18);

    if (isLocked) {
      // Unmistakable crimson-framed word pill for the currently targeted enemy
      const padX = 9;
      const padY = 5;
      const boxW = fullW + padX * 2;
      const boxH = fontSize + padY * 2;
      ctx.fillStyle = 'rgba(248, 246, 241, 0.95)';
      ctx.fillRect(wordX - padX, wordY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = PALETTE.crimson;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(wordX - padX, wordY - boxH / 2, boxW, boxH);

      // Small crimson target pointer triangle on the left edge
      ctx.fillStyle = PALETTE.crimson;
      ctx.beginPath();
      ctx.moveTo(wordX - padX - 6, wordY - 4);
      ctx.lineTo(wordX - padX - 1, wordY);
      ctx.lineTo(wordX - padX - 6, wordY + 4);
      ctx.closePath();
      ctx.fill();

      if (en.armor > 1) {
        ctx.font = '600 10px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.fillStyle = en.isSmudged ? PALETTE.crimson : PALETTE.inkMuted;
        ctx.textAlign = 'left';
        ctx.fillText(String(en.armor), wordX + fullW + padX + 3, wordY - boxH / 2 + 2);
        ctx.font = `600 ${fontSize}px "DM Sans", "Inter", system-ui, sans-serif`;
      }
    } else if (en.armor > 1) {
      const padX = 7;
      const padY = 4;
      const boxW = fullW + padX * 2;
      const boxH = fontSize + padY * 2;
      ctx.fillStyle = en.isSmudged ? 'rgba(58, 56, 54, 0.16)' : 'rgba(242, 239, 233, 0.78)';
      ctx.fillRect(wordX - padX, wordY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = en.isSmudged ? PALETTE.smudge : PALETTE.inkMuted;
      ctx.lineWidth = en.isSmudged ? 1.5 : 1;
      ctx.strokeRect(wordX - padX, wordY - boxH / 2, boxW, boxH);

      ctx.font = '600 10px "DM Sans", "Inter", system-ui, sans-serif';
      ctx.fillStyle = en.isSmudged ? PALETTE.crimson : PALETTE.inkMuted;
      ctx.textAlign = 'left';
      ctx.fillText(String(en.armor), wordX + fullW + padX + 3, wordY - boxH / 2 + 2);
      ctx.font = `400 ${fontSize}px "DM Sans", "Inter", system-ui, sans-serif`;
    }

    // Draw letter-by-letter: strictly RED (typed) and GREY (untyped) for instant readability
    let cursorX = wordX;
    ctx.textAlign = 'left';
    for (let i = 0; i < en.word.length; i++) {
      const ch = en.word[i];
      const isTyped = i < en.typedCount;
      const isFaded = en.fadeTimer > 0 && !isTyped && en.fadedIndices.includes(i);

      if (isTyped) ctx.fillStyle = PALETTE.crimson;
      else if (isFaded) ctx.fillStyle = 'rgba(140, 137, 132, 0.2)';
      else ctx.fillStyle = PALETTE.inkMuted;

      ctx.fillText(ch, cursorX, wordY);
      cursorX += ctx.measureText(ch).width;
    }

    ctx.restore();
  }

  private renderBoss(cx: number): void {
    if (!this.boss) return;
    const b = this.boss;
    const ctx = this.ctx;
    const mobile = this.isMobileMode();
    const shakeX = b.shakeTimer > 0 ? Math.sin(b.shakeTimer * 70) * 5 : 0;
    const isBossLocked = this.bossLocked;
    const isEnemyLocked = this.lockedEnemyId !== null;

    ctx.save();
    ctx.globalAlpha = b.enterAnim;

    // Boss Title + HP Bar
    const pct = Math.min(1, b.typedIndex / b.passage.length);
    const barW = 130;
    const titleY = mobile ? 58 : 64;
    const barY = mobile ? 66 : 72;
    const emblemY = mobile ? 94 : 104;
    const tickerY = mobile ? 134 : 148;

    ctx.textAlign = 'center';
    ctx.fillStyle = isBossLocked ? PALETTE.crimson : PALETTE.ink;
    ctx.font = `600 ${mobile ? 15 : 16}px "DM Sans", "Inter", system-ui, sans-serif`;
    ctx.fillText(isBossLocked ? `● TARGETING ${b.name.toUpperCase()}` : `Defeat ${b.name}!`, cx, titleY);

    ctx.fillStyle = PALETTE.inkFaint;
    ctx.fillRect(cx - barW / 2, barY, barW, 4);
    ctx.fillStyle = PALETTE.crimson;
    ctx.fillRect(cx - barW / 2, barY, barW * (1 - pct), 4);

    // Boss Geometric Emblem
    ctx.save();
    ctx.translate(cx + shakeX, emblemY);
    if (isBossLocked) {
      const pulse = Math.sin(this.pulseTime * 6) * 1.5;
      ctx.save();
      ctx.rotate(-this.pulseTime * 0.9);
      ctx.strokeStyle = 'rgba(184, 58, 58, 0.78)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 27 + pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const col = b.hitFlash > 0 || isBossLocked ? PALETTE.crimson : PALETTE.ink;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2;

    if (b.id === 'compass') {
      // Eye + drafting compass arc
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.quadraticCurveTo(0, -18, 24, 0);
      ctx.quadraticCurveTo(0, 18, -24, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 14, -Math.PI * 0.8 + b.rotation, -Math.PI * 0.2 + b.rotation);
      ctx.stroke();
    } else if (b.id === 'eraser') {
      // Hovering oblique eraser monolith
      ctx.rotate(Math.sin(this.pulseTime * 2) * 0.08);
      ctx.strokeRect(-22, -11, 44, 22);
      ctx.fillStyle = 'rgba(43, 42, 41, 0.14)';
      ctx.fillRect(-22, -11, 16, 22);
      ctx.beginPath();
      ctx.moveTo(-6, -11);
      ctx.lineTo(-6, 11);
      ctx.stroke();
    } else {
      // Rotating geometric polyhedron-eye
      ctx.save();
      ctx.rotate(b.rotation);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        const rx = Math.cos(a) * 20;
        const ry = Math.sin(a) * 20;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fillStyle = b.phase === 2 ? PALETTE.crimson : col;
      ctx.fill();
    }
    ctx.restore();

    // Scrolling Horizontal Passage Ticker (clearly reflects Boss lock state!)
    const tickerW = Math.min(540, this.width - (mobile ? 28 : 80));
    const tickerH = mobile ? 34 : 38;

    ctx.save();
    // Dim the boss ticker whenever the player is actively targeting a minion
    if (isEnemyLocked) {
      ctx.globalAlpha = b.enterAnim * 0.45;
    }

    if (isBossLocked) {
      // Elevated parchment frame with crisp crimson border when Boss is targeted
      ctx.fillStyle = 'rgba(248, 246, 241, 0.94)';
      ctx.fillRect(cx - tickerW / 2, tickerY - tickerH / 2, tickerW, tickerH);
      ctx.strokeStyle = PALETTE.crimson;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - tickerW / 2, tickerY - tickerH / 2, tickerW, tickerH);
    } else {
      const ribbonGrad = ctx.createLinearGradient(cx - tickerW / 2, 0, cx + tickerW / 2, 0);
      ribbonGrad.addColorStop(0, 'rgba(242, 239, 233, 0)');
      ribbonGrad.addColorStop(0.15, 'rgba(220, 215, 206, 0.55)');
      ribbonGrad.addColorStop(0.85, 'rgba(220, 215, 206, 0.55)');
      ribbonGrad.addColorStop(1, 'rgba(242, 239, 233, 0)');
      ctx.fillStyle = ribbonGrad;
      ctx.fillRect(cx - tickerW / 2, tickerY - tickerH / 2, tickerW, tickerH);
    }

    // Clip to ticker width
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - tickerW / 2 + 4, tickerY - tickerH / 2 - 2, tickerW - 8, tickerH + 4);
    ctx.clip();

    ctx.font = `500 ${mobile ? 19 : 22}px "DM Sans", "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const typedPart = b.passage.slice(0, b.typedIndex);
    const untypedPart = b.passage.slice(b.typedIndex);
    const typedW = ctx.measureText(typedPart).width;

    // Position the split right at cx: strictly RED (typed) and GREY (untyped)
    const textStartX = cx - typedW + shakeX;
    ctx.fillStyle = PALETTE.crimson;
    ctx.fillText(typedPart, textStartX, tickerY);
    ctx.fillStyle = PALETTE.inkMuted;
    ctx.fillText(untypedPart, cx + shakeX, tickerY);
    ctx.restore();

    // Vertical cursor line (crimson when targeting Boss, muted grey when not)
    ctx.strokeStyle = isBossLocked ? PALETTE.crimson : PALETTE.inkMuted;
    ctx.lineWidth = isBossLocked ? 2 : 1.3;
    ctx.beginPath();
    ctx.moveTo(cx, tickerY - tickerH / 2 + 1);
    ctx.lineTo(cx, tickerY + tickerH / 2 - 1);
    ctx.stroke();

    // Progress + clear targeting status hint below ticker
    ctx.font = '600 11px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = isBossLocked ? PALETTE.crimson : PALETTE.inkMuted;
    ctx.textAlign = 'center';
    const nextLetter = this.getBossExpectedLetter();
    const statusHint = isBossLocked
      ? `${Math.round(pct * 100)}%  ·  ${mobile && !this.isNativeKeyboardActive() ? 'Tap UNLOCK to switch to minions' : 'Space to switch to minions'}`
      : isEnemyLocked
        ? `${Math.round(pct * 100)}%  ·  Targeting minion`
        : nextLetter
          ? `${Math.round(pct * 100)}%  ·  Type '${nextLetter}' to target boss`
          : `${Math.round(pct * 100)}%`;
    ctx.fillText(statusHint, cx, tickerY + tickerH / 2 + 12);

    ctx.restore();
    ctx.restore();
  }

  private renderAbilityPrompt(cx: number, y: number): void {
    const ctx = this.ctx;
    const shakeX = this.abilityShake > 0 ? Math.sin(this.abilityShake * 80) * 5 : 0;

    ctx.save();
    ctx.translate(cx + shakeX, y);

    const text = `!${this.abilityBuffer}`;
    ctx.font = '600 18px "DM Sans", "Inter", system-ui, sans-serif';
    const textW = Math.max(76, ctx.measureText(text).width + 28);

    ctx.fillStyle = 'rgba(242, 239, 233, 0.95)';
    ctx.strokeStyle = PALETTE.crimson;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-textW / 2, -16, textW, 32);
    ctx.strokeRect(-textW / 2, -16, textW, 32);

    ctx.fillStyle = PALETTE.crimson;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text + '▏', 0, 0);

    const hints = this.getEquippedAbilityDefs()
      .filter((ab) => ab.command.startsWith(this.abilityBuffer))
      .map((ab) => `${ab.label}(${ab.cost})`)
      .join('  ·  ');

    ctx.font = '400 11px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.inkMuted;
    ctx.fillText(hints || 'Space to cancel', 0, -26);
    ctx.restore();
  }

  private renderTopHud(): void {
    const ctx = this.ctx;
    const cx = this.width / 2;

    const mins = Math.floor(this.elapsed / 60);
    const secs = Math.floor(this.elapsed % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    ctx.save();
    // Top-left Stage & Difficulty
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '600 13px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillText(`Stage ${this.stage} / 3  ·  ${this.getDifficulty().label}`, 20, 26);

    if (!this.boss) {
      const wavePct = Math.min(1, this.stageTimer / STAGE_WAVE_DURATION);
      ctx.fillStyle = PALETTE.inkFaint;
      ctx.fillRect(20, 34, 96, 3);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(20, 34, 96 * wavePct, 3);
    }

    // Top-center Timer + Stats
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '600 15px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillText(timeStr, cx, 24);

    ctx.fillStyle = PALETTE.inkMuted;
    ctx.font = '400 11px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillText(
      `Score ${this.score}  ·  ${this.getWpm()} WPM  ·  ${this.getAccuracy()}% Acc  ·  Lv ${this.level}`,
      cx,
      41
    );

    // Subtle XP bar along very top edge
    const xpPct = Math.min(1, this.xp / this.xpToNext);
    ctx.fillStyle = 'rgba(184, 58, 58, 0.55)';
    ctx.fillRect(0, 0, this.width * xpPct, 2.5);

    ctx.restore();
  }

  private renderBottomHud(): void {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const slotCount = 5;
    const slotSize = 46;
    const gap = 8;
    const totalW = slotCount * slotSize + (slotCount - 1) * gap;
    const startX = cx - totalW / 2;
    const slotY = this.height - slotSize - 26;

    ctx.save();

    // 4-pip Shared Charge Pool right above the 5 slots
    const pipCount = 4;
    const pipGap = 6;
    const pipW = (totalW - (pipCount - 1) * pipGap) / pipCount;
    const pipH = 5;
    const pipY = slotY - 15;

    for (let i = 0; i < pipCount; i++) {
      const px = startX + i * (pipW + pipGap);
      ctx.fillStyle = 'rgba(43, 42, 41, 0.12)';
      ctx.fillRect(px, pipY, pipW, pipH);

      const pipFill = Math.max(0, Math.min(1, (this.charge - i * 25) / 25));
      if (pipFill > 0) {
        ctx.fillStyle = pipFill >= 1 ? PALETTE.crimson : PALETTE.inkMuted;
        ctx.fillRect(px, pipY, pipW * pipFill, pipH);
      }
    }

    // 5 Loadout Slots
    const equipped = this.getEquippedAbilityDefs();
    for (let i = 0; i < slotCount; i++) {
      const sx = startX + i * (slotSize + gap);
      const ab = equipped[i];
      const canAfford = ab ? this.charge >= ab.cost : false;

      ctx.fillStyle = ab && canAfford ? PALETTE.crimson : PALETTE.slotBg;
      ctx.fillRect(sx, slotY, slotSize, slotSize);

      ctx.strokeStyle = ab && canAfford ? PALETTE.crimson : PALETTE.slotBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, slotY, slotSize, slotSize);

      if (ab) {
        ctx.fillStyle = canAfford ? '#F7F5F0' : PALETTE.inkMuted;
        ctx.font = '600 10px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ab.label, sx + slotSize / 2, slotY + slotSize / 2 - 6);

        ctx.font = '500 9px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.globalAlpha = 0.85;
        ctx.fillText(`${ab.cost}`, sx + slotSize / 2, slotY + slotSize / 2 + 9);
        ctx.globalAlpha = 1;
      }
    }

    ctx.font = '400 11px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.inkMuted;
    ctx.textAlign = 'center';
    ctx.fillText(
      'Type words to shoot  ·  Space detarget  ·  ! + command for abilities  ·  Esc pause',
      cx,
      this.height - 9
    );

    ctx.restore();
  }

  private getDraftCardRects(): Array<{ x: number; y: number; w: number; h: number }> {
    const count = this.draftCards.length;
    if (this.isMobileMode()) {
      const cardW = Math.min(360, this.width - 32);
      const cardH = Math.min(118, (this.height - 210) / Math.max(1, count));
      const gap = 12;
      const totalH = count * cardH + (count - 1) * gap;
      const startY = Math.max(125, this.height / 2 - totalH / 2 + 18);
      const x = this.width / 2 - cardW / 2;
      return this.draftCards.map((_, i) => ({
        x,
        y: startY + i * (cardH + gap),
        w: cardW,
        h: cardH,
      }));
    }

    const cardW = Math.min(220, (this.width - 80) / Math.max(1, count));
    const cardH = 195;
    const gap = 18;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = this.width / 2 - totalW / 2;
    const y = this.height / 2 - cardH / 2 + 12;

    return this.draftCards.map((_, i) => ({
      x: startX + i * (cardW + gap),
      y,
      w: cardW,
      h: cardH,
    }));
  }

  private renderDraftOverlay(cx: number, cy: number): void {
    const ctx = this.ctx;
    const mobile = this.isMobileMode();
    ctx.save();
    ctx.fillStyle = 'rgba(242, 239, 233, 0.92)';
    ctx.fillRect(0, 0, this.width, this.height);

    const headerY = mobile ? 72 : cy - 126;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `600 ${mobile ? 21 : 24}px "DM Sans", "Inter", system-ui, sans-serif`;
    ctx.fillText(this.draftTitle, cx, headerY);

    ctx.fillStyle = PALETTE.inkMuted;
    ctx.font = '400 13px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillText(
      mobile ? 'Tap an upgrade card to select it' : 'Type a card’s keyword to select it  ·  Space to cancel',
      cx,
      headerY + 24
    );

    const rects = this.getDraftCardRects();

    for (let i = 0; i < this.draftCards.length; i++) {
      const card = this.draftCards[i];
      const r = rects[i];
      const isLocked = this.draftLockedIndex === i;

      ctx.save();
      ctx.translate(0, isLocked ? -6 : 0);

      ctx.fillStyle = '#F8F6F1';
      ctx.fillRect(r.x, r.y, r.w, r.h);

      ctx.strokeStyle = isLocked ? PALETTE.crimson : PALETTE.slotBorder;
      ctx.lineWidth = isLocked ? 2 : 1.2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      if (mobile) {
        // Compact horizontal mobile card layout
        ctx.textAlign = 'left';
        ctx.font = '600 10px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.fillStyle =
          card.kind === 'ability' ? PALETTE.crimson : card.kind === 'survival' ? PALETTE.gold : PALETTE.inkMuted;
        ctx.fillText(card.kind.toUpperCase(), r.x + 14, r.y + 20);

        ctx.font = '600 17px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.fillStyle = PALETTE.ink;
        ctx.fillText(card.title, r.x + 14, r.y + 42);

        ctx.font = '400 12px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.fillStyle = PALETTE.inkMuted;
        this.drawWrappedTextLeft(card.description, r.x + 14, r.y + 64, r.w - 28, 16);
      } else {
        // Desktop vertical card with typing keyword
        ctx.font = '600 10px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.fillStyle =
          card.kind === 'ability' ? PALETTE.crimson : card.kind === 'survival' ? PALETTE.gold : PALETTE.inkMuted;
        ctx.textAlign = 'center';
        ctx.fillText(card.kind.toUpperCase(), r.x + r.w / 2, r.y + 24);

        ctx.font = '600 18px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.fillStyle = PALETTE.ink;
        ctx.fillText(card.title, r.x + r.w / 2, r.y + 52);

        ctx.font = '400 12px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.fillStyle = PALETTE.inkMuted;
        this.drawWrappedText(card.description, r.x + r.w / 2, r.y + 82, r.w - 28, 17);

        const kwY = r.y + r.h - 32;
        ctx.font = '600 16px "DM Sans", "Inter", system-ui, sans-serif';
        const kwW = ctx.measureText(card.keyword).width;
        const kwX = r.x + r.w / 2 - kwW / 2;

        ctx.fillStyle = isLocked ? 'rgba(184, 58, 58, 0.1)' : 'rgba(43, 42, 41, 0.05)';
        ctx.fillRect(r.x + 18, kwY - 14, r.w - 36, 28);

        const typed = isLocked ? card.keyword.slice(0, this.draftTypedCount) : '';
        const rest = isLocked ? card.keyword.slice(this.draftTypedCount) : card.keyword;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        if (typed) {
          ctx.fillStyle = PALETTE.crimson;
          ctx.fillText(typed, kwX, kwY);
        }
        ctx.fillStyle = PALETTE.inkMuted;
        ctx.fillText(rest, kwX + ctx.measureText(typed).width, kwY);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  private drawWrappedTextLeft(text: string, x: number, y: number, maxW: number, lineH: number): void {
    const ctx = this.ctx;
    const words = text.split(' ');
    let line = '';
    let currY = y;
    ctx.textAlign = 'left';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, currY);
        line = w;
        currY += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, currY);
  }

  private drawWrappedText(text: string, x: number, y: number, maxW: number, lineH: number): void {
    const ctx = this.ctx;
    const words = text.split(' ');
    let line = '';
    let currY = y;
    ctx.textAlign = 'center';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, currY);
        line = w;
        currY += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, currY);
  }

  private drawRoundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private renderNativeKbPrompt(cx: number): void {
    const ctx = this.ctx;
    const text = 'Tap arena to open keyboard';
    const y = this.mobileKb.abilityBarTopY - 36;
    ctx.save();
    ctx.font = '600 12px "DM Sans", "Inter", system-ui, sans-serif';
    const pillW = ctx.measureText(text).width + 26;
    const pillH = 26;
    const x = cx - pillW / 2;
    const py = y - pillH / 2;

    ctx.fillStyle = 'rgba(248, 246, 241, 0.94)';
    ctx.strokeStyle = PALETTE.crimson;
    ctx.lineWidth = 1.2;
    this.drawRoundRect(x, py, pillW, pillH, 13);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.crimson;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y + 0.5);
    ctx.restore();
  }

  private renderMuteButton(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '500 12px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.inkMuted;
    ctx.textAlign = 'right';
    ctx.fillText(this.sound.isMuted() ? 'Audio: Off' : 'Audio: On', this.width - 16, 26);

    ctx.fillText(this.isMobileMode() ? '[Mobile UI]' : '[Desktop UI]', this.width - 96, 26);

    if (this.isMobileMode() && (this.mode === 'playing' || this.mode === 'paused')) {
      ctx.fillStyle = this.mobileKeyboardMode === 'native' ? PALETTE.crimson : PALETTE.inkMuted;
      ctx.font = '600 11px "DM Sans", "Inter", system-ui, sans-serif';
      ctx.fillText(
        this.mobileKeyboardMode === 'native' ? '[KB: Native]' : '[KB: Built-in]',
        this.width - 74,
        56
      );

      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(this.mode === 'paused' ? 'Resume' : 'Pause', this.width - 16, 56);
    }
    ctx.restore();
  }

  private getKeyboardToggleRect(): { x: number; y: number; w: number; h: number } {
    const slider = this.getDifficultySliderRect();
    const w = Math.min(248, this.width - 48);
    const h = 30;
    return {
      x: this.width / 2 - w / 2,
      y: slider.y + 56,
      w,
      h,
    };
  }

  private getDifficultySliderRect(): { x: number; y: number; w: number } {
    const w = Math.min(290, this.width - 68);
    const cy = this.isMobileMode() ? this.height * 0.42 : this.height / 2;
    return {
      x: this.width / 2 - w / 2,
      y: cy + (this.isMobileMode() ? 165 : 150),
      w,
    };
  }

  private getStartButtonRect(): { x: number; y: number; w: number; h: number } {
    const w = 168;
    const h = 42;
    const cy = this.isMobileMode() ? this.height * 0.42 : this.height / 2;
    return {
      x: this.width / 2 - w / 2,
      y: cy + 56,
      w,
      h,
    };
  }

  private getRetryButtonRect(): { x: number; y: number; w: number; h: number } {
    const w = 168;
    const h = 42;
    return {
      x: this.width / 2 - w / 2,
      y: this.height / 2 + 86,
      w,
      h,
    };
  }

  private renderTitleOverlay(cx: number, _arenaCy: number): void {
    const ctx = this.ctx;
    const mobile = this.isMobileMode();
    const cy = mobile ? this.height * 0.42 : this.height / 2;

    ctx.save();
    ctx.textAlign = 'center';

    ctx.fillStyle = PALETTE.ink;
    ctx.font = `600 ${mobile ? 32 : 36}px "DM Sans", "Inter", system-ui, sans-serif`;
    ctx.fillText('TypingGlyph', cx, cy - 88);

    ctx.fillStyle = PALETTE.inkMuted;
    ctx.font = `400 ${mobile ? 13 : 14}px "DM Sans", "Inter", system-ui, sans-serif`;
    ctx.fillText('3-Stage Typing Roguelike  ·  Paper, Pencil & Geometry', cx, cy - 56);

    if (mobile) {
      const btn = this.getStartButtonRect();
      ctx.fillStyle = PALETTE.crimson;
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.fillStyle = '#F8F6F1';
      ctx.font = '600 15px "DM Sans", "Inter", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAP TO START', cx, btn.y + btn.h / 2);
      ctx.textBaseline = 'alphabetic';
    } else {
      const promptY = cy + 62;
      ctx.font = '400 13px "DM Sans", "Inter", system-ui, sans-serif';
      ctx.fillStyle = PALETTE.inkMuted;
      ctx.fillText('Type to begin (or press Enter):', cx, promptY);

      const target = 'start';
      ctx.font = '600 22px "DM Sans", "Inter", system-ui, sans-serif';
      const fullW = ctx.measureText(target).width;
      const x0 = cx - fullW / 2;
      const typed = target.slice(0, this.titleBuffer.length);
      const rest = target.slice(this.titleBuffer.length);

      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.crimson;
      ctx.fillText(typed, x0, promptY + 30);
      ctx.fillStyle = PALETTE.inkMuted;
      ctx.fillText(rest, x0 + ctx.measureText(typed).width, promptY + 30);
    }

    // Interactive Difficulty Slider
    const slider = this.getDifficultySliderRect();
    const diff = this.getDifficulty();
    const count = DIFFICULTY_PRESETS.length;

    ctx.textAlign = 'center';
    ctx.font = '600 12px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(`Difficulty: ${diff.label}`, cx, slider.y - 18);

    ctx.strokeStyle = PALETTE.inkFaint;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(slider.x, slider.y);
    ctx.lineTo(slider.x + slider.w, slider.y);
    ctx.stroke();

    const activeX = slider.x + (this.difficultyIndex / (count - 1)) * slider.w;
    ctx.strokeStyle = PALETTE.crimson;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(slider.x, slider.y);
    ctx.lineTo(activeX, slider.y);
    ctx.stroke();

    for (let i = 0; i < count; i++) {
      const sx = slider.x + (i / (count - 1)) * slider.w;
      const isSelected = i === this.difficultyIndex;
      ctx.fillStyle = isSelected ? PALETTE.crimson : PALETTE.paper;
      ctx.strokeStyle = isSelected ? PALETTE.crimson : PALETTE.inkMuted;
      ctx.lineWidth = isSelected ? 2 : 1.4;
      ctx.beginPath();
      ctx.arc(sx, slider.y, isSelected ? 6.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = `${isSelected ? '600' : '400'} 11px "DM Sans", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = isSelected ? PALETTE.crimson : PALETTE.inkMuted;
      ctx.fillText(DIFFICULTY_PRESETS[i].label, sx, slider.y + 20);
    }

    ctx.font = '400 11px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.inkMuted;
    ctx.fillText(
      mobile ? `${diff.description} (tap slider)` : `${diff.description}  (← / → or click)`,
      cx,
      slider.y + 40
    );

    // Mobile Keyboard Mode Toggle Pill (Built-in vs Native OS)
    if (mobile) {
      const kbRect = this.getKeyboardToggleRect();
      const isNative = this.mobileKeyboardMode === 'native';

      ctx.save();
      ctx.fillStyle = '#F8F6F1';
      ctx.strokeStyle = PALETTE.slotBorder;
      ctx.lineWidth = 1.2;
      this.drawRoundRect(kbRect.x, kbRect.y, kbRect.w, kbRect.h, 15);
      ctx.fill();
      ctx.stroke();

      ctx.textBaseline = 'middle';
      ctx.font = '500 11px "DM Sans", "Inter", system-ui, sans-serif';
      const labelY = kbRect.y + kbRect.h / 2 + 0.5;
      const prefix = 'Keyboard: ';
      const optBuiltin = 'Built-in';
      const sep = '  |  ';
      const optNative = 'Native OS';

      const wPrefix = ctx.measureText(prefix).width;
      const wBuiltin = ctx.measureText(optBuiltin).width;
      const wSep = ctx.measureText(sep).width;
      const wNative = ctx.measureText(optNative).width;
      let tx = cx - (wPrefix + wBuiltin + wSep + wNative) / 2;

      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.inkMuted;
      ctx.fillText(prefix, tx, labelY);
      tx += wPrefix;

      ctx.font = `${!isNative ? '600' : '400'} 11px "DM Sans", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = !isNative ? PALETTE.crimson : PALETTE.inkMuted;
      ctx.fillText(optBuiltin, tx, labelY);
      tx += wBuiltin;

      ctx.font = '400 11px "DM Sans", "Inter", system-ui, sans-serif';
      ctx.fillStyle = PALETTE.inkFaint;
      ctx.fillText(sep, tx, labelY);
      tx += wSep;

      ctx.font = `${isNative ? '600' : '400'} 11px "DM Sans", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = isNative ? PALETTE.crimson : PALETTE.inkMuted;
      ctx.fillText(optNative, tx, labelY);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.font = '400 11px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.inkMuted;
    ctx.fillText(
      mobile
        ? this.mobileKeyboardMode === 'native'
          ? 'Native OS keyboard  ·  Tap ability buttons  ·  Mobile pace tuned'
          : 'Built-in QWERTY keyboard  ·  Tap ability buttons  ·  Mobile pace tuned'
        : 'A–Z Lock & Fire   ·   Space Detarget   ·   !pulse & Drafted Weapons',
      cx,
      this.height - 24
    );
    ctx.restore();
  }

  private renderPauseOverlay(cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(242, 239, 233, 0.84)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '600 28px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillText('Paused', cx, cy - 10);

    ctx.fillStyle = PALETTE.inkMuted;
    ctx.font = '400 14px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillText(this.isMobileMode() ? 'Tap anywhere to resume' : 'Press Esc to resume', cx, cy + 20);
    ctx.restore();
  }

  private renderEndOverlay(cx: number, cy: number, isVictory: boolean): void {
    const ctx = this.ctx;
    const mobile = this.isMobileMode();
    ctx.save();
    ctx.fillStyle = 'rgba(242, 239, 233, 0.92)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = isVictory ? PALETTE.gold : PALETTE.crimson;
    ctx.font = '600 32px "DM Sans", "Inter", system-ui, sans-serif';
    ctx.fillText(isVictory ? 'Page Completed!' : 'Page Torn', cx, cy - 92);

    const mins = Math.floor(this.elapsed / 60);
    const secs = Math.floor(this.elapsed % 60);
    const stats = [
      `Stage Reached: ${this.stage} / 3   ·   Score: ${this.score}`,
      `Time: ${mins}:${secs.toString().padStart(2, '0')}   ·   Best Streak: ${this.bestStreak}`,
      `Speed: ${this.getWpm()} WPM   ·   Accuracy: ${this.getAccuracy()}%`,
      `Words Cleared: ${this.wordsCompleted}   ·   Smudges Triggered: ${this.smudgesTriggered}`,
    ];

    ctx.fillStyle = PALETTE.ink;
    ctx.font = '400 14px "DM Sans", "Inter", system-ui, sans-serif';
    stats.forEach((line, idx) => {
      ctx.fillText(line, cx, cy - 42 + idx * 24);
    });

    if (mobile) {
      const btn = this.getRetryButtonRect();
      ctx.fillStyle = PALETTE.crimson;
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.fillStyle = '#F8F6F1';
      ctx.font = '600 15px "DM Sans", "Inter", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('PLAY AGAIN', cx, btn.y + btn.h / 2);
      ctx.textBaseline = 'alphabetic';
    } else {
      const promptY = cy + 80;
      ctx.fillStyle = PALETTE.inkMuted;
      ctx.font = '400 13px "DM Sans", "Inter", system-ui, sans-serif';
      ctx.fillText('Type to play again (or press Enter):', cx, promptY);

      const target = 'retry';
      ctx.font = '600 22px "DM Sans", "Inter", system-ui, sans-serif';
      const fullW = ctx.measureText(target).width;
      const x0 = cx - fullW / 2;
      const typed = target.slice(0, this.retryBuffer.length);
      const rest = target.slice(this.retryBuffer.length);

      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.crimson;
      ctx.fillText(typed, x0, promptY + 32);
      ctx.fillStyle = PALETTE.inkMuted;
      ctx.fillText(rest, x0 + ctx.measureText(typed).width, promptY + 32);
    }

    ctx.restore();
  }
}
