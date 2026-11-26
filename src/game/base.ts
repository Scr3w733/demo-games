import { BASE_UPGRADES, baseUpgradeCost, getClass, getSkin, getWeapon, keyLabel } from './config';
import { Input } from './input';
import { characterSprite, drawHeldWeapon } from './sprites';
import type { Sound } from './audio';
import type { Storage } from './storage';
import type { ClassId, GraphicsSettings, WeaponDef } from './types';

/**
 * Самостоятельное ходимое убежище: один большой прямоугольный мир с комнатами,
 * дверными проёмами, порталами, питомцем и процедурной мебелью. Модуль не
 * трогает движок, UI и сохранение, кроме смены equippedSkin и покупки кузницы.
 */

export interface BaseCallbacks {
  toast(text: string): void;
  onExit(): void;
  onSkinApplied?(id: string): void;
}

type Localized = { ru: string; en: string };
type Side = 'top' | 'bottom' | 'left' | 'right';
type PropKind =
  | 'carpet' | 'altar' | 'anvil' | 'rack' | 'hay' | 'wardrobe'
  | 'stand' | 'brazier' | 'crate' | 'table' | 'books' | 'cauldron';
type SpotKind = 'door' | 'skin' | 'forge' | 'altar' | 'npc' | 'campaign' | 'exit';
type AnimalKind = 'rat' | 'crow' | 'sheep';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

interface Npc {
  x: number;
  y: number;
  classId: ClassId;
  name: Localized;
  line: Localized;
}

interface Room {
  id: string;
  name: Localized;
  x: number;
  y: number;
  w: number;
  h: number;
  side: Side;
  doorOffset: number;
  doorWidth: number;
  floor: string;
  floorLine: string;
  accent: string;
  props: Prop[];
  npc: Npc;
}

interface Wall extends Rect {
  kind: 'outer' | 'room';
}

interface Carpet extends Rect {
  color: string;
  accent: string;
}

interface Spot {
  x: number;
  y: number;
  radius: number;
  kind: SpotKind;
  label: Localized;
  line?: Localized;
  room?: Room;
}

interface Decoration {
  x: number;
  y: number;
  kind: 'grass' | 'bush' | 'flower' | 'mushroom' | 'stone' | 'bone';
  tint: number;
}

interface Animal {
  kind: AnimalKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  home: Rect | null;
}

interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  phase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

interface Stain {
  x: number;
  y: number;
  r: number;
}

interface Player {
  x: number;
  y: number;
  facing: number;
}

const VIEW_W = 480;
const VIEW_H = 270;
const SCALE = 2;
const WORLD_W = 1600;
const WORLD_H = 1000;
const BORDER = 24;
const WALL = 14;
const PLAYER_R = 8;
const OUTLINE = '#07080a';

const ROOMS: Room[] = [
  {
    id: 'keep',
    name: { ru: 'КРЕПОСТЬ · АЛТАРЬ', en: 'KEEP · ALTAR' },
    x: 620, y: 330, w: 360, h: 270,
    side: 'bottom', doorOffset: 180, doorWidth: 64,
    floor: '#211d19', floorLine: '#2c2620', accent: '#c9a24b',
    props: [
      { kind: 'carpet', x: 764, y: 402, w: 72, h: 168 },
      { kind: 'altar', x: 800, y: 455 },
      { kind: 'brazier', x: 672, y: 382 },
      { kind: 'brazier', x: 928, y: 382 },
      { kind: 'books', x: 658, y: 486 },
      { kind: 'crate', x: 670, y: 540 },
      { kind: 'crate', x: 930, y: 540 },
      { kind: 'cauldron', x: 930, y: 486 },
    ],
    npc: {
      x: 878, y: 470, classId: 'necromancer',
      name: { ru: 'Жрец', en: 'Priest' },
      line: {
        ru: 'ЖРЕЦ: Очаг и кузня делают каждый забег крепче.',
        en: 'PRIEST: Hearth and forge make every run stronger.',
      },
    },
  },
  {
    id: 'forge',
    name: { ru: 'КУЗНЯ · МАСТЕРСКАЯ', en: 'FORGE · WORKSHOP' },
    x: 120, y: 110, w: 300, h: 220,
    side: 'bottom', doorOffset: 150, doorWidth: 56,
    floor: '#262018', floorLine: '#312920', accent: '#e5813a',
    props: [
      { kind: 'carpet', x: 248, y: 150, w: 44, h: 130 },
      { kind: 'anvil', x: 270, y: 225 },
      { kind: 'rack', x: 165, y: 178 },
      { kind: 'brazier', x: 370, y: 180 },
      { kind: 'table', x: 180, y: 276 },
      { kind: 'crate', x: 370, y: 276 },
    ],
    npc: {
      x: 200, y: 230, classId: 'boxer',
      name: { ru: 'Кузнец', en: 'Smith' },
      line: {
        ru: 'КУЗНЕЦ: Уровень кузни повышает урон во всех забегах.',
        en: 'SMITH: Forge levels raise damage in every run.',
      },
    },
  },
  {
    id: 'pen',
    name: { ru: 'ПИТОМНИК · ЗАГОН', en: 'NURSERY · PEN' },
    x: 1180, y: 110, w: 300, h: 230,
    side: 'bottom', doorOffset: 150, doorWidth: 56,
    floor: '#24251a', floorLine: '#303124', accent: '#8fbf63',
    props: [
      { kind: 'carpet', x: 1304, y: 152, w: 52, h: 136 },
      { kind: 'hay', x: 1244, y: 202 },
      { kind: 'hay', x: 1410, y: 250 },
      { kind: 'crate', x: 1244, y: 288 },
      { kind: 'table', x: 1410, y: 168 },
      { kind: 'brazier', x: 1435, y: 300 },
    ],
    npc: {
      x: 1340, y: 222, classId: 'soldier',
      name: { ru: 'Смотритель', en: 'Keeper' },
      line: {
        ru: 'СМОТРИТЕЛЬ: Теплица восстанавливает здоровье в бою.',
        en: 'KEEPER: Greenhouse restores health during runs.',
      },
    },
  },
  {
    id: 'wardrobe',
    name: { ru: 'ГАРДЕРОБ · СКИНЫ', en: 'WARDROBE · SKINS' },
    x: 120, y: 620, w: 300, h: 230,
    side: 'top', doorOffset: 150, doorWidth: 56,
    floor: '#211d24', floorLine: '#2d2732', accent: '#b06bd8',
    props: [
      { kind: 'carpet', x: 248, y: 660, w: 44, h: 136 },
      { kind: 'wardrobe', x: 174, y: 732 },
      { kind: 'stand', x: 272, y: 754 },
      { kind: 'brazier', x: 370, y: 680 },
      { kind: 'books', x: 366, y: 790 },
      { kind: 'crate', x: 172, y: 800 },
    ],
    npc: {
      x: 330, y: 742, classId: 'mage',
      name: { ru: 'Портниха', en: 'Tailor' },
      line: {
        ru: 'ПОРТНИХА: Скин меняет только внешний вид, не силу.',
        en: 'TAILOR: A skin changes looks only, never power.',
      },
    },
  },
];

const OUTSIDE_BRAZIERS: Array<{ x: number; y: number }> = [
  { x: 520, y: 250 }, { x: 1080, y: 250 },
  { x: 520, y: 710 }, { x: 1080, y: 710 },
  { x: 800, y: 660 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function fill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  body: string, light: string, dark: string,
): void {
  fill(ctx, x, y, w, h, OUTLINE);
  fill(ctx, x + 1, y + 1, w - 2, h - 2, body);
  fill(ctx, x + 1, y + 1, w - 2, 1, light);
  fill(ctx, x + 1, y + h - 2, w - 2, 1, dark);
  fill(ctx, x + 1, y + 1, 1, h - 2, light);
  fill(ctx, x + w - 2, y + 1, 1, h - 2, dark);
}

export class BaseGame {
  /** Устанавливается перед вызовом onExit: 'campaign' — портал забега, 'menu' — выход. */
  lastExitKind: 'menu' | 'campaign' | null = null;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: BaseCallbacks;
  private readonly spriteCache = new Map<string, HTMLCanvasElement>();

  private input: Input | null = null;
  private fallbackBound = false;
  private readonly fallbackKeys = new Set<string>();
  private readonly fallbackPressed = new Set<string>();

  private running = false;
  private player: Player | null = null;
  private time = 0;
  private walkPhase = 0;
  private camX = 0;
  private camY = 0;
  private shake = 0;
  private focus: Spot | null = null;

  private walls: Wall[] = [];
  private carpets: Carpet[] = [];
  private spots: Spot[] = [];
  private decorations: Decoration[] = [];
  private animals: Animal[] = [];
  private lights: Light[] = [];
  private stains: Stain[] = [];
  private particles: Particle[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    private readonly storage: Storage,
    private readonly sound: Sound,
    callbacks: BaseCallbacks,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D недоступен');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.callbacks = callbacks;
    this.buildWorld();
  }

  private get graphics(): GraphicsSettings {
    const settings = this.storage.data.graphics;
    return settings ?? {
      quality: 'high', blood: true, particles: true, lighting: true,
      vegetation: true, animals: true, shake: true, festive: false, motionBlur: true,
    };
  }

  private get locale(): 'ru' | 'en' {
    return this.storage.data.locale === 'en' ? 'en' : 'ru';
  }

  private loc(value: Localized): string {
    return value[this.locale];
  }

  private detail(): number {
    const quality = this.graphics.quality;
    if (quality === 'low') return 0.5;
    if (quality === 'medium') return 0.75;
    if (quality === 'ultra') return 1.25;
    return 1;
  }

  private readonly fallbackKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(key)) event.preventDefault();
    if (!this.fallbackKeys.has(key)) this.fallbackPressed.add(key);
    this.fallbackKeys.add(key);
  };

  private readonly fallbackKeyUp = (event: KeyboardEvent): void => {
    this.fallbackKeys.delete(event.key.toLowerCase());
  };

  private readonly fallbackBlur = (): void => {
    this.fallbackKeys.clear();
  };

  private ensureInput(): void {
    if (this.input) return;
    if (typeof document !== 'undefined') {
      const joystick = document.querySelector<HTMLElement>('#joystick');
      const knob = document.querySelector<HTMLElement>('#stick');
      if (joystick && knob) {
        this.input = new Input(joystick, knob, this.ctx.canvas, () => this.storage.data.bindings);
        return;
      }
    }
    if (typeof window === 'undefined' || this.fallbackBound) return;
    window.addEventListener('keydown', this.fallbackKeyDown);
    window.addEventListener('keyup', this.fallbackKeyUp);
    window.addEventListener('blur', this.fallbackBlur);
    this.fallbackBound = true;
  }

  start(): void {
    this.ensureInput();
    this.input?.clearPresses();
    this.fallbackPressed.clear();
    this.player = { x: 800, y: 716, facing: Math.PI / 2 };
    this.camX = clamp(this.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    this.camY = clamp(this.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
    this.time = 0;
    this.walkPhase = 0;
    this.shake = 0;
    this.focus = null;
    this.lastExitKind = null;
    this.running = true;
    this.sound.unlock();
    this.callbacks.toast(this.loc({
      ru: 'УБЕЖИЩЕ · ИЩИ ДВЕРИ, СТЕНДЫ И ПОРТАЛЫ',
      en: 'HUB · FIND DOORS, STANDS AND PORTALS',
    }));
  }

  stop(): void {
    this.running = false;
    if (this.input) {
      this.input.destroy();
      this.input = null;
    }
    if (this.fallbackBound && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.fallbackKeyDown);
      window.removeEventListener('keyup', this.fallbackKeyUp);
      window.removeEventListener('blur', this.fallbackBlur);
    }
    this.fallbackBound = false;
    this.fallbackKeys.clear();
    this.fallbackPressed.clear();
  }

  update(dt: number): void {
    if (!this.running || !this.player) return;
    const step = clamp(dt, 0, 0.05);
    this.time += step;
    this.shake = Math.max(0, this.shake - step * 18);

    const axis = this.axis();
    const moving = Math.abs(axis.x) + Math.abs(axis.y) > 0.01;
    if (moving) {
      const speed = 112;
      this.moveWithCollision(this.player, axis.x * speed * step, axis.y * speed * step, PLAYER_R);
      this.clampEntity(this.player, PLAYER_R);
      this.player.facing = Math.atan2(axis.y, axis.x);
      this.walkPhase += step * speed * 0.12;
    }

    this.updateAnimals(step);
    this.updateParticles(step);
    if (this.graphics.particles && Math.random() < step * 1.4 * this.detail() && this.lights.length > 0) {
      const light = this.lights[Math.floor(Math.random() * this.lights.length)];
      if (light && this.visible(light.x - light.r, light.y - light.r, light.r * 2, light.r * 2)) {
        this.spawnParticles(light.x, light.y - 5, '#e5813a', 1);
      }
    }

    const targetX = clamp(this.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    const targetY = clamp(this.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
    const lerp = Math.min(1, step * 7);
    this.camX += (targetX - this.camX) * lerp;
    this.camY += (targetY - this.camY) * lerp;

    this.focus = this.findSpot();
    if (this.takeInteract() && this.focus) this.interact(this.focus);
  }

  draw(): void {
    if (!this.running) return;
    const ctx = this.ctx;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    fill(ctx, 0, 0, VIEW_W, VIEW_H, '#0b0d10');

    const shaking = this.shake > 0 && this.graphics.shake;
    const shakeX = shaking ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = shaking ? (Math.random() - 0.5) * this.shake : 0;
    const camX = Math.round(clamp(this.camX + shakeX, 0, WORLD_W - VIEW_W));
    const camY = Math.round(clamp(this.camY + shakeY, 0, WORLD_H - VIEW_H));

    this.drawGround(camX, camY);
    this.drawRoomFloors(camX, camY);
    this.drawCarpets(camX, camY);
    this.drawDecorations(camX, camY);
    this.drawWalls(camX, camY);
    this.drawDoors(camX, camY);
    this.drawProps(camX, camY);
    this.drawNpcs(camX, camY);
    this.drawAnimals(camX, camY);
    if (this.player) this.drawPlayer(camX, camY);
    this.drawParticles(camX, camY);
    this.drawLighting(camX, camY);
    this.drawHud();
    this.drawMinimap();
  }

  // ---------------------------------------------------------------- ввод

  private axis(): { x: number; y: number } {
    if (this.input) return this.input.axis();
    const bindings = this.storage.data.bindings;
    let x = 0;
    let y = 0;
    if (this.fallbackKeys.has(bindings.left)) x -= 1;
    if (this.fallbackKeys.has(bindings.right)) x += 1;
    if (this.fallbackKeys.has(bindings.up)) y -= 1;
    if (this.fallbackKeys.has(bindings.down)) y += 1;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  private takePress(key: string): boolean {
    if (this.input) return this.input.takePress(key.toLowerCase());
    const lowered = key.toLowerCase();
    if (!this.fallbackPressed.has(lowered)) return false;
    this.fallbackPressed.delete(lowered);
    return true;
  }

  private takeInteract(): boolean {
    const seen = new Set<string>();
    for (const key of [this.storage.data.bindings.interact, 'e', ' ']) {
      const lowered = key.toLowerCase();
      if (seen.has(lowered)) continue;
      seen.add(lowered);
      if (this.takePress(lowered)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- мир

  private buildWorld(): void {
    this.walls = [];
    this.carpets = [];
    this.spots = [];
    this.decorations = [];
    this.animals = [];
    this.lights = [];
    this.stains = [];
    this.particles = [];

    this.walls.push(
      { x: 0, y: 0, w: WORLD_W, h: BORDER, kind: 'outer' },
      { x: 0, y: WORLD_H - BORDER, w: WORLD_W, h: BORDER, kind: 'outer' },
      { x: 0, y: 0, w: BORDER, h: WORLD_H, kind: 'outer' },
      { x: WORLD_W - BORDER, y: 0, w: BORDER, h: WORLD_H, kind: 'outer' },
    );

    for (const room of ROOMS) {
      this.addRoomWalls(room);
      const door = this.roomDoorPoint(room);
      this.spots.push({
        x: door.x, y: door.y, radius: 46, kind: 'door', room,
        label: {
          ru: `ЧЕРЕЗ ДВЕРЬ · ${this.roomName(room, 'ru')}`,
          en: `THROUGH DOOR · ${this.roomName(room, 'en')}`,
        },
      });
      this.spots.push({
        x: room.npc.x, y: room.npc.y, radius: 30, kind: 'npc', room,
        label: { ru: `ПОГОВОРИТЬ · ${room.npc.name.ru}`, en: `TALK · ${room.npc.name.en}` },
        line: room.npc.line,
      });
      for (const prop of room.props) {
        if (prop.kind === 'carpet' && prop.w && prop.h) {
          this.carpets.push({ x: prop.x, y: prop.y, w: prop.w, h: prop.h, color: '#402626', accent: room.accent });
        }
        if (prop.kind === 'brazier') {
          this.lights.push({ x: prop.x, y: prop.y - 4, r: 78, color: '#255,150,74', phase: hash(prop.x, prop.y) * 6.28 });
        }
      }
    }

    const keep = ROOMS[0];
    const forge = ROOMS[1];
    const wardrobe = ROOMS[3];
    const altar = this.propOf(keep, 'altar');
    const anvil = this.propOf(forge, 'anvil');
    const stand = this.propOf(wardrobe, 'stand');
    if (altar) {
      this.spots.push({
        x: altar.x, y: altar.y, radius: 44, kind: 'altar', room: keep,
        label: { ru: 'ОСМОТРЕТЬ АЛТАРЬ', en: 'INSPECT THE ALTAR' },
      });
    }
    if (anvil) {
      this.spots.push({
        x: anvil.x, y: anvil.y, radius: 42, kind: 'forge', room: forge,
        label: { ru: 'КУЗНЯ · УЛУЧШИТЬ', en: 'FORGE · UPGRADE' },
      });
    }
    if (stand) {
      this.spots.push({
        x: stand.x, y: stand.y, radius: 44, kind: 'skin', room: wardrobe,
        label: { ru: 'СТЕНД · СМЕНИТЬ СКИН', en: 'STAND · CHANGE SKIN' },
      });
    }

    this.carpets.push(
      { x: 786, y: 606, w: 28, h: 286, color: '#3a2323', accent: '#8f5a4a' },
      { x: 860, y: 588, w: 570, h: 22, color: '#302226', accent: '#6f8f8a' },
      { x: 1408, y: 510, w: 22, h: 100, color: '#302226', accent: '#6f8f8a' },
      { x: 420, y: 588, w: 200, h: 22, color: '#322a20', accent: '#8a6f45' },
      { x: 408, y: 320, w: 22, h: 290, color: '#322a20', accent: '#8a6f45' },
      { x: 408, y: 704, w: 22, h: 116, color: '#302326', accent: '#8a6f9a' },
    );

    this.spots.push(
      {
        x: 1450, y: 520, radius: 46, kind: 'campaign',
        label: { ru: 'ПОРТАЛ · В ЗАБЕГ', en: 'PORTAL · START RUN' },
      },
      {
        x: 800, y: 900, radius: 46, kind: 'exit',
        label: { ru: 'ВЫХОД · В МЕНЮ', en: 'EXIT · TO MENU' },
      },
    );
    this.lights.push(
      { x: 1450, y: 520, r: 112, color: '124,224,208', phase: 0 },
      { x: 800, y: 900, r: 104, color: '224,90,90', phase: 1.7 },
    );
    for (const spot of OUTSIDE_BRAZIERS) {
      this.lights.push({ x: spot.x, y: spot.y - 4, r: 78, color: '255,150,74', phase: hash(spot.x, spot.y) * 6.28 });
    }

    if (this.graphics.vegetation) {
      const count = Math.round(270 * this.detail());
      const kinds: Decoration['kind'][] = ['grass', 'bush', 'flower', 'mushroom', 'stone', 'bone'];
      for (let i = 0; i < count; i += 1) {
        const x = Math.round(34 + hash(i + 5, 21) * (WORLD_W - 68));
        const y = Math.round(34 + hash(31, i + 9) * (WORLD_H - 68));
        if (this.hitsWall(x, y, 6)) continue;
        if (ROOMS.some((room) => this.pointInRoom(x, y, room, 10))) continue;
        if (Math.hypot(x - 1450, y - 520) < 58 || Math.hypot(x - 800, y - 900) < 58) continue;
        this.decorations.push({
          x, y,
          kind: kinds[i % kinds.length],
          tint: Math.floor(hash(i * 3 + 7, 41) * 3),
        });
      }
    }

    if (this.graphics.animals) {
      const pen = ROOMS[2];
      const count = Math.round(18 * this.detail());
      const kinds: AnimalKind[] = ['rat', 'crow', 'rat', 'sheep', 'crow', 'rat'];
      for (let i = 0; i < count; i += 1) {
        const kind = kinds[i % kinds.length];
        const inPen = kind === 'sheep' || i % 5 === 0;
        const home: Rect | null = inPen
          ? { x: pen.x + 22, y: pen.y + 22, w: pen.w - 44, h: pen.h - 44 }
          : { x: BORDER, y: BORDER, w: WORLD_W - BORDER * 2, h: WORLD_H - BORDER * 2 };
        let x = home.x + 12 + hash(i + 11, 53) * Math.max(1, home.w - 24);
        let y = home.y + 12 + hash(59, i + 13) * Math.max(1, home.h - 24);
        for (let attempt = 0; attempt < 8 && this.hitsWall(x, y, 8); attempt += 1) {
          x = home.x + 12 + hash(i * 3 + attempt, 53) * Math.max(1, home.w - 24);
          y = home.y + 12 + hash(59, i * 5 + attempt) * Math.max(1, home.h - 24);
        }
        if (this.hitsWall(x, y, 8)) continue;
        const angle = hash(i, 61) * Math.PI * 2;
        const speed = kind === 'crow' ? 34 : kind === 'sheep' ? 9 : 17;
        this.animals.push({
          kind, x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          phase: hash(i, 67) * Math.PI * 2,
          size: kind === 'sheep' ? 10 : kind === 'crow' ? 5 : 4,
          home,
        });
      }
    }

    if (this.graphics.blood) {
      const keep = ROOMS[0];
      for (let i = 0; i < 14; i += 1) {
        this.stains.push({
          x: keep.x + 60 + hash(i + 17, 71) * (keep.w - 120),
          y: keep.y + 60 + hash(73, i + 19) * (keep.h - 120),
          r: 2 + Math.floor(hash(i, 79) * 5),
        });
      }
    }
  }

  private roomName(room: Room, locale: 'ru' | 'en'): string {
    return room.name[locale];
  }

  private propOf(room: Room, kind: PropKind): Prop | undefined {
    return room.props.find((prop) => prop.kind === kind);
  }

  private addRoomWalls(room: Room): void {
    const t = WALL;
    const left = room.x;
    const right = room.x + room.w;
    const top = room.y;
    const bottom = room.y + room.h;
    const gapStart = this.roomDoorPoint(room);
    const halfGap = room.doorWidth / 2;

    if (room.side === 'top' || room.side === 'bottom') {
      const y = room.side === 'top' ? top : bottom - t;
      const gx = gapStart.x;
      this.walls.push(
        { x: left, y, w: Math.max(0, gx - halfGap - left), h: t, kind: 'room' },
        { x: gx + halfGap, y, w: Math.max(0, right - gx - halfGap), h: t, kind: 'room' },
      );
      const otherY = room.side === 'top' ? bottom - t : top;
      this.walls.push({ x: left, y: otherY, w: room.w, h: t, kind: 'room' });
      this.walls.push(
        { x: left, y: top, w: t, h: room.h, kind: 'room' },
        { x: right - t, y: top, w: t, h: room.h, kind: 'room' },
      );
      return;
    }

    const x = room.side === 'left' ? left : right - t;
    const gy = gapStart.y;
    this.walls.push(
      { x, y: top, w: t, h: Math.max(0, gy - halfGap - top), kind: 'room' },
      { x, y: gy + halfGap, w: t, h: Math.max(0, bottom - gy - halfGap), kind: 'room' },
    );
    const otherX = room.side === 'left' ? right - t : left;
    this.walls.push({ x: otherX, y: top, w: t, h: room.h, kind: 'room' });
    this.walls.push(
      { x: left, y: top, w: room.w, h: t, kind: 'room' },
      { x: left, y: bottom - t, w: room.w, h: t, kind: 'room' },
    );
  }

  private roomDoorPoint(room: Room): { x: number; y: number } {
    if (room.side === 'top') return { x: room.x + room.doorOffset, y: room.y };
    if (room.side === 'bottom') return { x: room.x + room.doorOffset, y: room.y + room.h };
    if (room.side === 'left') return { x: room.x, y: room.y + room.doorOffset };
    return { x: room.x + room.w, y: room.y + room.doorOffset };
  }

  private roomInsidePoint(room: Room): { x: number; y: number } {
    const door = this.roomDoorPoint(room);
    const offset = 38;
    if (room.side === 'top') return { x: door.x, y: door.y + offset };
    if (room.side === 'bottom') return { x: door.x, y: door.y - offset };
    if (room.side === 'left') return { x: door.x + offset, y: door.y };
    return { x: door.x - offset, y: door.y };
  }

  private roomOutsidePoint(room: Room): { x: number; y: number } {
    const door = this.roomDoorPoint(room);
    const offset = 38;
    if (room.side === 'top') return { x: door.x, y: door.y - offset };
    if (room.side === 'bottom') return { x: door.x, y: door.y + offset };
    if (room.side === 'left') return { x: door.x - offset, y: door.y };
    return { x: door.x + offset, y: door.y };
  }

  private pointInRoom(x: number, y: number, room: Room, inset = 0): boolean {
    return x > room.x + inset && x < room.x + room.w - inset
      && y > room.y + inset && y < room.y + room.h - inset;
  }

  private hitsWall(x: number, y: number, radius: number): Wall | null {
    for (const wall of this.walls) {
      const nearestX = clamp(x, wall.x, wall.x + wall.w);
      const nearestY = clamp(y, wall.y, wall.y + wall.h);
      if (Math.hypot(x - nearestX, y - nearestY) < radius) return wall;
    }
    return null;
  }

  private clampEntity(entity: { x: number; y: number }, radius: number): void {
    entity.x = clamp(entity.x, BORDER + radius, WORLD_W - BORDER - radius);
    entity.y = clamp(entity.y, BORDER + radius, WORLD_H - BORDER - radius);
  }

  private moveWithCollision(entity: { x: number; y: number }, dx: number, dy: number, radius: number): void {
    if (!this.hitsWall(entity.x + dx, entity.y, radius)) entity.x += dx;
    if (!this.hitsWall(entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  // ---------------------------------------------------------------- взаимодействия

  private findSpot(): Spot | null {
    if (!this.player) return null;
    let nearest: Spot | null = null;
    let best = Infinity;
    for (const spot of this.spots) {
      if (!this.visible(spot.x - spot.radius, spot.y - spot.radius, spot.radius * 2, spot.radius * 2)) continue;
      const distance = Math.hypot(spot.x - this.player.x, spot.y - this.player.y);
      if (distance < spot.radius && distance < best) {
        best = distance;
        nearest = spot;
      }
    }
    return nearest;
  }

  private interact(spot: Spot): void {
    this.spawnParticles(spot.x, spot.y, spot.kind === 'exit' ? '#e05a5a' : '#f0d68a', 8);
    switch (spot.kind) {
      case 'door':
        if (spot.room) this.toggleDoor(spot.room);
        break;
      case 'skin':
        this.cycleSkin();
        break;
      case 'forge':
        this.upgradeForge();
        break;
      case 'altar':
        this.inspectAltar();
        break;
      case 'npc':
        if (spot.line) {
          this.callbacks.toast(this.loc(spot.line));
          this.sound.click();
        }
        break;
      case 'campaign':
        this.leave('campaign');
        break;
      case 'exit':
        this.leave('menu');
        break;
    }
  }

  private toggleDoor(room: Room): void {
    if (!this.player) return;
    const inside = this.pointInRoom(this.player.x, this.player.y, room, -WALL);
    const target = inside ? this.roomOutsidePoint(room) : this.roomInsidePoint(room);
    if (!this.hitsWall(target.x, target.y, PLAYER_R)) {
      this.player.x = target.x;
      this.player.y = target.y;
    }
    this.sound.click();
    this.callbacks.toast(
      inside
        ? this.loc({ ru: `ВЫШЕЛ · ${room.name.ru}`, en: `LEFT · ${room.name.en}` })
        : this.loc({ ru: `ВОШЁЛ · ${room.name.ru}`, en: `ENTERED · ${room.name.en}` }),
    );
  }

  private cycleSkin(): void {
    const owned = this.storage.data.skins.filter((id) => getSkin(id) !== null);
    if (owned.length === 0) {
      this.callbacks.toast(this.loc({ ru: 'НЕТ СКИНОВ · ОТКРОЙ КЕЙСЫ', en: 'NO SKINS · OPEN CASES' }));
      this.sound.click();
      return;
    }
    const current = this.storage.data.equippedSkin;
    const index = current ? owned.indexOf(current) : -1;
    const next = owned[(index + 1) % owned.length];
    if (!next) return;
    const def = getSkin(next);
    this.storage.update({ equippedSkin: next });
    this.callbacks.onSkinApplied?.(next);
    this.sound.levelUp();
    if (this.graphics.shake) this.shake = 2;
    this.spawnParticles(this.player?.x ?? 272, this.player?.y ?? 754, def?.accent ?? '#b06bd8', 14);
    this.callbacks.toast(
      def
        ? this.loc({ ru: `СКИН · ${def.name}`, en: `SKIN · ${def.name}` })
        : this.loc({ ru: 'СКИН НАДЕТ', en: 'SKIN EQUIPPED' }),
    );
  }

  private upgradeForge(): void {
    const def = BASE_UPGRADES.find((item) => item.id === 'forge');
    if (!def) return;
    const level = this.storage.data.baseUpgrades.forge ?? 0;
    if (level >= def.max) {
      this.callbacks.toast(this.loc({ ru: 'КУЗНЯ · МАКСИМУМ', en: 'FORGE · MAX LEVEL' }));
      this.sound.click();
      return;
    }
    const cost = baseUpgradeCost(def, level);
    if (this.storage.data.coins < cost) {
      this.callbacks.toast(this.loc({
        ru: `НУЖНО ${cost} МОНЕТ · ЕСТЬ ${this.storage.data.coins}`,
        en: `NEED ${cost} COINS · HAVE ${this.storage.data.coins}`,
      }));
      this.sound.click();
      return;
    }
    if (!this.storage.upgradeBase('forge')) return;
    this.sound.levelUp();
    if (this.graphics.shake) this.shake = 3;
    this.callbacks.toast(this.loc({
      ru: `КУЗНЯ ${level + 1}/${def.max} · УРОН +${(level + 1) * 4}%`,
      en: `FORGE ${level + 1}/${def.max} · DAMAGE +${(level + 1) * 4}%`,
    }));
  }

  private inspectAltar(): void {
    const upgrades = this.storage.data.baseUpgrades;
    const message = this.locale === 'ru'
      ? `АЛТАРЬ · БАЗА ${this.storage.baseLevel()} · ОЧАГ ${upgrades.hearth ?? 0} · ТЕПЛИЦА ${upgrades.greenhouse ?? 0}`
      : `ALTAR · BASE ${this.storage.baseLevel()} · HEARTH ${upgrades.hearth ?? 0} · GREENHOUSE ${upgrades.greenhouse ?? 0}`;
    this.callbacks.toast(message);
    this.sound.levelUp();
    if (this.graphics.shake) this.shake = 2;
  }

  private leave(kind: 'menu' | 'campaign'): void {
    if (kind === 'campaign') {
      this.callbacks.toast(this.loc({
        ru: `ПОРТАЛ · УРОВЕНЬ ${this.storage.data.selectedLevel} · В ПУТЬ`,
        en: `PORTAL · LEVEL ${this.storage.data.selectedLevel} · DEPARTING`,
      }));
    } else {
      this.callbacks.toast(this.loc({ ru: 'ВОЗВРАЩЕНИЕ В МЕНЮ', en: 'RETURNING TO MENU' }));
    }
    this.sound.levelUp();
    this.lastExitKind = kind;
    this.stop();
    this.callbacks.onExit();
  }

  // ---------------------------------------------------------------- частицы и звери

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    if (!this.graphics.particles) return;
    const total = Math.max(2, Math.round(count * this.detail()));
    for (let i = 0; i < total; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 16 + Math.random() * 54;
      const life = 0.24 + Math.random() * 0.4;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 16,
        life, max: life, color,
      });
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 18 * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  private updateAnimals(dt: number): void {
    if (!this.player) return;
    for (const animal of this.animals) {
      animal.phase += dt * (animal.kind === 'crow' ? 3.2 : 1.6);
      const dx = animal.x - this.player.x;
      const dy = animal.y - this.player.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance < 52 && animal.kind !== 'sheep') {
        const flee = animal.kind === 'crow' ? 62 : 42;
        animal.x += (dx / distance) * flee * dt;
        animal.y += (dy / distance) * flee * dt;
      } else {
        animal.x += (animal.vx + Math.sin(animal.phase) * 4) * dt;
        animal.y += (animal.vy + Math.cos(animal.phase * 0.7) * 4) * dt;
      }
      const bounds = animal.home ?? { x: BORDER, y: BORDER, w: WORLD_W - BORDER * 2, h: WORLD_H - BORDER * 2 };
      const minX = bounds.x + animal.size + 4;
      const maxX = bounds.x + bounds.w - animal.size - 4;
      const minY = bounds.y + animal.size + 4;
      const maxY = bounds.y + bounds.h - animal.size - 4;
      if (animal.x < minX || animal.x > maxX) animal.vx *= -1;
      if (animal.y < minY || animal.y > maxY) animal.vy *= -1;
      animal.x = clamp(animal.x, minX, maxX);
      animal.y = clamp(animal.y, minY, maxY);
    }
  }

  // ---------------------------------------------------------------- отрисовка

  private visible(x: number, y: number, w = 0, h = 0): boolean {
    return x + w > this.camX - 24 && x < this.camX + VIEW_W + 24
      && y + h > this.camY - 24 && y < this.camY + VIEW_H + 24;
  }

  private drawGround(camX: number, camY: number): void {
    const ctx = this.ctx;
    const startX = Math.max(0, Math.floor(camX / 16));
    const endX = Math.min(Math.ceil(WORLD_W / 16), Math.ceil((camX + VIEW_W) / 16));
    const startY = Math.max(0, Math.floor(camY / 16));
    const endY = Math.min(Math.ceil(WORLD_H / 16), Math.ceil((camY + VIEW_H) / 16));
    const detailed = this.graphics.quality !== 'low';
    for (let gx = startX; gx < endX; gx += 1) {
      for (let gy = startY; gy < endY; gy += 1) {
        const h = hash(gx, gy);
        const color = h > 0.95 ? '#202329' : h > 0.74 ? '#1a1d21' : h > 0.32 ? '#171a1e' : '#14171a';
        const x = Math.round(gx * 16 - camX);
        const y = Math.round(gy * 16 - camY);
        fill(ctx, x, y, 16, 16, color);
        if (detailed && h > 0.985) fill(ctx, x + 5, y + 9, 4, 1, '#2b2e34');
      }
    }
  }

  private drawRoomFloors(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const room of ROOMS) {
      if (!this.visible(room.x, room.y, room.w, room.h)) continue;
      const x = Math.round(room.x - camX);
      const y = Math.round(room.y - camY);
      fill(ctx, x, y, room.w, room.h, room.floor);
      for (let gx = 0; gx < room.w; gx += 16) {
        fill(ctx, x + gx, y + WALL, 1, room.h - WALL * 2, room.floorLine);
      }
      for (let gy = 0; gy < room.h; gy += 16) {
        fill(ctx, x + WALL, y + gy, room.w - WALL * 2, 1, room.floorLine);
      }
      if (this.graphics.blood) {
        const stains = this.stains.filter((stain) =>
          stain.x > room.x && stain.x < room.x + room.w && stain.y > room.y && stain.y < room.y + room.h);
        for (const stain of stains) {
          ctx.globalAlpha = 0.42;
          fill(ctx, Math.round(stain.x - camX) - stain.r, Math.round(stain.y - camY) - 1, stain.r * 2, 3, '#591414');
          ctx.globalAlpha = 1;
        }
      }
      this.label(this.roomName(room, this.locale), x + room.w / 2, y + 24, room.accent);
    }
  }

  private drawCarpets(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const carpet of this.carpets) {
      if (!this.visible(carpet.x, carpet.y, carpet.w, carpet.h)) continue;
      const x = Math.round(carpet.x - camX);
      const y = Math.round(carpet.y - camY);
      fill(ctx, x - 2, y - 2, carpet.w + 4, carpet.h + 4, '#0c0d10');
      fill(ctx, x, y, carpet.w, carpet.h, carpet.color);
      const vertical = carpet.h >= carpet.w;
      if (vertical) {
        for (let gy = 3; gy < carpet.h; gy += 10) fill(ctx, x + 3, y + gy, carpet.w - 6, 2, carpet.accent);
      } else {
        for (let gx = 3; gx < carpet.w; gx += 10) fill(ctx, x + gx, y + 3, 2, carpet.h - 6, carpet.accent);
      }
    }
  }

  private drawWalls(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const wall of this.walls) {
      if (!this.visible(wall.x, wall.y, wall.w, wall.h)) continue;
      const x = Math.round(wall.x - camX);
      const y = Math.round(wall.y - camY);
      box(ctx, x, y, wall.w, wall.h, wall.kind === 'outer' ? '#2b2e34' : '#332f2b', '#4b4e55', '#111317');
      if (this.graphics.quality === 'low') continue;
      if (wall.w >= wall.h) {
        for (let gx = 8; gx < wall.w - 4; gx += 18) {
          fill(ctx, x + gx, y + 3, 1, wall.h - 6, '#1c1e22');
        }
      } else {
        for (let gy = 8; gy < wall.h - 4; gy += 18) {
          fill(ctx, x + 3, y + gy, wall.w - 6, 1, '#1c1e22');
        }
      }
    }
  }

  private drawDoors(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const room of ROOMS) {
      const door = this.roomDoorPoint(room);
      if (!this.visible(door.x - 40, door.y - 40, 80, 80)) continue;
      const horizontal = room.side === 'top' || room.side === 'bottom';
      const x = Math.round(door.x - camX);
      const y = Math.round(door.y - camY);
      const half = room.doorWidth / 2;
      const pulse = 0.55 + Math.sin(this.time * 3 + room.x) * 0.2;
      ctx.globalAlpha = pulse;
      if (horizontal) {
        fill(ctx, x - half, y - 8, room.doorWidth, 16, room.accent);
        fill(ctx, x - half, y - 3, room.doorWidth, 6, '#0a0b0d');
        fill(ctx, x - half - 2, y - 11, 4, 22, '#15171b');
        fill(ctx, x + half - 2, y - 11, 4, 22, '#15171b');
      } else {
        fill(ctx, x - 8, y - half, 16, room.doorWidth, room.accent);
        fill(ctx, x - 3, y - half, 6, room.doorWidth, '#0a0b0d');
        fill(ctx, x - 11, y - half - 2, 22, 4, '#15171b');
        fill(ctx, x - 11, y + half - 2, 22, 4, '#15171b');
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawDecorations(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const decor of this.decorations) {
      if (!this.visible(decor.x - 6, decor.y - 6, 12, 12)) continue;
      const x = Math.round(decor.x - camX);
      const y = Math.round(decor.y - camY);
      switch (decor.kind) {
        case 'grass':
          fill(ctx, x - 2, y - 3, 1, 5, decor.tint === 0 ? '#4e6541' : '#5d7449');
          fill(ctx, x, y - 5, 1, 7, '#6f8855');
          fill(ctx, x + 2, y - 2, 1, 4, '#465c3b');
          break;
        case 'bush':
          fill(ctx, x - 4, y - 3, 8, 5, '#2f4530');
          fill(ctx, x - 2, y - 5, 5, 3, '#456043');
          break;
        case 'flower':
          fill(ctx, x, y - 3, 1, 5, '#567148');
          fill(ctx, x - 1, y - 5, 3, 2, decor.tint === 0 ? '#c47a8a' : '#b9a0d8');
          break;
        case 'mushroom':
          fill(ctx, x, y - 2, 2, 4, '#b9b09a');
          fill(ctx, x - 2, y - 4, 6, 2, '#8d6c8f');
          break;
        case 'stone':
          fill(ctx, x - 3, y - 2, 7, 4, '#3b3f44');
          fill(ctx, x - 2, y - 3, 5, 1, '#555a60');
          break;
        case 'bone':
          fill(ctx, x - 4, y, 8, 1, '#b6b09e');
          fill(ctx, x - 4, y - 1, 2, 3, '#d8d2bd');
          fill(ctx, x + 2, y - 1, 2, 3, '#d8d2bd');
          break;
      }
    }
  }

  private drawProps(camX: number, camY: number): void {
    for (const room of ROOMS) {
      if (!this.visible(room.x, room.y, room.w, room.h)) continue;
      for (const prop of room.props) {
        if (prop.kind === 'carpet') continue;
        if (!this.visible(prop.x - 20, prop.y - 20, 40, 40)) continue;
        this.drawProp(prop, room.accent, camX, camY);
      }
    }
  }

  private drawProp(prop: Prop, accent: string, camX: number, camY: number): void {
    const ctx = this.ctx;
    const x = Math.round(prop.x - camX);
    const y = Math.round(prop.y - camY);
    const flicker = Math.sin(this.time * 9 + prop.x) * 1.5;
    switch (prop.kind) {
      case 'altar':
        box(ctx, x - 18, y - 6, 36, 18, '#4b453d', '#6d6558', '#29251f');
        box(ctx, x - 12, y - 14, 24, 10, '#5d5549', '#837964', '#302a23');
        fill(ctx, x - 2, y - 22 + flicker, 4, 8, '#f0b06a');
        fill(ctx, x - 1, y - 25 + flicker, 2, 4, '#ffe0a0');
        ctx.globalAlpha = 0.3;
        fill(ctx, x - 24, y - 10, 48, 4, accent);
        ctx.globalAlpha = 1;
        this.label(this.locale === 'ru' ? 'АЛТАРЬ' : 'ALTAR', x, y + 17, accent);
        break;
      case 'anvil':
        fill(ctx, x - 9, y + 4, 18, 5, '#4a3527');
        box(ctx, x - 12, y - 3, 24, 8, '#535960', '#8c9298', '#292e33');
        fill(ctx, x - 15, y - 5, 12, 3, '#6d747b');
        fill(ctx, x + 5, y - 5, 10, 3, '#6d747b');
        ctx.globalAlpha = 0.4;
        fill(ctx, x - 10, y - 8, 20, 1, '#e5813a');
        ctx.globalAlpha = 1;
        break;
      case 'rack':
        box(ctx, x - 8, y - 18, 16, 38, '#4a3527', '#6b4c31', '#2a1f17');
        fill(ctx, x - 4, y - 14, 2, 28, '#a8b2b8');
        fill(ctx, x + 2, y - 12, 2, 24, '#c8c9c0');
        fill(ctx, x + 5, y - 10, 2, 20, '#8f7cc9');
        break;
      case 'hay':
        fill(ctx, x - 13, y - 4, 26, 10, '#8a6f45');
        fill(ctx, x - 10, y - 8, 20, 5, '#b99856');
        fill(ctx, x - 6, y - 11, 13, 4, '#d0ad64');
        for (let i = -10; i <= 10; i += 5) fill(ctx, x + i, y - 5, 1, 8, '#6b5433');
        break;
      case 'wardrobe':
        box(ctx, x - 13, y - 22, 26, 42, '#513a53', '#765983', '#2b2030');
        fill(ctx, x - 10, y - 18, 9, 34, '#34283a');
        fill(ctx, x + 1, y - 18, 9, 34, '#3c2d43');
        fill(ctx, x - 1, y - 19, 2, 36, accent);
        fill(ctx, x - 6, y - 2, 2, 2, '#d6b8ff');
        fill(ctx, x + 4, y - 2, 2, 2, '#d6b8ff');
        break;
      case 'stand': {
        const skin = getSkin(this.storage.data.equippedSkin);
        const body = skin?.color ?? '#9a9a94';
        const trim = skin?.accent ?? '#c9c4b4';
        fill(ctx, x - 9, y + 12, 18, 3, '#3b342c');
        fill(ctx, x - 1, y - 6, 2, 18, '#6b5a47');
        box(ctx, x - 7, y - 17, 14, 12, body, trim, '#2b2724');
        fill(ctx, x - 3, y - 14, 6, 1, trim);
        fill(ctx, x - 2, y - 9, 4, 2, '#1b1a1c');
        ctx.globalAlpha = 0.25;
        fill(ctx, x - 12, y - 20, 24, 34, trim);
        ctx.globalAlpha = 1;
        this.label(this.locale === 'ru' ? 'СКИНЫ' : 'SKINS', x, y + 21, accent);
        break;
      }
      case 'brazier':
        fill(ctx, x - 7, y + 6, 14, 3, '#2a2c30');
        fill(ctx, x - 1, y - 2, 2, 9, '#51452f');
        box(ctx, x - 8, y - 6, 16, 6, '#4a4b50', '#74777d', '#25272b');
        fill(ctx, x - 5, y - 9 + flicker, 10, 5, '#e5813a');
        fill(ctx, x - 2, y - 13 + flicker, 5, 6, '#f0b06a');
        fill(ctx, x - 1, y - 16 + flicker, 2, 4, '#ffe0a0');
        break;
      case 'crate':
        box(ctx, x - 8, y - 8, 16, 16, '#6a4c31', '#8a6f45', '#3d2b1c');
        fill(ctx, x - 8, y - 1, 16, 2, '#3d2b1c');
        fill(ctx, x - 1, y - 8, 2, 16, '#3d2b1c');
        break;
      case 'table':
        box(ctx, x - 13, y - 5, 26, 6, '#6a4c31', '#8a6f45', '#3d2b1c');
        fill(ctx, x - 10, y + 1, 3, 9, '#493422');
        fill(ctx, x + 7, y + 1, 3, 9, '#493422');
        break;
      case 'books':
        box(ctx, x - 12, y - 20, 24, 38, '#4a3527', '#6b4c31', '#2a1f17');
        for (let i = 0; i < 4; i += 1) {
          const shelfY = y - 16 + i * 9;
          fill(ctx, x - 9, shelfY, 3, 7, i % 2 === 0 ? '#8f3636' : '#5b6d8a');
          fill(ctx, x - 5, shelfY + 1, 3, 6, '#b6a988');
          fill(ctx, x - 1, shelfY, 2, 7, '#7d9b6c');
          fill(ctx, x + 3, shelfY + 1, 5, 6, '#8a69ad');
        }
        break;
      case 'cauldron':
        fill(ctx, x - 10, y + 4, 20, 3, '#2a2c30');
        box(ctx, x - 11, y - 6, 22, 11, '#2c3235', '#4a5256', '#121517');
        fill(ctx, x - 8, y - 8, 16, 3, '#8fbf63');
        ctx.globalAlpha = 0.35;
        fill(ctx, x - 6, y - 12 + flicker, 12, 4, '#8fbf63');
        ctx.globalAlpha = 1;
        break;
      case 'carpet':
        break;
    }
  }

  private drawNpcs(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const room of ROOMS) {
      const npc = room.npc;
      if (!this.visible(npc.x - 20, npc.y - 24, 40, 48)) continue;
      const x = Math.round(npc.x - camX);
      const y = Math.round(npc.y - camY);
      ctx.globalAlpha = 0.34;
      fill(ctx, x - 9, y + 11, 18, 4, '#050608');
      ctx.globalAlpha = 1;
      const sprite = characterSprite(`class:${npc.classId}`);
      ctx.drawImage(sprite, x - 16, y - 18, 32, 32);
      this.label(this.loc(npc.name), x, y + 19, '#d8d3c7');
    }
  }

  private drawAnimals(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const animal of this.animals) {
      if (!this.visible(animal.x - 12, animal.y - 12, 24, 24)) continue;
      const x = Math.round(animal.x - camX);
      const y = Math.round(animal.y - camY);
      ctx.globalAlpha = 0.25;
      fill(ctx, x - animal.size, y + 3, animal.size * 2, 3, '#050608');
      ctx.globalAlpha = 1;
      if (animal.kind === 'rat') {
        fill(ctx, x - 4, y - 2, 8, 4, '#6b6860');
        fill(ctx, x - 5, y - 4, 2, 2, '#8f8a7d');
        fill(ctx, x + 3, y - 4, 2, 2, '#8f8a7d');
        fill(ctx, x + 4, y, 4, 1, '#8f8a7d');
        fill(ctx, x + 3, y - 1, 1, 1, '#c9a24b');
      } else if (animal.kind === 'crow') {
        const flap = Math.sin(animal.phase) > 0 ? 3 : 1;
        fill(ctx, x - 6, y - flap, 12, 3, '#20242a');
        fill(ctx, x - 3, y - 3, 6, 5, '#30363e');
        fill(ctx, x + 3, y - 3, 2, 1, '#c9a24b');
        if (Math.sin(animal.phase) > 0) fill(ctx, x - 2, y - 6, 4, 2, '#454d57');
      } else {
        fill(ctx, x - 9, y - 6, 18, 12, '#c9c4b4');
        fill(ctx, x - 7, y - 8, 5, 4, '#e0ddd0');
        fill(ctx, x + 2, y - 8, 5, 4, '#e0ddd0');
        fill(ctx, x + 7, y - 3, 4, 5, '#8f8a7d');
        fill(ctx, x + 8, y - 2, 1, 1, '#2a2c30');
        fill(ctx, x - 6, y + 4, 3, 3, '#8f8a7d');
        fill(ctx, x + 3, y + 4, 3, 3, '#8f8a7d');
      }
    }
  }

  private drawPlayer(camX: number, camY: number): void {
    if (!this.player) return;
    const ctx = this.ctx;
    const x = Math.round(this.player.x - camX);
    const y = Math.round(this.player.y - camY);
    const bob = Math.sin(this.walkPhase) * (Math.abs(Math.sin(this.walkPhase)) > 0.7 ? 1 : 0);
    ctx.globalAlpha = 0.35;
    fill(ctx, x - 9, y + 12, 18, 4, '#050608');
    ctx.globalAlpha = 1;
    ctx.drawImage(this.playerSprite(), x - 16, y - 17 + bob, 32, 32);
    const cls = getClass(this.storage.data.classId);
    const chosen = getWeapon(this.storage.data.weaponId);
    const weapon: WeaponDef = chosen.classId === cls.id ? chosen : getWeapon(cls.starter);
    drawHeldWeapon(
      ctx, weapon,
      x + Math.cos(this.player.facing) * 7,
      y + Math.sin(this.player.facing) * 7 + bob,
      this.player.facing,
      0.62,
    );
  }

  private playerSprite(): HTMLCanvasElement {
    const base = characterSprite(`class:${this.storage.data.classId}`);
    const skinId = this.storage.data.equippedSkin ?? '';
    const key = `${this.storage.data.classId}:${skinId}`;
    const cached = this.spriteCache.get(key);
    if (cached) return cached;
    const skin = getSkin(this.storage.data.equippedSkin);
    if (!skin) return base;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return base;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.55;
    fill(ctx, 0, 0, 32, 32, skin.color);
    ctx.globalAlpha = 0.3;
    fill(ctx, 0, 2, 32, 14, skin.accent);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.spriteCache.set(key, canvas);
    return canvas;
  }

  private drawParticles(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const particle of this.particles) {
      const x = Math.round(particle.x - camX);
      const y = Math.round(particle.y - camY);
      if (x < -8 || x > VIEW_W + 8 || y < -8 || y > VIEW_H + 8) continue;
      ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
      fill(ctx, x - 1, y - 1, 2, 2, particle.color);
    }
    ctx.globalAlpha = 1;
  }

  private drawLighting(camX: number, camY: number): void {
    if (!this.graphics.lighting) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,8,0.34)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'lighter';
    const glow = (worldX: number, worldY: number, radius: number, rgb: string, alpha: number): void => {
      const x = worldX - camX;
      const y = worldY - camY;
      if (x < -radius || x > VIEW_W + radius || y < -radius || y > VIEW_H + radius) return;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
      gradient.addColorStop(0.5, `rgba(${rgb},${alpha * 0.36})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    if (this.player) glow(this.player.x, this.player.y, 62, '255,205,130', 0.08);
    for (const light of this.lights) {
      if (!this.visible(light.x - light.r, light.y - light.r, light.r * 2, light.r * 2)) continue;
      const flicker = 0.82 + Math.sin(this.time * 6 + light.phase) * 0.18;
      glow(light.x, light.y, light.r, light.color, 0.13 * flicker);
    }
    ctx.restore();
  }

  private drawHud(): void {
    const ctx = this.ctx;
    box(ctx, 6, 6, 176, 30, 'rgba(11,13,16,0.86)', '#3b3f47', '#0a0b0d');
    this.label(this.loc({ ru: 'УБЕЖИЩЕ · БАЗА', en: 'HUB · BASE' }), 14, 14, '#c9a24b', 'left');
    const skin = getSkin(this.storage.data.equippedSkin);
    const skinText = skin ? skin.name : this.loc({ ru: 'СКИН: ПО УМОЛЧАНИЮ', en: 'SKIN: DEFAULT' });
    this.label(`${this.locale === 'ru' ? 'СКИН' : 'SKIN'}: ${skinText}`, 14, 26, '#d8d3c7', 'left');

    const binding = this.storage.data.bindings.interact;
    const key = binding === ' ' ? (this.locale === 'en' ? 'SPACE' : 'ПРОБЕЛ') : keyLabel(binding);
    const keys = this.locale === 'en' ? `${key} / E / SPACE` : `${key} / E / ПРОБЕЛ`;
    if (this.focus) {
      const text = `${this.loc(this.focus.label)} [${keys}]`;
      ctx.font = '7px monospace';
      const width = Math.min(VIEW_W - 20, ctx.measureText(text).width + 14);
      const x = Math.round((VIEW_W - width) / 2);
      const y = VIEW_H - 28;
      box(ctx, x, y, width, 16, 'rgba(11,13,16,0.9)', '#c9a24b', '#07080a');
      this.label(text, VIEW_W / 2, y + 8, '#f0d68a');
      const fx = Math.round(this.focus.x - this.camX);
      const fy = Math.round(this.focus.y - this.camY - 22);
      if (fx > 20 && fx < VIEW_W - 20 && fy > 20 && fy < VIEW_H - 20) {
        this.label(`[${keys}]`, fx, fy, '#f0d68a');
      }
    } else {
      const help = this.loc({
        ru: `WASD / Джойстик · ${keys} — действие`,
        en: `WASD / Joystick · ${keys} — interact`,
      });
      this.label(help, VIEW_W / 2, VIEW_H - 12, '#8a8d94');
    }
  }

  private drawMinimap(): void {
    const ctx = this.ctx;
    const x = VIEW_W - 78;
    const y = VIEW_H - 60;
    const w = 68;
    const h = 42;
    ctx.globalAlpha = 0.86;
    fill(ctx, x, y, w, h, '#0b0d10');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#2a2f37';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const sx = w / WORLD_W;
    const sy = h / WORLD_H;
    for (const room of ROOMS) {
      fill(ctx, x + room.x * sx, y + room.y * sy, room.w * sx, room.h * sy, room.accent);
    }
    fill(ctx, x + 1450 * sx - 2, y + 520 * sy - 2, 4, 4, '#7ce0d0');
    fill(ctx, x + 800 * sx - 2, y + 900 * sy - 2, 4, 4, '#e05a5a');
    ctx.strokeStyle = '#d8d3c7';
    ctx.strokeRect(x + this.camX * sx, y + this.camY * sy, VIEW_W * sx, VIEW_H * sy);
    if (this.player) {
      fill(ctx, x + this.player.x * sx - 1, y + this.player.y * sy - 1, 3, 3, '#f0d68a');
    }
  }

  private label(text: string, x: number, y: number, color = '#d8d3c7', align: CanvasTextAlign = 'center'): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '7px monospace';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    fill(ctx, Math.round(x) + 1, Math.round(y) + 1, 0, 0, '#050608');
    ctx.fillStyle = '#050608';
    ctx.fillText(text, Math.round(x) + 1, Math.round(y) + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(x), Math.round(y));
    ctx.restore();
  }
}
