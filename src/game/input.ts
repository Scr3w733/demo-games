import type { Bindings } from './types';

export interface Axis {
  x: number;
  y: number;
}

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
  down: boolean;
}

/**
 * Приводит физическую клавишу к тому же id, что хранится в настройках.
 * Ключевое отличие от event.key: код не меняется при переключении раскладки,
 * поэтому WASD продолжает работать, даже если включена кириллица.
 * Схема взята по принципу «code first, key fallback» из открытых движков.
 */
export function keyFromEvent(event: KeyboardEvent): string {
  const code = event.code;
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space' || code === 'Spacebar') return ' ';
  if (code === 'Escape' || code === 'Esc') return 'escape';
  if (code.startsWith('Arrow')) return code.toLowerCase();
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'control';
  if (code === 'AltLeft' || code === 'AltRight') return 'alt';
  if (code === 'Tab') return 'tab';
  if (code === 'Enter' || code === 'NumpadEnter') return 'enter';
  if (code.startsWith('Numpad')) return code.slice(6).toLowerCase();
  if (code.startsWith('F') && /^F\d+$/.test(code)) return code.toLowerCase();
  return event.key.toLowerCase();
}

export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly stick: Axis = { x: 0, y: 0 };
  private pointerId: number | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private pointerActive = false;
  private pointerDown = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = keyFromEvent(event);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(key)) event.preventDefault();
    if (!this.keys.has(key)) this.pressed.add(key);
    this.keys.add(key);
  };
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(keyFromEvent(event));
  };
  private readonly onBlur = (): void => {
    // Без полного сброса зажатая клавиша «залипает» после переключения окна
    // или клика по кнопке HUD, когда keyup приходит не в наше окно.
    this.reset();
  };
  private readonly onVisibility = (): void => {
    if (document.hidden) this.reset();
  };

  constructor(
    private readonly joystickEl: HTMLElement,
    private readonly knobEl: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly bindings: () => Bindings,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.bindJoystick();
    this.bindPointer();
  }

  /** Полный сброс ввода. Используется при потере фокуса и смене экрана. */
  reset(): void {
    this.keys.clear();
    this.pressed.clear();
    this.pointerDown = false;
    this.pointerActive = false;
    this.stick.x = 0;
    this.stick.y = 0;
    this.knobEl.style.transform = '';
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    // Канвас рисуется в 2× для чёткого HD-2D, но игровая логика остаётся в 480×270.
    this.pointerX = ((event.clientX - rect.left) / rect.width) * 480;
    this.pointerY = ((event.clientY - rect.top) / rect.height) * 270;
    this.pointerActive = true;
  }

  private bindPointer(): void {
    this.canvas.addEventListener('pointermove', (event) => this.updatePointer(event));
    this.canvas.addEventListener('pointerdown', (event) => {
      this.updatePointer(event);
      if (event.button === 0 || event.pointerType !== 'mouse') this.pointerDown = true;
    });
    const release = (): void => { this.pointerDown = false; };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this.canvas.addEventListener('pointerleave', () => { this.pointerActive = false; });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private bindJoystick(): void {
    const update = (event: PointerEvent): void => {
      const rect = this.joystickEl.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const radius = rect.width / 2;
      const distance = Math.hypot(dx, dy);
      const clamped = Math.min(distance, radius);
      const nx = distance > 0 ? (dx / distance) * clamped : 0;
      const ny = distance > 0 ? (dy / distance) * clamped : 0;
      this.stick.x = nx / radius;
      this.stick.y = ny / radius;
      this.knobEl.style.transform = `translate(${nx}px, ${ny}px)`;
    };

    this.joystickEl.addEventListener('pointerdown', (event) => {
      this.pointerId = event.pointerId;
      this.joystickEl.setPointerCapture(event.pointerId);
      update(event);
    });
    this.joystickEl.addEventListener('pointermove', (event) => {
      if (this.pointerId === event.pointerId) update(event);
    });
    const release = (event: PointerEvent): void => {
      if (this.pointerId !== event.pointerId) return;
      this.pointerId = null;
      this.stick.x = 0;
      this.stick.y = 0;
      this.knobEl.style.transform = '';
    };
    this.joystickEl.addEventListener('pointerup', release);
    this.joystickEl.addEventListener('pointercancel', release);
  }

  axis(): Axis {
    const b = this.bindings();
    let x = this.stick.x;
    let y = this.stick.y;
    if (this.keys.has(b.left)) x -= 1;
    if (this.keys.has(b.right)) x += 1;
    if (this.keys.has(b.up)) y -= 1;
    if (this.keys.has(b.down)) y += 1;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  pointer(): PointerState {
    return { x: this.pointerX, y: this.pointerY, active: this.pointerActive, down: this.pointerDown };
  }

  /** Был ли нажат ключ с прошлого кадра. */
  takePress(key: string): boolean {
    if (!this.pressed.has(key)) return false;
    this.pressed.delete(key);
    return true;
  }

  clearPresses(): void {
    this.pressed.clear();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
