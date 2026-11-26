/**
 * Multi-section procedural adaptive soundtrack (Web Audio API).
 * Cycles through 4 distinct 4-bar musical sections (16-bar full form):
 *   0: Section A  (Verse — Dm9 -> Bbmaj7 -> Fmaj7 -> C)
 *   1: Section A' (Turnaround — Dm9 -> Am7 -> Bbmaj7 -> A7)
 *   2: Section B  (Lift/Chorus — Bbmaj7 -> C -> Dm9 -> F -> Gm7 -> Am7 -> Bb -> C)
 *   3: Section C  (Bridge — Gm9 -> Dm/F -> Ebmaj7 -> A7)
 * Each section has its own chord voicings, bass contour, arpeggio pattern,
 * expressive lead melody, counter-harmony, and 4th-bar drum fills.
 */

interface ChordStep {
  bass: number;
  pad: number[];
  arp: number[]; // 4-note chord tone pool for arpeggiation
}

interface SongSection {
  chords: ChordStep[]; // 4 bars
  lead: Array<number | null>; // 64 16th-steps (4 bars) in MIDI-like note freq, or null for rest
  arpOrder: number[]; // 16-step index order into chord.arp
  bassRhythm: number[]; // step indices (0..15) for bass accent
}

// Helper: MIDI note number -> frequency in Hz
function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// Musical chord helper
function chord(bassMidi: number, padMidis: number[], arpMidis: number[]): ChordStep {
  return {
    bass: midi(bassMidi),
    pad: padMidis.map(midi),
    arp: arpMidis.map(midi),
  };
}

// Helper to build a 64-step sparse melody array from [stepIndex, midiNote] pairs
function buildMelody(events: Array<[number, number]>): Array<number | null> {
  const arr: Array<number | null> = new Array(64).fill(null);
  for (const [idx, note] of events) {
    if (idx >= 0 && idx < 64) arr[idx] = midi(note);
  }
  return arr;
}

const SECTIONS: SongSection[] = [
  // SECTION A: Contemplative Verse (Dm9 -> Bbmaj7 -> Fmaj7 -> Csus4)
  {
    chords: [
      chord(38, [50, 57, 60, 64], [62, 65, 69, 72]), // Dm9
      chord(34, [46, 53, 57, 62], [58, 62, 65, 69]), // Bbmaj7
      chord(41, [53, 57, 60, 64], [60, 65, 69, 72]), // Fmaj7
      chord(36, [48, 55, 60, 62], [60, 64, 67, 72]), // C(add9)
    ],
    arpOrder: [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 3, 1, 2, 3, 1, 0],
    bassRhythm: [0, 6, 8, 14],
    lead: buildMelody([
      [0, 74], [6, 72], [8, 69], [14, 67],
      [16, 65], [22, 69], [24, 70], [30, 69],
      [32, 69], [36, 72], [40, 76], [44, 74],
      [48, 72], [54, 67], [58, 69], [62, 72],
    ]),
  },

  // SECTION A': Rising Turnaround (Dm9 -> Am7 -> Bbmaj7 -> A7)
  {
    chords: [
      chord(38, [50, 57, 60, 65], [62, 65, 69, 74]), // Dm7
      chord(45, [52, 57, 60, 64], [60, 64, 69, 72]), // Am7
      chord(34, [46, 53, 57, 62], [62, 65, 70, 74]), // Bbmaj7
      chord(33, [45, 52, 55, 61], [61, 64, 69, 73]), // A7 (harmonic minor pull!)
    ],
    arpOrder: [0, 2, 1, 3, 2, 3, 1, 2, 0, 1, 3, 2, 3, 2, 1, 0],
    bassRhythm: [0, 4, 10, 14],
    lead: buildMelody([
      [0, 74], [4, 77], [8, 76], [12, 74],
      [16, 72], [20, 76], [24, 72], [28, 69],
      [32, 70], [38, 74], [42, 77], [46, 76],
      [48, 73], [52, 76], [56, 73], [60, 69], [62, 73],
    ]),
  },

  // SECTION B: Driving Lift / Chorus (Bbmaj7 -> C -> Dm9 -> Fmaj7)
  {
    chords: [
      chord(34, [46, 53, 58, 62], [62, 65, 70, 74]), // Bbmaj7
      chord(36, [48, 55, 60, 64], [64, 67, 72, 76]), // C
      chord(38, [50, 57, 62, 65], [65, 69, 74, 77]), // Dm
      chord(41, [53, 57, 60, 64], [64, 69, 72, 76]), // Fmaj7
    ],
    arpOrder: [0, 1, 2, 3, 3, 2, 1, 2, 0, 2, 3, 2, 1, 3, 2, 1],
    bassRhythm: [0, 3, 6, 8, 11, 14],
    lead: buildMelody([
      [0, 77], [3, 74], [6, 70], [8, 74], [12, 77],
      [16, 79], [20, 76], [24, 72], [28, 76], [30, 79],
      [32, 81], [36, 77], [40, 74], [44, 77],
      [48, 76], [52, 72], [56, 74], [60, 72], [62, 69],
    ]),
  },

  // SECTION C: Dramatic Bridge (Gm9 -> Dm/F -> Ebmaj7 -> A7)
  {
    chords: [
      chord(43, [50, 55, 58, 62], [62, 67, 70, 74]), // Gm7
      chord(41, [50, 53, 57, 62], [62, 65, 69, 74]), // Dm/F
      chord(39, [51, 55, 58, 62], [63, 67, 70, 74]), // Ebmaj7 (Neapolitan color!)
      chord(33, [45, 52, 57, 61], [61, 64, 67, 73]), // A7 tension
    ],
    arpOrder: [3, 2, 1, 0, 2, 1, 3, 2, 3, 1, 2, 0, 1, 2, 3, 2],
    bassRhythm: [0, 6, 8, 12, 14],
    lead: buildMelody([
      [0, 74], [6, 70], [10, 74], [14, 77],
      [16, 74], [22, 69], [26, 72], [30, 74],
      [32, 75], [38, 74], [42, 70], [46, 67],
      [48, 69], [52, 73], [56, 76], [60, 79], [62, 76],
    ]),
  },
];

export class AdaptiveMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;

  private isPlaying = false;
  private muted = false;
  private muffled = false;
  private intensity = 0; // 0 = title/calm, 1 = stage 1, 2 = boss1/stage2, 3 = boss2/stage3, 4 = final boss
  private step = 0; // 0..255 (16 bars of 16th notes)
  private timerId: number | null = null;
  private nextNoteTime = 0;

  public start(): void {
    if (this.isPlaying) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.isPlaying = true;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.scheduleLoop();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.08);
    }
  }

  public setIntensity(level: number): void {
    this.intensity = Math.max(0, Math.min(4, level));
  }

  public setMuffled(muffled: boolean): void {
    this.muffled = muffled;
    if (this.filterNode && this.ctx) {
      const targetFreq = muffled ? 460 : 3800 + this.intensity * 900;
      this.filterNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.18);
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.15;

      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 4200;

      // Dotted-eighth-style atmospheric echo bus
      this.delayNode = this.ctx.createDelay(0.6);
      this.delayNode.delayTime.value = 0.27;
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.value = 0.28;
      const delayFilter = this.ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 1800;

      this.delayNode.connect(delayFilter);
      delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      delayFilter.connect(this.filterNode);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.42;

      this.filterNode.connect(compressor);
      compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private getBpm(): number {
    const bpms = [88, 98, 110, 120, 130];
    return bpms[Math.round(this.intensity)] ?? 98;
  }

  private scheduleLoop(): void {
    if (this.timerId !== null) window.clearInterval(this.timerId);
    this.timerId = window.setInterval(() => {
      if (!this.isPlaying || !this.ctx) return;
      const lookahead = 0.12;
      while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
        this.scheduleStep(this.step, this.nextNoteTime);
        const secondsPer16th = 60 / this.getBpm() / 4;
        this.nextNoteTime += secondsPer16th;
        this.step = (this.step + 1) % 256; // 16-bar full cycle across all 4 sections
      }
    }, 30);
  }

  private scheduleStep(globalStep: number, time: number): void {
    if (!this.ctx || !this.filterNode || this.muted) return;

    if (!this.muffled) {
      this.filterNode.frequency.setTargetAtTime(3400 + this.intensity * 1000, time, 0.25);
    }

    const sectionIdx = Math.floor(globalStep / 64) % SECTIONS.length;
    const section = SECTIONS[sectionIdx];
    const stepInSection = globalStep % 64;
    const barInSection = Math.floor(stepInSection / 16);
    const stepInBar = stepInSection % 16;
    const chordStep = section.chords[barInSection];
    const secPerBar = (60 / this.getBpm()) * 4;
    const isFillBar = barInSection === 3 && stepInBar >= 12;

    // 1. Warm evolving chord pad on beat 1 of each bar
    if (stepInBar === 0) {
      chordStep.pad.forEach((freq, i) => {
        this.playPadTone(freq, time, secPerBar * 0.96, i === 0 ? 0.1 : 0.06);
      });
    }

    // 2. Section-specific bass groove
    if (this.intensity >= 1) {
      const bassHit =
        this.intensity === 1
          ? stepInBar === 0 || stepInBar === 8
          : this.intensity === 2
            ? section.bassRhythm.includes(stepInBar)
            : stepInBar % 2 === 0 || (isFillBar && stepInBar === 15);

      if (bassHit) {
        const octaveJump = stepInBar === 14 || (this.intensity >= 3 && stepInBar % 4 === 2);
        this.playWarmBass(
          chordStep.bass * (octaveJump ? 2 : 1),
          time,
          this.intensity >= 3 ? 0.17 : 0.32,
          0.27
        );
      }
    }

    // 3. Chord-following arpeggio (humanized dynamics)
    const playArp =
      this.intensity === 0
        ? stepInBar % 4 === 0
        : this.intensity === 1
          ? stepInBar % 2 === 0
          : this.intensity === 2
            ? stepInBar % 2 === 0 || stepInBar === 11
            : true;

    if (playArp) {
      const arpToneIdx = section.arpOrder[stepInBar];
      const freq = chordStep.arp[arpToneIdx % chordStep.arp.length];
      const accent = stepInBar % 4 === 0 ? 1.15 : stepInBar % 2 === 0 ? 0.95 : 0.72;
      this.playPluck(freq, time, 0.105 * accent, true);
    }

    // 4. Expressive section lead melody + occasional high harmony in Section B & Bosses
    if (this.intensity >= 1) {
      const leadFreq = section.lead[stepInSection];
      if (leadFreq !== null) {
        const dur = stepInBar % 4 === 0 ? 0.44 : 0.28;
        this.playLeadTone(leadFreq, time, dur, 0.115 + this.intensity * 0.01);

        // Add gentle octave/fifth sparkle in Chorus (Section B) or Final Boss
        if ((sectionIdx === 2 && this.intensity >= 2) || this.intensity >= 4) {
          this.playPluck(leadFreq * 0.5, time, 0.06, false);
        }
      }
    }

    // 5. Percussion with 4th-bar transitional drum fills
    if (this.intensity >= 1) {
      if (isFillBar && this.intensity >= 2) {
        // Crisp 4th-bar turnaround fill leading into the next section!
        if (stepInBar === 12 || stepInBar === 14) {
          this.playSnareBrush(time, 0.16);
        } else if (stepInBar === 13 || stepInBar === 15) {
          this.playTomHit(stepInBar === 13 ? 165 : 125, time, 0.22);
        }
      } else {
        const kickHit =
          this.intensity === 1
            ? stepInBar === 0 || stepInBar === 10
            : this.intensity === 2
              ? stepInBar === 0 || stepInBar === 8 || (barInSection % 2 === 1 && stepInBar === 14)
              : stepInBar === 0 || stepInBar === 6 || stepInBar === 8 || stepInBar === 14;

        if (kickHit) {
          this.playPunchyKick(time, this.intensity === 1 ? 0.24 : 0.35);
        }

        if (stepInBar === 4 || stepInBar === 12) {
          this.playSnareBrush(time, this.intensity === 1 ? 0.08 : 0.165);
        }
      }

      // Humanized hi-hat groove
      if (this.intensity >= 2 && stepInBar % 2 === 0) {
        const hatVol = stepInBar % 4 === 2 ? 0.072 : 0.038;
        this.playHiHat(time, hatVol);
      } else if (this.intensity >= 3 && stepInBar % 2 === 1) {
        this.playHiHat(time, 0.03);
      }
    }
  }

  private playPluck(freq: number, time: number, volume: number, sendDelay = false): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + 0.34);

    osc.connect(gain);
    gain.connect(this.filterNode);
    if (sendDelay && this.delayNode) gain.connect(this.delayNode);
    osc.start(time);
    osc.stop(time + 0.36);
  }

  private playLeadTone(freq: number, time: number, duration: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.003, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.2, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.35, time + duration);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.filterNode);
    if (this.delayNode) gain.connect(this.delayNode);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.04);
    osc2.stop(time + duration + 0.04);
  }

  private playPadTone(freq: number, time: number, duration: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc.connect(gain);
    gain.connect(this.filterNode);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private playWarmBass(freq: number, time: number, duration: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const sub = this.ctx.createOscillator();
    const body = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    sub.type = 'sine';
    body.type = 'sawtooth';
    sub.frequency.setValueAtTime(freq, time);
    body.frequency.setValueAtTime(freq, time);

    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, time);
    lp.frequency.exponentialRampToValueAtTime(140, time + duration);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    sub.connect(gain);
    body.connect(lp);
    lp.connect(gain);
    gain.connect(this.filterNode);

    sub.start(time);
    body.start(time);
    sub.stop(time + duration + 0.04);
    body.stop(time + duration + 0.04);
  }

  private playPunchyKick(time: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.12);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.filterNode);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private playTomHit(freq: number, time: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, time + 0.11);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);

    osc.connect(gain);
    gain.connect(this.filterNode);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private playSnareBrush(time: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const duration = 0.095;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1750;
    bp.Q.value = 0.9;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(bp);
    bp.connect(gain);
    gain.connect(this.filterNode);
    noise.start(time);

    const body = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(195, time);
    body.frequency.exponentialRampToValueAtTime(110, time + 0.06);
    bodyGain.gain.setValueAtTime(volume * 0.6, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.065);
    body.connect(bodyGain);
    bodyGain.connect(this.filterNode);
    body.start(time);
    body.stop(time + 0.07);
  }

  private playHiHat(time: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const duration = 0.032;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(hp);
    hp.connect(gain);
    gain.connect(this.filterNode);
    noise.start(time);
  }
}
