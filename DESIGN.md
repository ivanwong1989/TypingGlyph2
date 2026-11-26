# TypingGlyph — Game Design Document

## 1. High Concept

**TypingGlyph** is a 2D minimalist center-defense typing roguelike set on a warm sheet of drafting paper. You control a geometric glyph at the center of the screen, defending against waves of incoming ink-and-pencil shapes by typing the words above them. Every correct keystroke fires a graphite dart; typos build up a **Smudge** meter that blots and reinforces your enemies.

Across a tight **5-minute, 3-stage boss run**, you draft passive upgrades and special **`!` Glyph Abilities** powered by a shared charge pool, navigating an adaptive soundscape that rises from meditative sketching to high-tempo urgency.

* **Genre:** 2D Arcade Typing / Center-Defense Roguelike
* **Session Length:** ~5 minutes per full 3-stage run
* **Platform:** Browser-based HTML5 (Desktop keyboard-first; Mobile responsive with touch-tap ability buttons)
* **Visual Theme:** Paper, pencil, graphite, crimson ink accents, and minimalist geometry

---

## 2. Core Gameplay Loop

```
[Stage Wave (~1:15)] ──► [XP Level-Up Draft (1 of 3)] ──► [Stage Boss (~0:25–0:30)]
         ▲                                                           │
         └─────────────── [Boss Upgrade Draft] ◄─────────────────────┘
                                                                     │
                                            (After Stage 3 Boss) ────▼
                                            [Run Summary & Meta-Unlocks]
```

1. **Defend the Center:** Enemies spawn from the edges of the page and converge on your central glyph (`300 / 300` HP).
2. **Type to Shoot:** Typing the first letter of an enemy's word locks onto the closest matching enemy. Each subsequent correct letter fires a fast graphite dart with slight knockback; finishing the word destroys the enemy (or strips one armor layer).
3. **Manage Smudge:** Typos trigger a tactile clunk and fill the **Smudge Bar**, punishing sloppy bursts with reinforced enemies.
4. **Spend Shared Charge on `!` Abilities:** Completing words builds a shared **Flow/Graphite Charge** pool. Spend it on drafted `!` abilities to clear swarms, slow time, shield, or mend.
5. **Draft & Adapt:** Leveling up and defeating bosses lets you choose 1 of 3 randomized upgrades/abilities (including rare healing options), shaping a distinct build within 5 minutes.
6. **Beat 3 Bosses:** Survive 3 escalating stages and defeat each geometric boss via its scrolling incantation passage while juggling minions.

---

## 3. Controls & Input Ergonomics

### Desktop (Pure Keyboard)
Hands never need to leave the home row:
* **`A–Z`:** Lock onto the closest enemy starting with that letter (if unlocked), or advance the currently locked word/boss passage.
* **`Backspace`:** Immediately **detarget** (cancel lock-on) to pivot to a higher-priority enemy.
* **`!` (`Shift + 1`):** Enter **Glyph Cast Mode** (cancels any active enemy lock). Follow with an equipped ability keyword (e.g., `!nova`, `!ward`) to trigger it. Pressing `Backspace` exits Glyph Cast Mode.
* **Typing Upgrade Cards:** During draft pauses, each of the 3 upgrade cards displays a short keyword/name (guaranteed unique starting letters); simply **type the card's word** to select it (`Backspace` cancels if you change your mind mid-word), keeping the entire experience 100% pure typing.
* **`Esc`:** Pause / resume run.

### Mobile (Responsive Browser)
* **Custom In-Game Keyboard:** Renders a dedicated minimalist, paper-and-pencil QWERTY keyboard directly inside the game UI instead of invoking the native OS keyboard—eliminating autocomplete/autocorrect cheating, preventing viewport resize jank, and keeping the visual aesthetic intact.
* **Integrated `Backspace` Key:** Built into the custom keyboard for instant detargeting.
* **Special Abilities:** Surfaced as **touch-tap buttons** in a compact bar directly above the custom keyboard (bypassing the need for `!` on mobile), showing each ability's charge cost and ready state.
* **Upgrade Drafting:** Cards can be tapped directly (or typed on the custom keyboard).

### Targeting & Word-Spawning Rules
* **No Starting-Letter Collisions (Soft Rule):** The spawner avoids spawning a new enemy whose starting letter matches an already-active enemy whenever possible (up to 26 active enemies). If collisions occur in dense waves, locking prioritizes the **closest enemy to the center**.
* **Word Dictionary:** Clean, lowercase English words curated by length and typing comfort:
  * **Short (3–4 letters):** Swarmers & fast shapes (`dot`, `arc`, `vile`, `jibs`, `park`, `pill`)
  * **Medium (5–7 letters):** Standard units (`share`, `prism`, `sketch`, `vector`)
  * **Long (8–11 letters):** Elites & heavy units (`parallel`, `symmetry`, `graphite`)

---

## 4. Combat Mechanics

### 4.1 Per-Letter Shots & Knockback
* Every correct keystroke fires a thin pencil-stroke projectile from the center glyph to the locked enemy.
* Each hit deals chip impact with a **tiny radial knockback**, giving immediate physical feedback and rewarding high WPM.
* Completing the final letter executes the enemy (shattering it into geometric pencil shavings/dots) and grants **XP** and **Ability Charge**.
* **Armored Enemies (`²`):** Displayed with a thin rectangular box around their word and a `²` superscript. Completing their word cracks the box, deals heavy knockback, and assigns a fresh word to finish them.

### 4.2 The Smudge Mechanic (Typo Penalty)
* **Feedback:** Each wrong keystroke plays a crisp pencil-scratch/clunk sound, briefly shakes the locked word, and leaves a faint graphite smudge visual.
* **Smudge Bar:** A subtle graphite meter sits near the center glyph.
  * Each typo adds **+25% Smudge** (tunable).
  * Typing cleanly causes the Smudge Bar to **dry/drain smoothly over time** (~8%/sec after a 0.8s grace delay).
* **Smudge Proc (at 100%):**
  * The bar flashes crimson/charcoal and resets to 0%.
  * A **Smudge Charge** primes on your glyph: the **next enemy you lock onto** is immediately blotted with an ink-smudge shield, gaining an extra `²` layer (requiring an additional word to destroy).
* **Roguelike Synergies:** Certain upgrades can interact with Smudge (e.g., *Blotter Paper* slows Smudge buildup; *Charcoal Burst* causes Smudged enemies to explode on death, turning mistakes into risky AoE).

### 4.3 Shared Charge Pool & `!` Special Abilities
* **Shared Pool:** A **100-point Charge Pool** (visually segmented into **4 pips** of 25 charge each) displayed cleanly near the bottom loadout bar.
* **Generating Charge:** Completing enemy words grants charge (+6 to +15 depending on word length). High accuracy/streaks slightly boost charge gain.
* **Casting:** On desktop, type `!` + ability word (e.g., `!nova`). If you have enough charge, it fires immediately and deducts the cost. On mobile, tap the ability icon.

#### Starter & Draftable `!` Abilities
| Ability | Desktop Command | Cost | Effect |
| :--- | :--- | :--- | :--- |
| **Pulse** *(Starter)* | `!pulse` | 25 (1 pip) | Radial pencil-ring shockwave that knocks all nearby enemies back and interrupts charges. |
| **Nova** | `!nova` | 75 (3 pips) | Expanding crimson ink ring that strips 1 word/armor layer from all enemies within medium radius. |
| **Still** | `!still` | 50 (2 pips) | Slows all enemy movement by 65% for 4 seconds ("sketch freeze"). |
| **Lance** | `!lance` | 50 (2 pips) | Fires a piercing ruler-line beam through the closest enemy, destroying all enemies in that line. |
| **Ward** | `!ward` | 50 (2 pips) | Draws a rotating geometric barrier around your glyph that blocks the next 2 enemy hits (or 60 damage). |
| **Mend** *(Rare Draft)* | `!mend` | 75 (3 pips) | Restores 45 HP to the center glyph. *(Primary active healing option.)* |
| **Blot** | `!blot` | 25 (1 pip) | Instantly clears the Smudge Bar and converts remaining Smudge into a small burst of damage to the nearest enemy. |

---

## 5. Health, Damage & Roguelike Progression

### Ship Health & Recovery
* **Base HP:** `300 / 300` (displayed cleanly beneath the center glyph).
* **Damage:** Enemies deal contact damage on reaching the center (scaled by archetype, e.g., 15 for Swarmers, 35 for Heavies, 50 for Boss hazards) and are destroyed on impact.
* **No Free Stage Heals:** To preserve roguelike tension and luck, **HP does not automatically regenerate** between stages. Recovery comes exclusively from randomly offered upgrades (e.g., *Fresh Sheet*, *Vampiric Nib*) or drafting the `!mend` ability.

### Loadout Slots & Upgrade Drafting
* **5 Loadout Slots** along the bottom of the screen (matching the minimalist HUD): hold your drafted active `!` abilities and major passive glyphs.
* **Draft Timing (~5 picks per 5-minute run):**
  * **3 XP Level-Ups** triggered naturally during waves (1 per stage).
  * **2 Boss Clear Drafts** (after Stage 1 and Stage 2 bosses).
* Each draft pauses the action (softly dimming the page and easing the audio) and presents **3 randomized cards** (selected by **typing the card's keyword** on desktop, or tapping on mobile; the 3 offered cards always have distinct starting letters for clean lock-on):
  * **Active `!` Abilities** (unlock new commands or upgrade existing ones)
  * **Passive Modifiers** (e.g., *Sharp Lead*: +35% knockback per letter; *Chain Sketch*: finishing a word damages a nearby enemy's first 2 letters; *Flow State*: 15+ clean keystroke streak grants +40% charge gain; *Auto-Compass*: fires a free stray dart every 3 completed words)
  * **Survival / Utility (Random Pool):** *Fresh Sheet* (+60 Max HP & heal 60), *Vampiric Nib* (heal 2 HP per word finished while below 50% HP), *Blotter* (-35% Smudge gain), *Charcoal Burst* (Smudged enemies explode on death).

---

## 6. Run Pacing & Enemies (~5-Minute Structure)

| Phase | Target Time | Wave Focus | Audio Intensity |
| :--- | :--- | :--- | :--- |
| **Stage 1: Sketch** | `0:00 – 1:15` | Dots, Circles, first `²` Armored units | Calm ambient paper/plucked motif, gentle pulse |
| **Boss 1: The Compass** | `1:15 – 1:40` | Orbiting minion rings + Boss passage | Steady rhythmic percussion enters |
| **Stage 2: Crosshatch** | `1:40 – 2:55` | Arrows (fast), Pentagons (`²` armored), Splitters | Faster tempo, layered rhythmic synth/strings |
| **Boss 2: The Eraser** | `2:55 – 3:25` | Letter-fading waves + Smudge pressure + Boss passage | Tense syncopated pulse, sharp foley |
| **Stage 3: Calligraphy** | `3:25 – 4:30` | Mixed formations, high-speed swarms, heavy `²` guards | High urgency, driving beat |
| **Boss 3: The Architect** | `4:30 – 5:00` | Multi-phase finale passage + geometric guards | Peak crescendo → calm resolution on clear |

### Enemy Archetypes
* **Dot (Swarmer):** Small crimson dot. Short 3–4 letter words, steady speed, low contact damage (15).
* **Ring (Standard):** Concentric circle. Medium 5–6 letter words, moderate speed, 20 damage.
* **Arrow (Dart):** Sleek crimson chevron. Short 3–4 letter words, **high speed**, forces quick `Backspace` detargeting (20 damage).
* **Pentagon (Armored `²`):** Boxed word with `²` superscript. Slow, takes 2 full words to destroy, 35 damage.
* **Diamond (Splitter):** Double-lined diamond. Medium word; when destroyed, splits into 2 fast **Dots** with 3-letter words.

---

## 7. Boss Fights (3 Geometric Guardians)

All bosses manifest at the top-center of the page with a distinct geometric emblem, an HP/completion bar, and a **scrolling horizontal passage ticker** (with a vertical crimson cursor showing your current letter and `%` progress). Typing the current highlighted letter of the passage locks onto the boss—you can freely press `Backspace` to peel off incoming minions and then jump right back into the passage where you left off.

### Boss 1 — **The Compass** *(Stage 1)*
* **Visual:** An all-seeing geometric eye framed by drafting-compass arcs.
* **Passage:** Short, rhythmic literary/geometric aphorisms (~65–80 characters, e.g., *"to be, or not to be, that is the question of the line"*).
* **Mechanics:**
  * Periodically draws a faint circular pencil arc around the arena, spawning a synchronized ring of 4–5 **Dots** from the circumference.
  * Teaches the core boss skill: type bursts of the boss passage, press `Backspace` to clear encroaching Dots (or cast `!pulse`), then resume the passage.

### Boss 2 — **The Eraser** *(Stage 2)*
* **Visual:** A crisp, hovering oblique monolith with a subtle smudged aura.
* **Passage:** Medium passage (~95–110 characters) divided into 2 mini-phases.
* **Mechanics:**
  * **Erase Pulse:** Every ~8 seconds, a soft translucent rubber-wipe sweeps across the screen, temporarily **fading 1–2 letters** on active minion words for 1.5 seconds (requiring memory or quick clears before the wipe hits).
  * **Hesitation Smudge:** If the player stops typing for more than 2 seconds during the fight, the Smudge Bar creeps upward slowly—rewarding steady flow over panic.
  * Spawns **Arrows** and **Pentagons (`²`)**.

### Boss 3 — **The Architect** *(Stage 3 Final Boss)*
* **Visual:** An intricate rotating polyhedron-eye sigil that unfolds new geometric rings as its HP drops.
* **Passage:** Dramatic 2-phase incantation (~130–150 characters total).
* **Mechanics:**
  * **Phase 1 (100% → 50%):** Summons geometric formations (triangular wedges of **Arrows** + a **Diamond** splitter).
  * **Phase 2 (50% → 0%):** Tempo peaks! The Architect draws a faint shrinking margin frame around the page (visual urgency) and deploys a pair of `²` **Pentagon** bodyguards alongside fast **Dots**. Completing the final letter shatters the Architect into a cascade of drifting geometric lines and clears the page.

---

## 8. Visual & Audio Direction

### Visual Style (Paper, Pencil & Geometry)
* **Color Palette:**
  * **Background:** Warm off-white parchment (`#F2EFE9`) with subtle procedural paper grain and a soft warm-grey vignette (`#CFCBC2`).
  * **Primary Ink / Typography:** Graphite charcoal (`#2B2A29`) for typed/active letters; muted pencil grey (`#8C8984`) for untyped letters and UI frames.
  * **Danger / Accent:** Vermilion / red-pencil ink (`#B83A3A`) for enemy cores, active target cursors, damage flashes, and Smudge warnings.
* **Typography:** Clean geometric sans-serif (e.g., *Inter*, *DM Sans*, or *Space Grotesk*) with tabular numerals for HP/WPM and a crisp monospace option in settings.
* **Juicy Micro-Feedback:**
  * Subtle pencil-stroke trails behind per-letter darts.
  * Ink-ring ripples when completing a word.
  * Soft charcoal smudge texture that overlays the screen edges slightly as the Smudge Bar nears 100%.

### Adaptive Audio Design
* **Baseline Vibe:** Relaxing, tactile, and focused—like sketching in a quiet studio.
* **Dynamic Layering (Web Audio API):**
  * **Layer 1 (Stage 1):** Warm minimalist plucked/felt-piano arpeggio + subtle ambient paper room tone.
  * **Layer 2 (Stage 2 / Boss 1):** Soft brushed percussion and a gentle bass pulse join in; BPM subtly rises (+10%).
  * **Layer 3 (Stage 3 / Final Boss):** Driving minimalist rhythm, brighter harmonic tension, and faster pulse (+20% BPM).
  * **Draft Screen:** Low-pass filter sweeps smoothly over the music, creating a calm breath while you pick your upgrade.
* **Foley / SFX:**
  * Soft, varied mechanical/pencil-tap sounds per correct keystroke (pitch subtly ascends with combo).
  * Crisp paper-snip / chime on word completion.
  * Dull graphite scratch/clunk on typo; heavy ink-blot thud on Smudge proc.
  * Resonant tonal chord on `!` ability cast.

---

## 9. Meta-Progression & Cosmetics

Saved locally in `localStorage` to reward repeat 5-minute runs without breaking roguelike balance:

* **Run Summary & Personal Bests:** Tracks Highest Score, Best WPM, Peak Accuracy %, Total Words Typed, Fastest 3-Stage Clear, and Most Smudges Survived.
* **Graphite Points (Meta Currency):** Earned at the end of every run based on stages cleared, WPM, and accuracy.
* **Light Unlocks:**
  * **Expanded Ability Pool:** Unlock 2–3 extra `!` Glyph abilities (e.g., `!blot`, `!lance`, `!mend`) into the roguelike draft pool after early milestones.
  * **Paper & Palette Themes (Cosmetic):**
    * *Warm Parchment* (Default — cream paper, charcoal & crimson)
    * *Dot Journal* (Crisp ivory with subtle dot-grid)
    * *Blueprint* (Deep drafting blue, crisp white chalk lines & amber accents)
    * *Charcoal Night* (Dark mode — slate paper, off-white graphite & vermilion)
  * **Center Glyph Skins (Cosmetic):** Alternate minimalist geometric center rings (Concentric, Hexagon, Astrolabe, Diamond).

---

## 10. Technical Architecture (Browser HTML5)

A lightweight, zero-bloat web stack ensures instant load times and smooth 60fps rendering on both desktop and mobile browsers:

* **Stack:** TypeScript + Vite + HTML5 Canvas 2D (high-DPI `devicePixelRatio` scaling)
* **Audio:** Web Audio API (procedural/layered stem mixer + low-latency keystroke SFX)
* **State & Persistence:** Clean decoupled game loop (`fixed timestep update` + `interpolated Canvas render`) with `localStorage` for stats, unlocks, and selected cosmetics.
* **Proposed Module Structure:**
  * `src/engine/` — Game loop, Canvas renderer, camera shake, procedural paper grain, input manager (desktop keyboard + custom mobile QWERTY overlay)
  * `src/game/` — Entities (Player, Enemy, Projectile, Boss), Targeting & Word Manager, Smudge System, Ability System, Wave/Stage Director
  * `src/data/` — Word lists, Boss passages, Upgrade & Ability definitions, Palette themes
  * `src/audio/` — Web Audio adaptive music & procedural/sample foley engine
  * `src/ui/` — Minimalist HUD overlay, Custom Mobile Keyboard, Typing-Selectable Draft Card modal, Title / Run Summary / Unlocks screens

---

## 11. Development Milestones

1. **Milestone 1 — Core Typing Prototype:** Parchment canvas, center glyph, spawning Dots/Rings, letter lock-on, `Backspace` detargeting, per-letter projectiles + knockback, and basic HP/game over.
2. **Milestone 2 — Smudge, `!` Abilities & Mobile Keyboard:** Smudge Bar + `²` ink-blot proc, shared charge pool, `!` Glyph Cast mode (desktop), custom in-game mobile QWERTY keyboard + touch-tap ability bar, and initial abilities (`!pulse`, `!still`, `!nova`, `!ward`).
3. **Milestone 3 — 3-Stage Loop & Roguelike Draft:** 5-minute pacing, all 5 enemy archetypes, XP level-ups, typing-to-select 3-card upgrade draft UI, and 5-slot HUD.
4. **Milestone 4 — The 3 Bosses:** Scrolling passage ticker UI + *The Compass*, *The Eraser*, and *The Architect*.
5. **Milestone 5 — Audio, Polish & Meta-Progression:** Adaptive Web Audio layers + pencil/paper foley, run summary stats, `localStorage` unlocks, and cosmetic paper themes.
