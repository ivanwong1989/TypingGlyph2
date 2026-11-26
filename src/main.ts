import './style.css';
import { TypingGlyphGame } from './game/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Missing #game-canvas element');
}

const game = new TypingGlyphGame(canvas);
game.startLoop();
