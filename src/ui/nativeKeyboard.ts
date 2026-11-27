export interface NativeKeyboardCallbacks {
  onLetter: (letter: string) => void;
  onUnlock: () => void;
}

/**
 * Manages a visually hidden <input type="text"> to bridge the device's Native OS Keyboard
 * (iOS Safari, Android Gboard / Samsung IME) into TypingGlyph without zoom or double-firing.
 */
export class NativeKeyboardController {
  private input: HTMLInputElement;
  private callbacks: NativeKeyboardCallbacks;
  private isComposing = false;
  private lastProcessedValue = '';

  constructor(callbacks: NativeKeyboardCallbacks) {
    this.callbacks = callbacks;

    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.spellcheck = false;
    input.setAttribute('inputmode', 'text');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-label', 'TypingGlyph keyboard input');

    // Visually hidden, 16px font-size prevents iOS Safari auto-zoom on focus
    Object.assign(input.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '1px',
      height: '1px',
      opacity: '0.001',
      fontSize: '16px',
      pointerEvents: 'none',
      border: '0',
      padding: '0',
      margin: '0',
      outline: 'none',
      background: 'transparent',
      color: 'transparent',
      caretColor: 'transparent',
    });

    input.addEventListener('compositionstart', this.handleCompositionStart);
    input.addEventListener('compositionend', this.handleCompositionEnd);
    input.addEventListener('input', this.handleInput);
    input.addEventListener('blur', this.handleBlur);

    document.body.appendChild(input);
    this.input = input;
  }

  public focus(): void {
    if (document.activeElement === this.input) return;
    this.isComposing = false;
    this.lastProcessedValue = '';
    this.input.value = '';
    try {
      this.input.focus({ preventScroll: true });
    } catch {
      this.input.focus();
    }
  }

  public blur(): void {
    this.isComposing = false;
    this.lastProcessedValue = '';
    this.input.value = '';
    this.input.blur();
  }

  public isFocused(): boolean {
    return document.activeElement === this.input;
  }

  public destroy(): void {
    this.input.removeEventListener('compositionstart', this.handleCompositionStart);
    this.input.removeEventListener('compositionend', this.handleCompositionEnd);
    this.input.removeEventListener('input', this.handleInput);
    this.input.removeEventListener('blur', this.handleBlur);
    this.input.remove();
  }

  private handleCompositionStart = (): void => {
    this.isComposing = true;
    this.lastProcessedValue = this.input.value;
  };

  private handleCompositionEnd = (): void => {
    const val = this.input.value;
    this.isComposing = false;

    if (val.length > this.lastProcessedValue.length && val.startsWith(this.lastProcessedValue)) {
      this.emitCharacters(val.slice(this.lastProcessedValue.length));
    }

    this.input.value = '';
    this.lastProcessedValue = '';
  };

  private handleInput = (e: Event): void => {
    const val = this.input.value;
    const inputEvt = e as InputEvent;

    if (this.isComposing || inputEvt.isComposing) {
      if (val.startsWith(this.lastProcessedValue)) {
        const delta = val.slice(this.lastProcessedValue.length);
        if (delta.length > 0) {
          this.emitCharacters(delta);
        }
      } else if (val.length > this.lastProcessedValue.length) {
        this.emitCharacters(val.slice(this.lastProcessedValue.length));
      } else if (
        val.length === this.lastProcessedValue.length &&
        val !== this.lastProcessedValue &&
        typeof inputEvt.data === 'string' &&
        inputEvt.data.length === 1
      ) {
        this.emitCharacters(inputEvt.data);
      }
      this.lastProcessedValue = val;
      return;
    }

    // Non-composing (iOS Safari, hardware keyboard, or committed Android input)
    const delta = val.startsWith(this.lastProcessedValue)
      ? val.slice(this.lastProcessedValue.length)
      : val;

    if (delta.length > 0) {
      this.emitCharacters(delta);
    }

    // Immediately clear to prevent autocorrect/word suggestions from building up
    this.input.value = '';
    this.lastProcessedValue = '';
  };

  private handleBlur = (): void => {
    this.isComposing = false;
    this.lastProcessedValue = '';
    this.input.value = '';
  };

  private emitCharacters(text: string): void {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ') {
        this.callbacks.onUnlock();
      } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
        this.callbacks.onLetter(ch.toLowerCase());
      }
    }
  }
}
