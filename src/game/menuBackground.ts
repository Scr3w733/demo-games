/**
 * Процедурный анимированный фон главного меню.
 * Вдохновлён бесплатными CC0-параллаксами OpenGameArt/SpritePilot, но не использует внешние файлы:
 * никаких лицензионных зависимостей и тяжёлых ассетов для Яндекс Игр.
 */
interface Ash {
  x: number;
  y: number;
  speed: number;
  drift: number;
  size: number;
  alpha: number;
}

interface Fog {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  alpha: number;
}

const W = 480;
const H = 270;

export class MenuBackground {
  private readonly ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private t = 0;
  private active = false;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly ash: Ash[] = [];
  private readonly fog: Fog[] = [];

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D недоступен для фона меню');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    canvas.width = W;
    canvas.height = H;
    for (let i = 0; i < 90; i += 1) {
      this.ash.push({
        x: pseudo(i, 1) * W,
        y: pseudo(i, 2) * H,
        speed: 5 + pseudo(i, 3) * 18,
        drift: -8 + pseudo(i, 4) * 16,
        size: pseudo(i, 5) > 0.86 ? 2 : 1,
        alpha: 0.2 + pseudo(i, 6) * 0.55,
      });
    }
    for (let i = 0; i < 7; i += 1) {
      this.fog.push({
        x: pseudo(i, 7) * W,
        y: 120 + pseudo(i, 8) * 110,
        w: 100 + pseudo(i, 9) * 190,
        h: 12 + pseudo(i, 10) * 26,
        speed: 2 + pseudo(i, 11) * 8,
        alpha: 0.05 + pseudo(i, 12) * 0.09,
      });
    }
    this.draw(0);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active && !this.reduced) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.loop);
    } else {
      cancelAnimationFrame(this.raf);
      if (active) this.draw(this.t);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
  }

  private readonly loop = (now: number): void => {
    if (!this.active) return;
    const dt = this.last === 0 ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.draw(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(dt: number): void {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#07080c');
    sky.addColorStop(0.48, '#141018');
    sky.addColorStop(1, '#080a0c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Медленно дышащий «последний свет» за горизонтом.
    const pulse = 0.82 + Math.sin(this.t * 0.9) * 0.08 + Math.sin(this.t * 2.3) * 0.025;
    const gx = 356;
    const gy = 92;
    const glow = ctx.createRadialGradient(gx, gy, 2, gx, gy, 118 * pulse);
    glow.addColorStop(0, 'rgba(230, 178, 92, 0.40)');
    glow.addColorStop(0.35, 'rgba(163, 58, 58, 0.17)');
    glow.addColorStop(1, 'rgba(5, 6, 8, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(gx - 130, gy - 130, 260, 260);
    ctx.fillStyle = '#d8b06a';
    ctx.beginPath();
    ctx.arc(gx, gy, 8 + Math.sin(this.t * 1.2) * 0.6, 0, Math.PI * 2);
    ctx.fill();

    this.drawRuins(0.06, '#0e1014', 0);
    this.drawRuins(0.13, '#0b0d11', 26);
    this.drawGraves(0.35 + Math.sin(this.t * 0.12) * 2, '#090b0e');

    for (const layer of this.fog) {
      layer.x += layer.speed * dt;
      if (layer.x > W + layer.w) layer.x = -layer.w;
      ctx.fillStyle = `rgba(120, 130, 138, ${layer.alpha})`;
      ctx.fillRect(Math.floor(layer.x), Math.floor(layer.y), Math.floor(layer.w), Math.floor(layer.h));
      ctx.fillRect(Math.floor(layer.x + layer.w * 0.22), Math.floor(layer.y + 5), Math.floor(layer.w * 0.5), Math.floor(layer.h * 0.55));
    }

    for (const particle of this.ash) {
      particle.y -= particle.speed * dt;
      particle.x += (particle.drift + Math.sin(this.t * 0.6 + particle.y * 0.05) * 4) * dt;
      if (particle.y < -3) {
        particle.y = H + 3;
        particle.x = pseudo(Math.floor(particle.x + this.t), 13) * W;
      }
      if (particle.x < -3) particle.x = W + 3;
      if (particle.x > W + 3) particle.x = -3;
      ctx.fillStyle = `rgba(222, 188, 132, ${particle.alpha})`;
      ctx.fillRect(Math.floor(particle.x), Math.floor(particle.y), particle.size, particle.size);
    }

    // Тёмная рамка и вертикальный vignette, чтобы текст меню оставался читаемым.
    const vignette = ctx.createLinearGradient(0, 0, W, 0);
    vignette.addColorStop(0, 'rgba(2, 3, 5, 0.72)');
    vignette.addColorStop(0.32, 'rgba(2, 3, 5, 0.12)');
    vignette.addColorStop(0.7, 'rgba(2, 3, 5, 0.12)');
    vignette.addColorStop(1, 'rgba(2, 3, 5, 0.72)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  private drawRuins(offset: number, color: string, base: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let i = -1; i < 16; i += 1) {
      const x = Math.floor(i * 34 + offset);
      const h = 34 + Math.floor(pseudo(i, 14) * 62);
      const y = 190 - h + base;
      ctx.fillRect(x, y, 30, h + 80);
      if (pseudo(i, 15) > 0.35) {
        ctx.fillRect(x + 8, y - 18, 5, 18);
        ctx.fillRect(x + 19, y - 26, 4, 26);
      } else {
        ctx.beginPath();
        ctx.moveTo(x - 2, y);
        ctx.lineTo(x + 15, y - 22);
        ctx.lineTo(x + 32, y);
        ctx.fill();
      }
    }
  }

  private drawGraves(offset: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let i = -1; i < 22; i += 1) {
      const x = Math.floor(i * 24 + offset + pseudo(i, 16) * 6);
      const y = 216 + Math.floor(pseudo(i, 17) * 22);
      const h = 12 + Math.floor(pseudo(i, 18) * 16);
      ctx.fillRect(x, y - h, 7, h);
      ctx.fillRect(x - 2, y - h, 11, 3);
      if (pseudo(i, 19) > 0.75) {
        ctx.fillRect(x + 3, y - h - 8, 2, 8);
        ctx.fillRect(x, y - h - 6, 8, 2);
      }
    }
    ctx.fillRect(0, 238, W, H - 238);
  }
}

function pseudo(a: number, b: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return value - Math.floor(value);
}
