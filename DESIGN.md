# TypingGlyph — Game Design Document & Handoff

> **Status:** Playable Desktop & Mobile HTML5 Prototype Live on GitHub Pages
> **Repository:** https://github.com/ivanwong1989/TypingGlyph2
> **Live Build:** https://ivanwong1989.github.io/TypingGlyph2/

---

## 1. High Concept

**TypingGlyph** is a 2D minimalist center-defense typing roguelike set on a warm sheet of drafting paper. You control a geometric glyph at the center of the arena, defending against waves of incoming ink-and-pencil shapes by typing the words above them. Every correct keystroke fires a graphite dart; typos build up a **Smudge** meter that blots and reinforces your enemies.

Across a tight **5-minute, 3-stage boss run**, you draft passive upgrades and flashy **`!` Glyph Abilities / Weapons** powered by a shared charge pool, accompanied by a multi-section adaptive soundtrack that rises from calm studio focus to high-tempo urgency.

* **Genre:** 2D Arcade Typing / Center-Defense Roguelike
* **Session Length:** ~5 minutes per full 3-stage run
* **Platform:** Browser-based HTML5 (Static site — Desktop keyboard-first + Auto-detected Mobile portrait UI)
* **Visual Theme:** Paper, pencil, graphite, crimson ink accents, and minimalist geometry

---

## 2. Core Gameplay Loop

```
[Stage Wave (1:15)] ──► [XP Level-Up Draft (1 of 3)] ──► [Stage Boss (~0:25–0:30)]
         ▲                                                           │
         └─────────────── [Boss Upgrade Draft] ◄─────────────────────┘
                                                                     │
                                            (After Stage 3 Boss) ────▼
                                            [Victory / Run Summary]
```

1. **Defend the Center:** Enemies spawn from the arena perimeter and converge on your central glyph (`300 / 300` base HP).
2. **Type to Shoot:** Typing the first letter of an enemy's word locks onto the closest matching enemy. Each correct letter fires a fast graphite dart with radial knockback; finishing the word shatters the enemy (or strips one `²` armor layer).
3. **Manage Smudge:** Typos trigger a tactile scratch/clunk and fill the **Smudge Bar**, punishing sloppy bursts with reinforced `²` enemies.
4. **Spend Shared Charge on `!` Abilities & Weapons:** Completing words builds a shared **100-point (4-pip) Charge Pool** spent on active `!` commands (desktop) or touch-tap buttons (mobile).
5. **Draft & Adapt:** Leveling up and defeating bosses presents 3 randomized cards (including rare healing options). No free between-stage heals.
6. **Beat 3 Bosses:** Survive 3 escalating stages and defeat each geometric boss via its scrolling passage ticker while juggling minions.

---

## 3. Controls, Readability & Difficulty

### Typography Color Standard (Strictly Grey + Red)
To eliminate any ambiguity between typed and untyped letters:
* **Untyped letters:** Muted pencil grey (`#8C8984`) across all enemy words, Boss passage tickers, draft card keywords, and `start`/`retry` prompts.
* **Typed letters:** Crisp crimson red (`#B83A3A`).
* Locked enemies are distinguished by a pulsing crimson targeting reticle + crosshair around their geometric body, a crimson-bordered word pill with target pointer, an animated crimson dashed sightline from the center glyph, and dimmed unfocused words—never by changing untyped text to black.
* Locked Bosses are distinguished by a `● TARGETING` header, pulsing crimson reticle around the Boss emblem, a crimson-bordered passage ticker, and dimmed minion labels; when targeting a minion, the Boss ticker dims and switches to a muted grey cursor.

### Desktop (Pure Keyboard)
* **`A–Z`:** Lock onto closest matching enemy (or advance locked word / Boss passage). Boss passages auto-skip spaces when typing the next letter.
* **`Space`:** Immediately **detarget / unlock** the current enemy, unlock the Boss, exit `!` Glyph Cast Mode, or cancel a locked draft card. (Backspace is disabled.)
* **`!` (`Shift + 1`):** Enter **Glyph Cast Mode** (cancels active enemy/boss lock) and type an equipped command (e.g., `!pulse`, `!swarm`, `!orbit`, `!drone`).
* **Typing Upgrade Cards:** During draft pauses, each of the 3 cards has a short keyword with guaranteed unique starting letters—simply type the keyword to draft it (clicking also works).
* **`←` / `→` (Title Screen):** Adjust Difficulty Slider.
* **`Esc`:** Pause / resume run.

### Mobile (Auto-Detected Portrait Split-Screen)
Automatically activates when `(pointer: coarse)` matches or viewport width `< 768px`. A top-right **`[Mobile UI]` / `[Desktop UI]`** toggle is also available for previewing on desktop.
* **Portrait Split-Screen Layout:**
  * **Top Arena:** Center glyph and enemy spawns shift cleanly into the upper playfield above the controls. Enemy word labels are clamped inside left/right screen margins so nothing clips on narrow screens.
  * **Middle Strip:** 4-pip Shared Charge Bar + **5 thumb-friendly touch-tap Ability Buttons** (no `!` prefix required).
  * **Bottom Tray — Custom In-Game QWERTY Keyboard (`src/ui/mobileKeyboard.ts`):** Canvas-rendered paper-and-pencil keyboard (zero OS keyboard, zero autocomplete/autocorrect, zero viewport resize jank, **100% pure with no next-letter highlight hints**). Fires on **`pointerdown`** with multi-touch support (`touch-action: none`), crimson press flash, subtle haptic buzz (`navigator.vibrate`), clean `Z–M` bottom letter row (no Backspace key), and a wide **`SPACE · UNLOCK TARGET`** thumb bar that highlights in crimson when a target is locked.
* **Automatic Mobile Ergonomic Balance Tuning:**
  * Arena-proportional enemy speed (`0.38×–0.56×` based on portrait arena radius so travel time matches desktop), gentler spawn cadence (`× 0.64`), lower active enemy cap (`9`), anti-clumping perimeter spawn spacing, staggered Boss minion waves, and `+20%` per-letter knockback boost.
  * Shorter-word bias (78% `SHORT_WORDS` even on medium/heavy enemies).
  * Smudge forgiveness: `+20%` per typo (5 typos to proc instead of 4).
* **Mobile Menus:** `TAP TO START` / `PLAY AGAIN` buttons, top-right `Pause` button, touchable Difficulty Slider, and **3 vertically stacked tappable upgrade cards**.

### Difficulty Slider (Title Screen)
Persisted in `localStorage` (`typingglyph_difficulty`), adjustable via `←`/`→` or click/tap:
| Preset | Speed | Spawn Rate | Damage | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Relaxed** | `0.65×` | `0.72×` | `0.70×` | Chill studio pace |
| **Standard** *(Default)* | `0.85×` | `0.88×` | `0.85×` | Balanced 3-boss roguelike challenge |
| **Challenging** | `1.00×` | `1.02×` | `1.00×` | Brisk waves & sharp reflexes |
| **Master** | `1.22×` | `1.20×` | `1.20×` | Relentless ink swarms |

---

## 4. Combat Mechanics & Active Weapons

### 4.1 Per-Letter Shots & Knockback
* Every correct keystroke fires a tapered graphite dart from the center glyph with light radial knockback, target hit-scale pop, and center glyph recoil.
* Completing a word triggers a **Death Boom** (core flash disc, calligraphic starburst rays, expanding rotating wireframe polygon matching the enemy's shape, crimson + graphite shards, lingering fading ink stain on the paper, and deep sub-boom audio).
* **Armored Enemies (`²`):** Boxed word with `²` superscript; finishing the word cracks 1 layer and assigns a fresh word.

### 4.2 The Smudge Mechanic (Typo Penalty)
* Each typo plays a graphite scratch/clunk, shakes the enemy word, and adds **+25% Smudge** (desktop) or **+20% Smudge** (mobile).
* Typing cleanly dries the Smudge Bar smoothly over time (`9%/sec` after a `0.85s` delay).
* At **100%**, Smudge resets and primes (`SMUDGE PRIMED`): the **next enemy you lock onto** is immediately ink-blotted with an extra `²` armor layer.

### 4.3 Shared Charge Pool & `!` Special Abilities (10 Total)
Powered by a **100-point (4-pip)** shared charge pool filled by completing words. Players start with `!pulse` and can hold up to **5 active abilities** in the bottom loadout slots (early drafts guarantee at least 1 active ability card while slots are open):

| Ability | Command | Cost | Effect |
| :--- | :--- | :---: | :--- |
| **Pulse** *(Starter)* | `!pulse` | 25 | Double drafting-compass shockwave knocking back nearby foes. |
| **Blot** | `!blot` | 25 | Clears Smudge Bar & blasts the nearest enemy with an ink bolt. |
| **Still** | `!still` | 50 | Blueprint-grid slow overlay reducing enemy speed by 65% for 4.5s. |
| **Ward** | `!ward` | 50 | Rotating dashed crimson barrier blocking the next 2 hits (stacks to 4). |
| **Lance** | `!lance` | 50 | Full-screen piercing ruler-line beam through the closest enemy. |
| **Swarm** *(Weapon)* | `!swarm` | 50 | Launches **6 curving homing calligraphy ink darts** across the page. |
| **Drone** *(Weapon)* | `!drone` | 50 | Deploys **2 origami paper-plane hunter drones** that auto-zap foes for 8s. |
| **Nova** | `!nova` | 75 | Expanding crimson ink ring stripping 1 layer from all nearby foes. |
| **Orbit** *(Weapon)* | `!orbit` | 75 | **Dual spinning pencil lasers** sweeping the arena for 4.5s. |
| **Mend** *(Rare Heal)* | `!mend` | 75 | Restores 55 HP to the center glyph. |

### 4.4 Passive & Survival Upgrades
* **Passives:** `Sharp Lead` (+45% knockback), `Chain Sketch` (word finish strikes 2 letters off a nearby foe), `Ink Flow` (+40% charge gain), `Auto-Compass` (every 3rd word fires a free dart at closest foe), `Charcoal Burst` (Smudged enemies explode on death).
* **Survival (Random Pool — No Free Stage Heals):** `Fresh Sheet` (+60 Max HP & heal 60), `Vampiric Nib` (heal 4 HP per word when < 50% HP), `Blotter Paper` (-35% Smudge gain & +60% faster drying).

---

## 5. Run Pacing, Enemies & 3 Geometric Bosses

### 5-Minute 3-Stage Structure
* **Stage 1: Sketch** (`1:15` wave) → **Boss 1: The Compass** → Boss Draft
* **Stage 2: Crosshatch** (`1:15` wave) → **Boss 2: The Eraser** → Boss Draft
* **Stage 3: Calligraphy** (`1:15` wave) → **Boss 3: The Architect** → Victory Screen
* Plus XP level-up drafts naturally triggered during waves (~5 total drafts per run).

### 5 Enemy Archetypes
1. **Dot:** Fast crimson dot, short 3–4 letter word, 15 dmg.
2. **Ring:** Concentric crimson circle, medium word, 20 dmg.
3. **Arrow:** High-speed crimson chevron, short word, 20 dmg.
4. **Pentagon (`²`):** Slow armored pentagon, boxed word requiring 2 words, 35 dmg.
5. **Diamond (Splitter):** Double-lined diamond; splits into 2 fast Dots on death, 25 dmg.

### 3 Geometric Bosses (Scrolling Horizontal Passage Ticker)
* **Boss 1 — The Compass:** Eye-and-arc sigil; draws drafting arcs and spawns synchronized rings of 4 Dots.
* **Boss 2 — The Eraser:** Oblique monolith; sweeps an animated **Erase Wave** down the page that briefly fades 1–2 letters on active minion words, plus **Hesitation Smudge** if the player stops typing for > 2.2s.
* **Boss 3 — The Architect:** Rotating polyhedron-eye; **Phase 1** spawns Arrow wedges + Diamond splitters; **Phase 2 (50% HP)** draws a pulsing crimson drafting margin frame around the screen, deploys `²` Pentagon guards, and peaks the music intensity.

---

## 6. Audio Direction (Implemented — Web Audio API)

* **Adaptive Multi-Section Soundtrack (`src/audio/music.ts`):**
  * 16-bar, 4-section evolving composition: **Section A (Verse: Dm9→Bbmaj7→Fmaj7→C)**, **Section A' (Turnaround: Dm7→Am7→Bbmaj7→A7)**, **Section B (Lift/Chorus: Bbmaj7→C→Dm→Fmaj7)**, and **Section C (Dramatic Bridge: Gm7→Dm/F→Ebmaj7→A7)**.
  * Uses a `DynamicsCompressor`, warm chord pads, echo-delayed lead melody, driving saw+sub bass, punchy kick/snare/hat grooves, and **4th-bar tom/snare fills** between sections.
  * Escalates dynamically in layers and tempo (`88 → 98 → 110 → 120 → 130 BPM`) across Title → Stage 1 → Boss 1/Stage 2 → Boss 2/Stage 3 → Final Boss, and smoothly muffles via low-pass filter on Draft and Pause screens.
* **Procedural Foley (`src/audio/sound.ts`):** Pencil-tap keystrokes with noise transient + streak pitch climb, deep sub-boom + chime word kills, armor cracks, typo scratch/clunk, Smudge thud, ability chords, and Boss/Victory fanfares.

---

## 7. Architecture & Current Codebase Map

* **Stack:** TypeScript + Vite + HTML5 Canvas 2D (high-DPI) + Web Audio API (zero external audio/image assets; builds to static `dist/`).
* **Files Implemented:**
  * `index.html`, `src/style.css`, `src/main.ts` — Fullscreen high-DPI canvas shell (`touch-action: none`).
  * `src/game/types.ts` — All entity, boss, ability, weapon, difficulty, and VFX interfaces.
  * `src/game/game.ts` — Core loop, input (keyboard + multi-touch `pointerdown`), 3-stage wave/boss director, typing draft system, Smudge, all 10 abilities/weapons, desktop & mobile renderers.
  * `src/ui/mobileKeyboard.ts` — Custom Canvas paper-and-pencil QWERTY keyboard + touch-tap ability bar.
  * `src/data/words.ts` — Curated short/medium word pools with starting-letter collision avoidance.
  * `src/data/content.ts` — Difficulty presets, all 10 `!` abilities, 17 upgrade cards, and 3 boss passage configs.
  * `src/audio/music.ts` & `src/audio/sound.ts` — Multi-section adaptive soundtrack & procedural foley.
  * `start.bat` — One-click Windows local dev launcher (`npm run dev -- --open`).
  * `.github/workflows/deploy.yml` & `vite.config.ts` (`base: './'`) — Automated GitHub Pages deployment on push to `main`.

---

## 8. Roadmap — Next Up (For Handoff)

### Completed
- [x] Core typing prototype (parchment canvas, per-letter darts, knockback, grey/red readability, `Space`/`Backspace` detarget)
- [x] Smudge Bar & `²` reinforcement mechanic
- [x] Shared 100-point charge pool + 10 `!` abilities including flashy weapons (`!swarm`, `!orbit`, `!drone`)
- [x] 3-stage 5-minute roguelike loop, all 5 enemy archetypes, typing-to-select upgrade cards, and all 3 geometric bosses
- [x] Multi-section adaptive Web Audio soundtrack + punchy death-boom VFX/foley
- [x] Title Screen Difficulty Slider (`localStorage` persisted)
- [x] Auto-detected Mobile portrait UI (custom pure QWERTY keyboard, touch ability bar, vertical draft cards, mobile balance tuning)
- [x] GitHub repo (`TypingGlyph2`) & automated GitHub Pages deployment

### Remaining / Future Enhancements
- [ ] **Meta-Progression & Cosmetics (`localStorage`):**
  - Persistent personal bests (High Score, Best WPM, Peak Accuracy, Fastest 3-Stage Clear, Total Words).
  - Graphite Points currency earned per run to unlock cosmetic **Paper Themes** (*Warm Parchment*, *Dot Journal*, *Blueprint*, *Charcoal Night*) and **Center Glyph Skins** (Concentric, Hexagon, Astrolabe, Diamond).
- [ ] **Real-Device Mobile Playtest Polish:** Tune iOS Safari / Android safe-area padding, key hitboxes, or Boss ticker sizing based on hands-on phone feedback.
- [ ] **Content Expansion:** Additional boss passage variety, more weapon/passive synergies, and endless post-Stage-3 mode option.
