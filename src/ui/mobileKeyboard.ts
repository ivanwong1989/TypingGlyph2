import { AbilityDef } from '../game/types';

export interface KeyRect {
  key: string; // 'a'..'z' or 'UNLOCK'
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AbilityButtonRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const PALETTE = {
  trayBg: 'rgba(228, 223, 213, 0.94)',
  trayBorder: '#C9C3B8',
  keyBg: '#F8F6F1',
  keyBorder: '#C4BEB3',
  keyPressedBg: '#B83A3A',
  keyPressedText: '#F8F6F1',
  ink: '#2B2A29',
  inkMuted: '#8C8984',
  crimson: '#B83A3A',
  slotBg: '#E3DFD6',
  slotBorder: '#BDB7AC',
};

/**
 * Custom Canvas-rendered Paper-and-Pencil QWERTY Keyboard + Touch Ability Bar.
 * Zero OS keyboard, zero autocomplete, zero viewport resize jank, pure multi-touch pointerdown.
 */
export class MobileKeyboardUI {
  private keyRects: KeyRect[] = [];
  private abilityRects: AbilityButtonRect[] = [];
  private pressedTimers = new Map<string, number>();

  public trayTopY = 0;
  public abilityBarTopY = 0;

  public layout(width: number, height: number, nativeMode = false): void {
    this.keyRects = [];
    this.abilityRects = [];

    const padX = Math.max(6, Math.min(14, width * 0.02));
    const maxKbW = Math.min(width - padX * 2, 540);
    const startX = (width - maxKbW) / 2;

    if (nativeMode) {
      // Native OS Keyboard mode: omit canvas QWERTY rows and anchor ability bar at bottom of visible viewport
      const abH = 42;
      const abGap = 6;
      const abTop = height - abH - 8;
      this.trayTopY = height;
      this.abilityBarTopY = abTop;
      const abW = (maxKbW - abGap * 4) / 5;

      for (let i = 0; i < 5; i++) {
        this.abilityRects.push({
          index: i,
          x: startX + i * (abW + abGap),
          y: abTop,
          w: abW,
          h: abH,
        });
      }
      return;
    }

    // Keyboard tray height (~31% of viewport, clamped comfortably)
    const kbH = Math.max(176, Math.min(246, height * 0.31));
    const bottomMargin = Math.max(8, Math.min(18, height * 0.018));
    const kbTop = height - kbH - bottomMargin;
    this.trayTopY = kbTop;

    const gapX = 5;
    const gapY = 6;
    const rowCount = 4; // 3 QWERTY rows + 1 compact UNLOCK thumb bar
    const rowH = (kbH - gapY * (rowCount + 1)) / rowCount;
    const unitW = (maxKbW - gapX * 9) / 10;

    // Row 0: Q..P (10 keys)
    {
      const y = kbTop + gapY;
      ROWS[0].forEach((k, i) => {
        this.keyRects.push({
          key: k,
          label: k.toUpperCase(),
          x: startX + i * (unitW + gapX),
          y,
          w: unitW,
          h: rowH,
        });
      });
    }

    // Row 1: A..L (9 keys centered)
    {
      const y = kbTop + gapY * 2 + rowH;
      const row1W = 9 * unitW + 8 * gapX;
      const r1X = startX + (maxKbW - row1W) / 2;
      ROWS[1].forEach((k, i) => {
        this.keyRects.push({
          key: k,
          label: k.toUpperCase(),
          x: r1X + i * (unitW + gapX),
          y,
          w: unitW,
          h: rowH,
        });
      });
    }

    // Row 2: Z..M (7 keys centered — no Backspace key)
    {
      const y = kbTop + gapY * 3 + rowH * 2;
      const row2W = 7 * unitW + 6 * gapX;
      const r2X = startX + (maxKbW - row2W) / 2;
      ROWS[2].forEach((k, i) => {
        this.keyRects.push({
          key: k,
          label: k.toUpperCase(),
          x: r2X + i * (unitW + gapX),
          y,
          w: unitW,
          h: rowH,
        });
      });
    }

    // Row 3: Wide thumb-friendly SPACE / UNLOCK TARGET bar
    {
      const y = kbTop + gapY * 4 + rowH * 3;
      const barW = maxKbW * 0.62;
      this.keyRects.push({
        key: 'UNLOCK',
        label: 'SPACE  ·  UNLOCK TARGET',
        x: startX + (maxKbW - barW) / 2,
        y,
        w: barW,
        h: rowH * 0.9,
      });
    }

    // Touch-Tap Ability Bar directly above keyboard tray (5 slots + charge pips)
    const abH = 42;
    const abGap = 6;
    const abTop = kbTop - abH - 18;
    this.abilityBarTopY = abTop;
    const abW = (maxKbW - abGap * 4) / 5;

    for (let i = 0; i < 5; i++) {
      this.abilityRects.push({
        index: i,
        x: startX + i * (abW + abGap),
        y: abTop,
        w: abW,
        h: abH,
      });
    }
  }

  public update(dt: number): void {
    for (const [k, t] of this.pressedTimers.entries()) {
      if (t - dt <= 0) this.pressedTimers.delete(k);
      else this.pressedTimers.set(k, t - dt);
    }
  }

  public hitTestKey(x: number, y: number): string | null {
    for (const r of this.keyRects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.pressedTimers.set(`${r.key}_${Math.round(r.x)}`, 0.12);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(8);
        }
        return r.key;
      }
    }
    return null;
  }

  public hitTestAbility(x: number, y: number): number | null {
    for (const r of this.abilityRects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(12);
        }
        return r.index;
      }
    }
    return null;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    equippedAbilities: AbilityDef[],
    charge: number,
    showAbilityBar: boolean,
    hasLockedTarget = false,
    nativeMode = false
  ): void {
    if (nativeMode && !showAbilityBar) return;

    ctx.save();

    // Subtle keyboard backdrop tray
    const trayY = showAbilityBar ? this.abilityBarTopY - 16 : this.trayTopY - 4;
    ctx.fillStyle = PALETTE.trayBg;
    ctx.fillRect(0, trayY, width, height - trayY);
    ctx.strokeStyle = PALETTE.trayBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, trayY);
    ctx.lineTo(width, trayY);
    ctx.stroke();

    // Shared Charge Pool (4 pips) + Touch Ability Buttons
    if (showAbilityBar && this.abilityRects.length === 5) {
      const first = this.abilityRects[0];
      const last = this.abilityRects[4];
      const totalW = last.x + last.w - first.x;
      const pipGap = 6;
      const pipW = (totalW - pipGap * 3) / 4;
      const pipY = this.abilityBarTopY - 10;

      for (let i = 0; i < 4; i++) {
        const px = first.x + i * (pipW + pipGap);
        ctx.fillStyle = 'rgba(43, 42, 41, 0.14)';
        ctx.fillRect(px, pipY, pipW, 4);

        const fill = Math.max(0, Math.min(1, (charge - i * 25) / 25));
        if (fill > 0) {
          ctx.fillStyle = fill >= 1 ? PALETTE.crimson : PALETTE.inkMuted;
          ctx.fillRect(px, pipY, pipW * fill, 4);
        }
      }

      for (let i = 0; i < 5; i++) {
        const r = this.abilityRects[i];
        const ab = equippedAbilities[i];
        const canAfford = ab ? charge >= ab.cost : false;

        ctx.fillStyle = ab && canAfford ? PALETTE.crimson : PALETTE.slotBg;
        this.roundRect(ctx, r.x, r.y, r.w, r.h, 5);
        ctx.fill();

        ctx.strokeStyle = ab && canAfford ? PALETTE.crimson : PALETTE.slotBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (ab) {
          ctx.fillStyle = canAfford ? '#F8F6F1' : PALETTE.inkMuted;
          ctx.font = '600 11px "DM Sans", "Inter", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ab.command.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2 - 6);

          ctx.font = '500 9px "DM Sans", "Inter", system-ui, sans-serif';
          ctx.globalAlpha = 0.85;
          ctx.fillText(`${ab.cost}`, r.x + r.w / 2, r.y + r.h / 2 + 8);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Pure Paper-and-Pencil QWERTY Keys (no next-letter hints!)
    if (!nativeMode) {
      for (const r of this.keyRects) {
        const pressed = this.pressedTimers.has(`${r.key}_${Math.round(r.x)}`);
        const isUnlock = r.key === 'UNLOCK';
        const unlockActive = isUnlock && hasLockedTarget;

        ctx.fillStyle = pressed
          ? PALETTE.keyPressedBg
          : unlockActive
            ? '#F3E8E6'
            : isUnlock
              ? '#EAE5DB'
              : PALETTE.keyBg;
        this.roundRect(ctx, r.x, r.y, r.w, r.h, 5);
        ctx.fill();

        ctx.strokeStyle = pressed || unlockActive ? PALETTE.crimson : PALETTE.keyBorder;
        ctx.lineWidth = unlockActive ? 1.5 : 1;
        ctx.stroke();

        ctx.fillStyle = pressed
          ? PALETTE.keyPressedText
          : unlockActive
            ? PALETTE.crimson
            : isUnlock
              ? PALETTE.inkMuted
              : PALETTE.ink;
        ctx.font = isUnlock
          ? '600 11px "DM Sans", "Inter", system-ui, sans-serif'
          : '600 16px "DM Sans", "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.label, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
      }
    }

    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
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
}
