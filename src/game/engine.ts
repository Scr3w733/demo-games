import { CAMPAIGN_CLEAR_TIME, campaignLevel as getCampaignLevel } from './campaign';
import {
  BIOMES,
  BIOME_DURATION,
  DASH_COOLDOWN,
  ENEMIES,
  HEAL_CHARGES,
  HEAL_COOLDOWN,
  abilityForSlot,
  formatTime,
  getClass,
  getMode,
  getModule,
  getSkin,
  getWeapon,
  keyLabel,
  lockedWeapons,
  MAX_PROFILE_LEVEL,
  MODULES,
  rollUpgrades,
  weaponsForClass,
} from './config';
import { CC0_PATHS, cc0Image, preloadCc0 } from './assets';
import { drawHeldWeapon, characterSprite, portalSprite, treeSprite } from './sprites';
import type { Sound } from './audio';
import type { Input } from './input';
import type { Storage } from './storage';
import { clearTempShop, loadTempShop, saveTempShop } from './tempShopDb';
import type { TempShopContext, TempShopOffer, TempWeaponEntry } from './tempShopDb';
import type { Yandex } from './yandex';
import type {
  AbilitySlot,
  AbilitySlotState,
  BiomeDef,
  ClassId,
  CrosshairSettings,
  EnemyDef,
  RunResult,
  Stats,
  StatusId,
  UpgradeDef,
  WeaponDef,
  WeaponSpecials,
} from './types';

export interface HudState {
  time: string;
  remaining: number | null;
  hint: string;
  hintKey: string;
  light: number;
  flashlightOn: boolean;
  wave: number;
  kills: number;
  coins: number;
  diamonds: number;
  hp: number;
  maxHp: number;
  armor: number;
  crit: number;
  armorSet: boolean;
  xp: number;
  xpNext: number;
  level: number;
  weaponName: string;
  biomeName: string;
  modeName: string;
  arena: number;
  abilities: AbilitySlotState[];
  statuses: Array<{ id: StatusId; label: string; remaining: number }>;
}

export interface GameCallbacks {
  hud: (state: HudState) => void;
  levelUp: (choices: UpgradeDef[]) => void;
  gameOver: (result: RunResult) => void;
  toast: (text: string) => void;
  /** Открыть витрину торговца временного оружия открытого мира. */
  tempShop: (ctx: TempShopContext) => void;
}

type GameState = 'idle' | 'playing' | 'paused' | 'levelup' | 'gameover';

type LightKind = 'candle' | 'lantern' | 'torch' | 'brazier';

interface LightSource {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  phase: number;
}

interface Enemy {
  def: EnemyDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  size: number;
  flash: number;
  slow: number;
  burn: number;
  burnDamage: number;
  bleed: number;
  bleedDamage: number;
  hitCooldown: number;
  attackTimer: number;
  spitTimer: number;
  /** Секунды оставшегося агро: в открытом мире враг бежит только на шум выстрела. */
  aggro: number;
  wobble: number;
  dead: boolean;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  radius: number;
  color: string;
  pierce: number;
  aoe: number;
  homing: boolean;
  specials: WeaponSpecials;
  hit: Set<Enemy>;
}

interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  radius: number;
  color: string;
  status?: StatusId;
}

interface Mine {
  x: number;
  y: number;
  life: number;
  damage: number;
  aoe: number;
  color: string;
  specials: WeaponSpecials;
}

interface Pickup {
  x: number;
  y: number;
  kind: 'xp' | 'hp' | 'coin' | 'chest' | 'light' | 'antidote';
  value: number;
  life: number;
  bob: number;
  lightKind?: LightKind;
  antidote?: StatusId;
}

type Effect =
  | { kind: 'ring'; x: number; y: number; life: number; max: number; r: number; color: string }
  | { kind: 'slash'; x: number; y: number; life: number; max: number; r: number; angle: number; arc: number; color: string }
  | { kind: 'particle'; x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }
  | { kind: 'splat'; x: number; y: number; life: number; max: number; r: number; color: string }
  | { kind: 'text'; x: number; y: number; life: number; max: number; text: string; color: string }
  | { kind: 'crit'; x: number; y: number; life: number; max: number; text: string; color: string };

type AnimalKind = 'rat' | 'crow' | 'bat' | 'beetle' | 'wolf';

interface Animal {
  kind: AnimalKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
}

interface Decoration {
  x: number;
  y: number;
  kind: 'grave' | 'candle' | 'bone' | 'stone' | 'rubble' | 'puddle' | 'brazier'
    | 'shelf' | 'table' | 'rug' | 'torch' | 'lantern'
    | 'grass' | 'bush' | 'flower' | 'mushroom' | 'vine' | 'root' | 'pine' | 'snow';
  tint?: number;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'wall' | 'pillar' | 'barrel' | 'tree' | 'brazier' | 'building' | 'crate' | 'furniture' | 'car';
  hp: number;
}

interface Portal {
  x: number;
  y: number;
  used: boolean;
}

interface DungeonState {
  centerX: number;
  centerY: number;
  returnX: number;
  returnY: number;
  active: boolean;
  cleared: boolean;
  spawned: number;
}

interface CityBuilding {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  style: 'hospital' | 'archive' | 'morgue' | 'crypt' | 'forge' | 'barracks' | 'tower' | 'vault';
  floors: number;
  clearedFloors: number;
  loot: number;
  hasChest: boolean;
  doorX: number;
  doorY: number;
  /** Дом открытого мира: рисуется CC0-тайлами, а не городским фасадом. */
  openWorld?: boolean;
}

/** Одноразовый тайник с добычей в открытом мире. */
interface LootCache {
  id: string;
  x: number;
  y: number;
  kind: 'supply' | 'armory' | 'relic';
  claimed: boolean;
}

interface RoomBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Player {
  x: number;
  y: number;
  hp: number;
  stats: Stats;
  facing: number;
  invuln: number;
  fireTimer: number;
  level: number;
  xp: number;
  xpNext: number;
  coins: number;
  kills: number;
}

const W = 480;
const H = 270;
/** Внутренний буфер 960×540: логика остаётся 480×270, но свет и спрайты выглядят чётче. */
const RENDER_SCALE = 2;
/** Масштабные карты: кампания почти в полтора раза больше, город — втрое. */
const WORLD_W = 2880;
const WORLD_H = 2040;
const PLAYER_RADIUS = 7;
/** Игровая клетка equals одному тайлу карты. */
const TILE_SIZE = 16;
/** Зомби слышат выстрел в радиусе 7 клеток (7 × 16 = 112 world units). */
const GUN_NOISE_RADIUS = 7 * TILE_SIZE;
const AGGRO_MEMORY = 6;
const CITY_WORLD_MUL = 3;
const STATUS_LABELS: Record<StatusId, string> = {
  poison: 'ОТРАВЛЕНИЕ', burn: 'ГОРЕНИЕ', infection: 'ЗАРАЗА',
};
const STATUS_COLORS: Record<StatusId, string> = {
  poison: '#78c05a', burn: '#e5813a', infection: '#b06bd8',
};
const STATUS_DURATION: Record<StatusId, number> = {
  poison: 7, burn: 5.5, infection: 9,
};
const STATUS_DAMAGE: Record<StatusId, number> = {
  poison: 2.5, burn: 4, infection: 1.8,
};
const ANTIDOTE_COLOR: Record<StatusId, string> = {
  poison: '#78c05a', burn: '#e5813a', infection: '#b06bd8',
};
const CITY_GROUND: [string, string, string, string] = ['#22262b', '#1b1f24', '#15191d', '#101317'];
const INTERIOR_GROUND: [string, string, string, string] = ['#312b24', '#29241f', '#211d19', '#181613'];
const LIGHT_NAMES: Record<LightKind, string> = {
  candle: 'Свеча', lantern: 'Фонарь', torch: 'Факел', brazier: 'Горелка',
};
const LIGHT_FUEL: Record<LightKind, number> = {
  candle: 14, lantern: 28, torch: 22, brazier: 42,
};
/** RGB-триплеты для мягких ADD-бликов поверх затемнения. */
const LIGHT_RGB: Record<LightKind, string> = {
  candle: '255,186,104', lantern: '255,205,130', torch: '255,142,66', brazier: '255,120,48',
};
const LIGHT_RADIUS: Record<LightKind, number> = {
  candle: 36, lantern: 52, torch: 64, brazier: 86,
};

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class Game {
  state: GameState = 'idle';
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: GameCallbacks;
  private worldW = WORLD_W;
  private worldH = WORLD_H;
  private raf = 0;
  private lastFrame = 0;
  private externalFrame: ((dt: number) => void) | null = null;

  private player: Player | null = null;
  private weapon: WeaponDef = getWeapon('soldier_rifle');
  private classId: ClassId = 'soldier';
  private modeId = 'classic';
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private mines: Mine[] = [];
  private pickups: Pickup[] = [];
  private effects: Effect[] = [];
  private decorations: Decoration[] = [];
  private animals: Animal[] = [];
  private lights: LightSource[] = [];
  private statuses: Record<StatusId, number> = { poison: 0, burn: 0, infection: 0 };
  private armorSet = false;
  private moveTrail: Array<{ x: number; y: number; life: number; max: number }> = [];
  private statusTick = 0;
  private readonly lightCanvas = document.createElement('canvas');
  private readonly lightCtx: CanvasRenderingContext2D;
  private flashlightOn = true;
  private lightBattery = 100;
  private taken: Record<string, number> = {};
  private pendingLevels = 0;

  private time = 0;
  private wave = 1;
  private spawnTimer = 0;
  private bossTimer = 0;
  private reviveUsed = false;
  private camX = 0;
  private camY = 0;

  private cooldowns: Record<string, number> = {};
  private rage = 0;
  private rapid = 0;
  private shield = 0;
  private healCharges = HEAL_CHARGES;
  private healCd = 0;
  private biomeIndex = 0;
  private arena = 1;
  private campaignLevel = 1;
  private campaignVictory = false;
  private location = getCampaignLevel(1);
  private obstacles: Obstacle[] = [];
  private portals: Portal[] = [];
  private dungeon: DungeonState | null = null;
  private chest: { x: number; y: number } | null = null;
  /** Торговец временным оружием: только в открытом мире, только в текущем забеге. */
  private merchant: { x: number; y: number } | null = null;
  /** Тайники открытого мира: добыча сохраняется в профиле после первого нахождения. */
  private lootCaches: LootCache[] = [];
  private tempWeapon: TempWeaponEntry | null = null;
  private cityBuildings: CityBuilding[] = [];
  private activeBuilding: CityBuilding | null = null;
  private interiorFloor = 0;
  private interiorStairs: { x: number; y: number } | null = null;
  private interiorExit: { x: number; y: number } | null = null;
  private interiorChest: { x: number; y: number } | null = null;
  private interiorCleared = false;
  private roomBounds: RoomBounds | null = null;
  private streetX = 0;
  private streetY = 0;
  private interactHint = '';
  private interactRequested = false;
  private interiorEnemyScale = 1;
  private interiorW = 640;
  private interiorH = 500;
  private shake = 0;
  private stepTimer = 0;
  private ambientTimer = 4;
  private walking = false;
  /** Сглаженная отдача оружия: не дёргается при высокой скорострельности. */
  private weaponKick = 0;
  private showMinimap = true;
  /** Трава, прижатая игроком: ключ — номер тайла, 값 — направление и сила изгиба. */
  private trampled = new Map<number, { bx: number; by: number; life: number }>();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly input: Input,
    private readonly sound: Sound,
    private readonly storage: Storage,
    private readonly yandex: Yandex,
    callbacks: GameCallbacks,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D недоступен');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    this.lightCanvas.width = W * RENDER_SCALE;
    this.lightCanvas.height = H * RENDER_SCALE;
    const lightCtx = this.lightCanvas.getContext('2d', { alpha: true });
    if (!lightCtx) throw new Error('Canvas 2D недоступен для света');
    this.lightCtx = lightCtx;
    this.lightCtx.imageSmoothingEnabled = false;
    this.callbacks = callbacks;
    preloadCc0([CC0_PATHS.floor, CC0_PATHS.topdown, CC0_PATHS.jungle]);
    this.generateLevel(0);
    this.raf = requestAnimationFrame(this.loop);
  }

  private get graphics() {
    return this.storage.data.graphics ?? {
      quality: 'high' as const, blood: true, particles: true, lighting: true,
      vegetation: true, animals: true, shake: true, festive: false, motionBlur: true,
    };
  }

  private get crosshair(): CrosshairSettings {
    return this.storage.data.crosshair ?? { enabled: true, style: 'cross' };
  }

  private get qualityScale(): number {
    const quality = this.graphics.quality;
    if (quality === 'low') return 0.55;
    if (quality === 'medium') return 0.8;
    if (quality === 'ultra') return 1.45;
    return 1;
  }

  private get festive(): boolean {
    return Boolean(this.graphics.festive);
  }

  private get biome(): BiomeDef {
    if (this.mode?.openWorld && this.player) return BIOMES[this.biomeIndexAt(this.player.x, this.player.y)];
    return BIOMES[this.biomeIndex];
  }

  private get mode() {
    return getMode(this.modeId);
  }

  private get shotColor(): string | null {
    const skin = getSkin(this.storage.data.equippedSkin);
    return skin?.accent ?? null;
  }

  /** Постройки базы дают постоянные бонусы ко всем забегам. */
  private applyBaseBonuses(stats: Stats): Stats {
    const up = this.storage.data.baseUpgrades;
    stats.maxHp += (up.hearth ?? 0) * 8;
    stats.damage *= 1 + (up.forge ?? 0) * 0.04;
    stats.regen += (up.greenhouse ?? 0) * 0.35;
    stats.pickup += (up.beacon ?? 0) * 6;
    return stats;
  }

  /** Модули применяются один раз в начале забега. Полный комплект брони даёт крит. */
  private applyModules(stats: Stats): Stats {
    const equipped = new Set(this.storage.data.equippedModules);
    this.armorSet = equipped.has('mod_plating') && equipped.has('mod_patch');
    if (this.armorSet) {
      stats.armor += 1;
      stats.crit += 0.15;
    }
    for (const id of this.storage.data.equippedModules) {
      const module = getModule(id);
      if (!module) continue;
      for (const [key, value] of Object.entries(module.stats) as Array<[keyof Stats, number]>) {
        const additive = ['maxHp', 'armor', 'regen', 'burn', 'slow', 'crit', 'lifesteal'].includes(key);
        if (additive) stats[key] += value;
        else stats[key] *= value;
      }
    }
    return stats;
  }

  /** Полностью пересобирает арену под выбранную локацию кампании. */
  private generateLevel(arenaOffset: number): void {
    this.trampled.clear();
    this.location = getCampaignLevel(this.campaignLevel + arenaOffset);
    this.biomeIndex = this.location.biomeIndex;
    this.merchant = null;
    this.lootCaches = [];
    if (this.mode.city) {
      this.generateCity();
      return;
    }
    if (this.mode.openWorld) {
      this.generateOpenWorld();
      return;
    }
    this.worldW = WORLD_W;
    this.worldH = WORLD_H;
    const biome = this.biome;
    this.decorations = [];
    this.obstacles = [];
    this.animals = [];
    this.portals = [];
    const seed = this.location.level * 37 + arenaOffset * 11;
    const px = this.player?.x ?? this.worldW / 2;
    const py = this.player?.y ?? this.worldH / 2;

    for (let gx = 0; gx < this.worldW / 16; gx += 1) {
      for (let gy = 0; gy < this.worldH / 16; gy += 1) {
        const h = hash(gx + seed, gy + seed * 2);
        let kind: Decoration['kind'] | null = null;
        switch (biome.decor) {
          case 'grave':
            if (h > 0.979) kind = 'grave';
            else if (h > 0.94) kind = 'bone';
            else if (h < 0.02) kind = 'candle';
            break;
          case 'stone':
            if (h > 0.95) kind = 'stone';
            else if (h < 0.025) kind = 'candle';
            break;
          case 'rubble':
            if (h > 0.945) kind = 'rubble';
            else if (h < 0.02) kind = 'bone';
            break;
          case 'candle':
            if (h > 0.94) kind = 'candle';
            else if (h < 0.03) kind = 'stone';
            break;
          case 'puddle':
            if (h > 0.9) kind = 'puddle';
            else if (h < 0.02) kind = 'bone';
            break;
          case 'bone':
            if (h > 0.92) kind = 'bone';
            else if (h > 0.88) kind = 'brazier';
            break;
        }
        if (kind) this.decorations.push({ x: gx * 16 + 8, y: gy * 16 + 8, kind });
      }
    }
    this.spawnVegetation(620, 24);
    this.spawnForestGroves(26, 24);
    // Регулярные источники света: не дают арене стать сплошным чёрным полем.
    for (let i = 0; i < 26; i += 1) {
      const x = 50 + hash(i + seed, 101) * (this.worldW - 100);
      const y = 50 + hash(107, i + seed) * (this.worldH - 100);
      if (Math.hypot(x - px, y - py) < 70) continue;
      this.decorations.push({ x: Math.round(x), y: Math.round(y), kind: i % 4 === 0 ? 'torch' : 'candle' });
    }
    for (let i = 0; i < 12; i += 1) {
      this.decorations.push({
        x: Math.round(110 + hash(i + seed, 113) * (this.worldW - 220)),
        y: Math.round(110 + hash(119, i + seed) * (this.worldH - 220)),
        kind: 'rug',
      });
    }

    const pattern = biome.obstacle;
    const count = pattern === 'maze' ? 74 : pattern === 'throne' ? 48 : 38;
    for (let i = 0; i < count; i += 1) {
      const rx = 50 + hash(i + seed, 7) * (this.worldW - 120);
      const ry = 50 + hash(13, i + seed) * (this.worldH - 120);
      if (Math.hypot(rx - px, ry - py) < 100) continue;
      let w = 16;
      let h = 16;
      let kind: Obstacle['kind'] = 'wall';
      let hp = 0;
      switch (pattern) {
        case 'walls':
          w = hash(i, seed) > 0.5 ? 48 : 32;
          h = 8;
          break;
        case 'maze':
          if (i % 2 === 0) { w = 8; h = 56; } else { w = 56; h = 8; }
          break;
        case 'ruins':
          if (i % 3 === 0) { w = 16; h = 16; kind = 'barrel'; hp = 26; } else { w = 34; h = 8; }
          break;
        case 'pillars':
          w = 14;
          h = 14;
          kind = 'pillar';
          break;
        case 'trees':
          w = 14;
          h = 14;
          kind = 'tree';
          break;
        case 'throne':
          if (i % 4 === 0) { w = 12; h = 12; kind = 'brazier'; } else { w = 16; h = 16; kind = 'pillar'; }
          break;
      }
      this.obstacles.push({ x: Math.round(rx), y: Math.round(ry), w, h, kind, hp });
    }

    this.portals = [
      { x: clamp(px - 330, 50, this.worldW - 50), y: clamp(py - 230, 50, this.worldH - 50), used: false },
      { x: clamp(px + 330, 50, this.worldW - 50), y: clamp(py + 230, 50, this.worldH - 50), used: false },
    ];
    this.obstacles = this.obstacles.filter(
      (obstacle) => !this.portals.some((portal) =>
        Math.hypot(obstacle.x + obstacle.w / 2 - portal.x, obstacle.y + obstacle.h / 2 - portal.y) < 40),
    );
    this.spawnAntidotes(5, seed);
    this.spawnAnimals(14, seed);
    this.refreshLights();
  }

  // ---------------------------------------------------------------- город: зачистка

  private cityEnemyScale(building: CityBuilding, floor = 1): number {
    const gate = this.storage.data.baseUpgrades.gate ?? 0;
    return Math.max(1, 1 + building.floors * 0.14 + floor * 0.08 - gate * 0.04);
  }

  private cityRoadX(col: number): number {
    return 120 + col * ((this.worldW - 240) / 9) - 24;
  }

  private cityRoadY(row: number): number {
    return 120 + row * ((this.worldH - 240) / 6) - 24;
  }

  private isCityRoad(x: number, y: number): boolean {
    const cellW = (this.worldW - 240) / 9;
    const cellH = (this.worldH - 240) / 6;
    const dx = ((x - 120 + 24) % cellW + cellW) % cellW;
    const dy = ((y - 120 + 24) % cellH + cellH) % cellH;
    return dx < 34 || dy < 34;
  }

  private isOpenRoad(x: number, y: number): boolean {
    const dx = ((x + 12) % 960 + 960) % 960;
    const dy = ((y + 12) % 720 + 720) % 720;
    return dx < 26 || dy < 26;
  }

  /** Открытый мир: биомы задаются координатами, а не таймером волн. */
  private biomeIndexAt(x: number, y: number): number {
    const bx = Math.floor(x / 720) + this.campaignLevel;
    const by = Math.floor(y / 540) + this.campaignLevel * 3;
    return Math.floor(hash(bx, by) * BIOMES.length) % BIOMES.length;
  }

  /** Ограниченный открытый город: 54 здания, улицы и замурованные границы. */
  private generateCity(keepBuildings = false): void {
    this.worldW = WORLD_W * CITY_WORLD_MUL;
    this.worldH = WORLD_H * CITY_WORLD_MUL;
    this.lootCaches = [];
    this.trampled.clear();
    this.decorations = [];
    this.obstacles = [];
    this.animals = [];
    this.portals = [];
    this.chest = null;
    this.dungeon = null;
    this.roomBounds = null;
    this.interactHint = '';
    this.activeBuilding = null;
    this.interiorFloor = 0;
    this.interiorStairs = null;
    this.interiorExit = null;
    this.interiorChest = null;
    this.interiorCleared = false;
    this.interiorEnemyScale = 1;

    if (!keepBuildings || this.cityBuildings.length === 0) {
      this.cityBuildings = [];
      const names = ['Госпиталь', 'Архив', 'Морг', 'Крипта', 'Мастерская', 'Казарма', 'Башня', 'Склеп'];
      const styles: CityBuilding['style'][] = ['hospital', 'archive', 'morgue', 'crypt', 'forge', 'barracks', 'tower', 'vault'];
      const cols = 9;
      const rows = 6;
      const cellW = (this.worldW - 240) / cols;
      const cellH = (this.worldH - 240) / rows;
      let id = 1;
      for (let col = 0; col < cols; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          const x = Math.round(120 + col * cellW + (cellW - 300) / 2);
          const y = Math.round(120 + row * cellH + (cellH - 260) / 2);
          const floors = 1 + ((col * 2 + row * 3 + 1) % 5);
          const kindIndex = (col + row * 3) % names.length;
          this.cityBuildings.push({
            id: id++, x, y, w: 300, h: 260,
            name: `${names[kindIndex]} ${col + 1}-${row + 1}`,
            style: styles[kindIndex],
            floors,
            clearedFloors: 0,
            loot: 0,
            hasChest: hash(col * 17 + 3, row * 29 + 7) < 0.72,
            doorX: x + 150,
            doorY: y + 274,
          });
        }
      }
    }

    const border = 24;
    this.obstacles.push(
      { x: 0, y: 0, w: this.worldW, h: border, kind: 'wall', hp: 0 },
      { x: 0, y: this.worldH - border, w: this.worldW, h: border, kind: 'wall', hp: 0 },
      { x: 0, y: 0, w: border, h: this.worldH, kind: 'wall', hp: 0 },
      { x: this.worldW - border, y: 0, w: border, h: this.worldH, kind: 'wall', hp: 0 },
    );
    for (const building of this.cityBuildings) {
      this.obstacles.push({ x: building.x, y: building.y, w: building.w, h: building.h, kind: 'building', hp: 0 });
    }
    // Разбитые машины и уличные останки на дорогах — город выглядит живым и опасным.
    const carCount = Math.round(58 * this.qualityScale);
    for (let i = 0; i < carCount; i += 1) {
      const vertical = i % 2 === 0;
      const col = 1 + Math.floor(hash(i, 71) * 8);
      const row = 1 + Math.floor(hash(i, 79) * 5);
      const roadX = this.cityRoadX(col);
      const roadY = this.cityRoadY(row);
      const x = vertical ? roadX + (hash(i, 73) - 0.5) * 20 : 150 + hash(i, 83) * (this.worldW - 300);
      const y = vertical ? 150 + hash(i, 89) * (this.worldH - 300) : roadY + (hash(i, 97) - 0.5) * 20;
      this.obstacles.push({ x: Math.round(x), y: Math.round(y), w: 22, h: 12, kind: 'car', hp: 0 });
      if (i % 5 === 0) {
        this.decorations.push({ x: Math.round(x + 18), y: Math.round(y + 10), kind: 'rubble' });
      }
    }
    this.spawnVegetation(420, 30);
    for (let i = 0; i < 320; i += 1) {
      const x = 40 + hash(i, 21) * (this.worldW - 100);
      const y = 40 + hash(31, i) * (this.worldH - 100);
      const inBuilding = this.cityBuildings.some((b) =>
        x > b.x - 26 && x < b.x + b.w + 26 && y > b.y - 26 && y < b.y + b.h + 36);
      if (inBuilding) continue;
      if (Math.hypot(x - this.worldW / 2, y - this.worldH / 2) < 130) continue;
      if (i % 9 === 0) {
        this.obstacles.push({
          x: Math.round(x), y: Math.round(y), w: 10, h: 10, kind: 'brazier', hp: 0,
        });
      } else if (i % 3 === 0) {
        this.obstacles.push({
          x: Math.round(x), y: Math.round(y), w: 14, h: 14,
          kind: i % 6 === 0 ? 'crate' : 'barrel', hp: 22,
        });
      } else {
        this.decorations.push({ x: Math.round(x), y: Math.round(y), kind: i % 2 === 0 ? 'rubble' : 'bone' });
      }
    }
    this.spawnAntidotes(18, Math.floor(this.worldW));
    this.spawnAnimals(30, Math.floor(this.worldH));
    this.refreshLights();
    if (keepBuildings) return;
    for (let i = 0; i < 160; i += 1) {
      const x = 40 + hash(i, 47) * (this.worldW - 100);
      const y = 40 + hash(53, i) * (this.worldH - 100);
      if (this.cityBuildings.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)) continue;
      this.pickups.push({
        x, y,
        kind: i % 2 === 0 ? 'coin' : 'xp',
        value: i % 2 === 0 ? 8 + (i % 5) * 2 : 6,
        life: 600,
        bob: i,
      });
    }
    const lightKinds: LightKind[] = ['candle', 'lantern', 'torch', 'brazier'];
    for (let i = 0; i < 60; i += 1) {
      const x = 60 + hash(i, 61) * (this.worldW - 120);
      const y = 60 + hash(67, i) * (this.worldH - 120);
      if (this.cityBuildings.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)) continue;
      this.pickups.push({
        x, y, kind: 'light', value: 0, life: 900, bob: i,
        lightKind: lightKinds[i % lightKinds.length],
      });
    }
    this.refreshLights();
  }

  /** Открытый мир: одна большая карта, биомы и дороги заданы координатами. */
  private generateOpenWorld(keepBuildings = false): void {
    this.worldW = WORLD_W * 5;
    this.worldH = WORLD_H * 5;
    this.trampled.clear();
    this.decorations = [];
    this.obstacles = [];
    this.animals = [];
    this.portals = [];
    this.chest = null;
    this.dungeon = null;
    this.roomBounds = null;
    this.interactHint = '';
    this.activeBuilding = null;
    this.interiorFloor = 0;
    this.interiorStairs = null;
    this.interiorExit = null;
    this.interiorChest = null;
    this.interiorCleared = false;
    this.interiorEnemyScale = 1;
    if (!keepBuildings) this.cityBuildings = [];

    const border = 24;
    this.obstacles.push(
      { x: 0, y: 0, w: this.worldW, h: border, kind: 'wall', hp: 0 },
      { x: 0, y: this.worldH - border, w: this.worldW, h: border, kind: 'wall', hp: 0 },
      { x: 0, y: 0, w: border, h: this.worldH, kind: 'wall', hp: 0 },
      { x: this.worldW - border, y: 0, w: border, h: this.worldH, kind: 'wall', hp: 0 },
    );

    // Крупные ориентиры: руины, рощи, кладбища и заставы в разных биомах.
    const landmarks = Math.round(44 * this.qualityScale);
    for (let i = 0; i < landmarks; i += 1) {
      const x = 120 + hash(i, 401) * (this.worldW - 240);
      const y = 120 + hash(407, i) * (this.worldH - 240);
      if (Math.hypot(x - this.worldW / 2, y - this.worldH / 2) < 220) continue;
      const index = this.biomeIndexAt(x, y);
      const obstacleKind: Obstacle['kind'] = BIOMES[index].obstacle === 'trees' ? 'tree' : 'pillar';
      const decoKind: Decoration['kind'] = BIOMES[index].decor;
      for (let part = 0; part < 5; part += 1) {
        const ox = x + (hash(i * 5 + part, 411) - 0.5) * 90;
        const oy = y + (hash(413, i * 5 + part) - 0.5) * 90;
        this.obstacles.push({
          x: Math.round(ox), y: Math.round(oy),
          w: obstacleKind === 'tree' ? 14 : 18, h: obstacleKind === 'tree' ? 16 : 18,
          kind: obstacleKind, hp: obstacleKind === 'pillar' ? 40 : 0,
        });
        this.decorations.push({ x: Math.round(ox + 8), y: Math.round(oy + 10), kind: decoKind });
      }
    }

    // С CC0-атласа µFantasy: дома-руины в открытом мире. Разбиваем карту на клетки
    // дорожной сетки и ставим по 2 дома в каждой — иначе дома попадались только за километр от спавна.
    // Каждый дом — полноценный CityBuilding: в него можно войти и зачистить этажи как данж.
    if (!keepBuildings) {
      const names = ['Дом', 'Хижина', 'Склеп', 'Морг', 'Архив', 'Казарма'];
      const styles: CityBuilding['style'][] = ['hospital', 'archive', 'morgue', 'crypt', 'forge', 'barracks', 'tower', 'vault'];
      const cellW = 960;
      const cellH = 720;
      const cols = Math.ceil(this.worldW / cellW);
      const rows = Math.ceil(this.worldH / cellH);
      const cx0 = this.worldW / 2;
      const cy0 = this.worldH / 2;
      let id = 1000;
      const addHouse = (x: number, y: number, seed: number): void => {
        if (x + 40 > this.worldW - 40 || y + 32 > this.worldH - 32) return;
        if (this.isOpenRoad(x, y) || this.hitsObstacle(x, y, 52)) return;
        if (this.cityBuildings.some((b) =>
          Math.abs(b.x + b.w / 2 - x) < 104 && Math.abs(b.y + b.h / 2 - y) < 88)) return;
        const w = 80;
        const h = 64;
        const bx = Math.round(x - w / 2);
        const by = Math.round(y - h / 2);
        this.cityBuildings.push({
          id: id++,
          x: bx, y: by, w, h,
          name: `${names[seed % names.length]} ${id - 1000}`,
          style: styles[seed % styles.length],
          floors: 1 + (seed % 3),
          clearedFloors: 0,
          loot: 0,
          hasChest: hash(seed, 559) < 0.65,
          doorX: x,
          doorY: by + h + 14,
          openWorld: true,
        });
      };
      for (let gy = 0; gy < rows; gy += 1) {
        for (let gx = 0; gx < cols; gx += 1) {
          const cell = gy * cols + gx;
          for (let slot = 0; slot < 2; slot += 1) {
            const seed = cell * 2 + slot;
            const x = Math.round(gx * cellW + 200 + hash(seed, 551) * 560);
            const y = Math.round(gy * cellH + 170 + hash(557, seed) * 390);
            if (Math.hypot(x - cx0, y - cy0) < 180) continue;
            addHouse(x, y, seed);
          }
        }
      }
      // Несколько домов рядом со спавном: чтобы открытый мир сразу выглядел городом.
      addHouse(cx0 - 180, cy0 - 70, 991);
      addHouse(cx0 + 190, cy0 - 80, 992);
      addHouse(cx0 - 200, cy0 + 100, 993);
      addHouse(cx0 + 210, cy0 + 110, 994);
    }
    for (const building of this.cityBuildings) {
      this.obstacles.push({
        x: building.x, y: building.y, w: building.w, h: building.h, kind: 'building', hp: 0,
      });
      this.decorations.push({ x: building.doorX, y: building.doorY - 4, kind: 'lantern', tint: building.id % 3 });
    }

    // Фонари вдоль дорог: и освещение, и читаемые ориентиры в темноте.
    const lampCount = Math.round(90 * this.qualityScale);
    for (let i = 0; i < lampCount; i += 1) {
      const vertical = i % 2 === 0;
      const x = vertical
        ? Math.round(hash(i, 563) * this.worldW / 960) * 960 + 34
        : 120 + hash(i, 569) * (this.worldW - 240);
      const y = vertical
        ? 120 + hash(571, i) * (this.worldH - 240)
        : Math.round(hash(577, i) * this.worldH / 720) * 720 + 34;
      if (this.hitsObstacle(x, y, 6)) continue;
      this.decorations.push({ x, y, kind: 'lantern', tint: i % 3 });
    }

    // Останки транспорта на дорогах: редкие, но заметные ориентиры.
    for (let i = 0; i < 46; i += 1) {
      const vertical = i % 2 === 0;
      const x = vertical ? Math.round(hash(i, 419) * this.worldW / 960) * 960 + 12 : 140 + hash(i, 421) * (this.worldW - 280);
      const y = vertical ? 140 + hash(i, 423) * (this.worldH - 280) : Math.round(hash(i, 427) * this.worldH / 720) * 720 + 12;
      this.obstacles.push({ x: Math.round(x), y: Math.round(y), w: 22, h: 12, kind: 'car', hp: 0 });
    }

    // Торговец временным оружием стоит рядом с точкой спавна: игрок всегда может его найти.
    const cx = this.worldW / 2;
    const cy = this.worldH / 2;
    this.merchant = { x: Math.round(cx + 72), y: Math.round(cy - 44) };
    for (let ring = 0; ring < 6 && this.hitsObstacle(this.merchant.x, this.merchant.y, 22); ring += 1) {
      this.merchant.x = Math.round(cx + 72 + ring * 26);
      this.merchant.y = Math.round(cy - 44 + ring * 26);
    }
    this.decorations.push({ x: this.merchant.x, y: this.merchant.y + 8, kind: 'lantern', tint: 2 });

    // Тайники с добычей: монеты, оружие, модули, алмазы и кейсы разбросаны по всему миру.
    // ID детерминирован индексом, поэтому найденный тайник остаётся открытым и после выхода.
    const cacheKinds: LootCache['kind'][] = ['supply', 'armory', 'supply', 'relic', 'armory', 'supply'];
    const cacheCount = Math.round(48 * this.qualityScale);
    for (let i = 0; i < cacheCount; i += 1) {
      const x = 160 + hash(i, 613) * (this.worldW - 320);
      const y = 160 + hash(619, i) * (this.worldH - 320);
      if (this.isOpenRoad(x, y) || this.hitsObstacle(x, y, 14)) continue;
      if (Math.hypot(x - cx, y - cy) < 260) continue;
      const id = `cache-${i}`;
      this.lootCaches.push({
        id,
        x: Math.round(x),
        y: Math.round(y),
        kind: cacheKinds[i % cacheKinds.length],
        claimed: this.storage.data.lootedCaches.includes(id),
      });
    }

    this.spawnVegetation(1500, 91);
    this.spawnForestGroves(90, 91);
    this.spawnAntidotes(36, Math.floor(this.worldW));
    this.spawnAnimals(80, Math.floor(this.worldH));
    this.refreshLights();
    for (let i = 0; i < 420; i += 1) {
      const x = 50 + hash(i, 431) * (this.worldW - 100);
      const y = 50 + hash(433, i) * (this.worldH - 100);
      if (this.hitsObstacle(x, y, 6)) continue;
      this.pickups.push({
        x, y, kind: i % 2 === 0 ? 'coin' : 'xp',
        value: i % 2 === 0 ? 10 + (i % 6) * 3 : 8,
        life: 900, bob: i,
      });
    }
    const lightKinds: LightKind[] = ['candle', 'lantern', 'torch', 'brazier'];
    for (let i = 0; i < 200; i += 1) {
      const x = 60 + hash(i, 437) * (this.worldW - 120);
      const y = 60 + hash(439, i) * (this.worldH - 120);
      if (this.hitsObstacle(x, y, 6)) continue;
      this.pickups.push({
        x, y, kind: 'light', value: 0, life: 1200, bob: i,
        lightKind: lightKinds[i % lightKinds.length],
      });
    }
    this.refreshLights();
  }

  private enterBuilding(building: CityBuilding): void {
    if (!this.player || this.activeBuilding) return;
    this.streetX = this.player.x;
    this.streetY = this.player.y;
    this.activeBuilding = building;
    this.interiorFloor = 1;
    this.interiorEnemyScale = this.cityEnemyScale(building, 1);
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.mines = [];
    this.generateInteriorFloor();
    this.callbacks.toast(`${building.name.toUpperCase()} · ЭТАЖ 1/${building.floors}`);
    this.sound.levelUp();
    this.emitHud();
  }

  private generateInteriorFloor(): void {
    const p = this.player;
    const b = this.activeBuilding;
    if (!p || !b) return;
    this.worldW = 960;
    this.worldH = 760;
    this.interiorW = this.worldW;
    this.interiorH = this.worldH;
    this.roomBounds = { minX: 80, minY: 80, maxX: 880, maxY: 680 };
    this.decorations = [];
    this.obstacles = [];
    this.portals = [];
    this.animals = [];
    this.interiorCleared = false;
    this.interiorExit = { x: 150, y: 610 };
    this.interiorStairs = this.interiorFloor < b.floors ? { x: 810, y: 150 } : null;
    this.interiorChest = this.interiorFloor >= b.floors && b.hasChest && b.clearedFloors < b.floors
      ? { x: 810, y: 610 }
      : null;
    p.x = 480;
    p.y = 380;
    this.obstacles.push(
      { x: 80, y: 80, w: 800, h: 16, kind: 'wall', hp: 0 },
      { x: 80, y: 664, w: 800, h: 16, kind: 'wall', hp: 0 },
      { x: 80, y: 80, w: 16, h: 600, kind: 'wall', hp: 0 },
      { x: 864, y: 80, w: 16, h: 600, kind: 'wall', hp: 0 },
    );
    for (let i = 0; i < 46; i += 1) {
      const x = 120 + hash(i + this.interiorFloor, 71) * 710;
      const y = 120 + hash(83, i + this.interiorFloor * 3) * 500;
      if (Math.hypot(x - 480, y - 380) < 76) continue;
      this.obstacles.push({
        x: Math.round(x), y: Math.round(y), w: 14, h: 14,
        kind: i % 2 === 0 ? 'crate' : 'barrel',
        hp: 18 + b.floors * 2,
      });
    }
    for (let i = 0; i < 20; i += 1) {
      this.decorations.push({
        x: 120 + hash(i, 91) * 720,
        y: 120 + hash(97, i) * 500,
        kind: i % 2 === 0 ? 'rubble' : 'bone',
      });
    }
    // Мебель, ковры и настенные факелы превращают «этаж» в настоящую комнату.
    for (const x of [300, 600]) {
      for (const y of [250, 500]) this.decorations.push({ x, y, kind: 'rug' });
    }
    for (const x of [100, 860]) {
      for (const y of [200, 380, 560]) this.decorations.push({ x, y, kind: 'torch' });
    }
    for (const y of [96, 664]) {
      for (const x of [240, 720]) this.decorations.push({ x, y, kind: y < 400 ? 'shelf' : 'table' });
    }
    for (let i = 0; i < 9; i += 1) {
      const x = 180 + hash(i + this.interiorFloor, 131) * 600;
      const y = 160 + hash(137, i + this.interiorFloor * 2) * 440;
      if (Math.hypot(x - 480, y - 380) < 64) continue;
      if (Math.hypot(x - this.interiorExit.x, y - this.interiorExit.y) < 50) continue;
      if (this.interiorStairs && Math.hypot(x - this.interiorStairs.x, y - this.interiorStairs.y) < 50) continue;
      if (this.interiorChest && Math.hypot(x - this.interiorChest.x, y - this.interiorChest.y) < 50) continue;
      this.obstacles.push({ x: Math.round(x), y: Math.round(y), w: 18, h: 16, kind: 'furniture', hp: 0 });
    }
    this.spawnVegetation(70, 16);
    const interiorLights: LightKind[] = ['candle', 'lantern', 'torch'];
    for (let i = 0; i < 6; i += 1) {
      this.pickups.push({
        x: 180 + hash(i + this.interiorFloor, 149) * 600,
        y: 160 + hash(151, i + this.interiorFloor) * 440,
        kind: 'light', value: 0, life: 900, bob: i,
        lightKind: interiorLights[i % interiorLights.length],
      });
    }
    this.spawnAntidotes(2, this.interiorFloor * 31 + b.id);
    this.spawnAnimals(5, b.id + this.interiorFloor);
    this.interiorEnemyScale = this.cityEnemyScale(b, this.interiorFloor);
    const count = 5 + Math.min(8, b.floors) + this.interiorFloor;
    for (let i = 0; i < count; i += 1) {
      const type = i % 6 === 0 && b.floors >= 4 ? 'vampire' : i % 4 === 0 ? 'cultist' : 'skeleton';
      this.spawnEnemy(type);
    }
    this.refreshLights();
  }

  // ---------------------------------------------------------------- растительность, животные, состояния

  /** Процедурная растительность: трава, кусты, грибы, цветы и корни. */
  private spawnVegetation(count: number, seed: number): void {
    if (!this.graphics.vegetation) return;
    count = Math.round(count * this.qualityScale);
    const kinds: Decoration['kind'][] = this.festive
      ? ['pine', 'pine', 'grass', 'bush', 'snow', 'pine', 'flower']
      : this.biomeIndex === 4
      ? ['pine', 'pine', 'grass', 'bush', 'mushroom', 'root', 'grass', 'flower']
      : this.mode.city
        ? ['grass', 'bush', 'flower', 'vine', 'grass']
        : ['pine', 'pine', 'grass', 'bush', 'flower', 'pine', 'mushroom', 'root', 'vine'];
    for (let i = 0; i < count; i += 1) {
      const x = 22 + hash(i + seed, 211) * (this.worldW - 44);
      const y = 22 + hash(223, i + seed) * (this.worldH - 44);
      if (this.hitsObstacle(x, y, 5)) continue;
      if (this.mode.city && this.cityBuildings.some((b) =>
        x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 8 && y < b.y + b.h + 28)) continue;
      this.decorations.push({
        x: Math.round(x), y: Math.round(y),
        kind: kinds[i % kinds.length],
        tint: Math.floor(hash(i * 3 + seed, 227) * 3),
      });
    }
  }

  /** Густые рощи: деревья растут группами, а не равномерным шумом. */
  private spawnForestGroves(count: number, seed: number): void {
    if (!this.graphics.vegetation) return;
    const groves = Math.round(count * this.qualityScale);
    for (let i = 0; i < groves; i += 1) {
      const cx = 40 + hash(i * 5 + seed, 401) * (this.worldW - 80);
      const cy = 40 + hash(409, i * 7 + seed) * (this.worldH - 80);
      const trees = 5 + Math.floor(hash(i + seed, 419) * 8);
      for (let j = 0; j < trees; j += 1) {
        const angle = hash(i * 13 + j, 421) * Math.PI * 2;
        const radius = hash(i * 17 + j, 431) * 46;
        const x = Math.round(cx + Math.cos(angle) * radius);
        const y = Math.round(cy + Math.sin(angle) * radius * 0.8);
        if (x < 12 || y < 12 || x > this.worldW - 12 || y > this.worldH - 12) continue;
        if (this.hitsObstacle(x, y, 6)) continue;
        if (this.mode.city && this.cityBuildings.some((b) =>
          x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 10 && y < b.y + b.h + 30)) continue;
        this.decorations.push({
          x, y, kind: 'pine', tint: Math.floor(hash(i * 3 + j, 433) * 3),
        });
      }
    }
  }

  /** Противоядия разбросаны по каждой локации, чтобы состояние можно было снять в бою. */
  private spawnAntidotes(count: number, seed: number): void {
    const ids: StatusId[] = ['poison', 'burn', 'infection'];
    for (let i = 0; i < count; i += 1) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const x = 60 + hash(i * 7 + seed + attempt, 307) * (this.worldW - 120);
        const y = 60 + hash(311, i * 11 + seed + attempt) * (this.worldH - 120);
        if (this.hitsObstacle(x, y, 10)) continue;
        if (this.mode.city && this.cityBuildings.some((b) =>
          x > b.x - 12 && x < b.x + b.w + 12 && y > b.y - 12 && y < b.y + b.h + 32)) continue;
        this.pickups.push({
          x: Math.round(x), y: Math.round(y), kind: 'antidote',
          antidote: ids[(i + Math.abs(Math.floor(seed))) % ids.length],
          value: 0, life: 900, bob: i,
        });
        break;
      }
    }
  }

  /** Мирные зверьки и птицы: крысы, вороны, летучие мыши, жуки и волки. */
  private spawnAnimals(count: number, seed: number): void {
    if (!this.graphics.animals) return;
    count = Math.round(count * this.qualityScale);
    const kinds: AnimalKind[] = this.mode.city
      ? ['rat', 'crow', 'beetle', 'bat', 'rat']
      : ['rat', 'beetle', 'bat', 'crow', 'wolf'];
    for (let i = 0; i < count; i += 1) {
      const kind = kinds[i % kinds.length];
      let x = 30 + hash(i + seed, 331) * (this.worldW - 60);
      let y = 30 + hash(337, i + seed) * (this.worldH - 60);
      if (this.mode.city) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const nx = 30 + hash(i * 3 + attempt + seed, 331) * (this.worldW - 60);
          const ny = 30 + hash(337, i * 5 + attempt + seed) * (this.worldH - 60);
          if (!this.cityBuildings.some((b) => nx > b.x && nx < b.x + b.w && ny > b.y && ny < b.y + b.h)) {
            x = nx;
            y = ny;
            break;
          }
        }
      }
      if (this.hitsObstacle(x, y, 6)) continue;
      const angle = hash(i, seed) * Math.PI * 2;
      const speed = kind === 'crow' ? 30 : kind === 'bat' ? 24 : kind === 'wolf' ? 18 : 12;
      this.animals.push({
        kind, x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        phase: hash(i, seed) * Math.PI * 2,
        size: kind === 'wolf' ? 8 : kind === 'crow' ? 5 : 3,
      });
    }
  }

  private updateAnimals(dt: number, p: Player): void {
    for (const animal of this.animals) {
      animal.phase += dt * (animal.kind === 'bat' ? 3.2 : 1.5);
      const dx = animal.x - p.x;
      const dy = animal.y - p.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance < 58 && animal.kind !== 'wolf') {
        const flee = animal.kind === 'crow' ? 56 : 38;
        animal.x += (dx / distance) * flee * dt;
        animal.y += (dy / distance) * flee * dt;
      } else {
        animal.x += (animal.vx + Math.sin(animal.phase) * 5) * dt;
        animal.y += (animal.vy + Math.cos(animal.phase * 0.7) * 5) * dt;
        if (animal.x < 12 || animal.x > this.worldW - 12) animal.vx *= -1;
        if (animal.y < 12 || animal.y > this.worldH - 12) animal.vy *= -1;
      }
      this.clampToArea(animal, 4);
    }
  }

  private applyStatus(id: StatusId | undefined): void {
    const p = this.player;
    if (!p || !id || this.shield > 0) return;
    const fresh = this.statuses[id] <= 0;
    this.statuses[id] = Math.max(this.statuses[id], STATUS_DURATION[id]);
    if (fresh) {
      this.callbacks.toast(`${STATUS_LABELS[id]}! НАЙДИ ПРОТИВОЯДИЕ`);
      this.addRing(p.x, p.y, 24, STATUS_COLORS[id]);
    }
    if (this.graphics.particles) {
      for (let i = 0; i < 7; i += 1) {
        const a = Math.random() * Math.PI * 2;
        this.effects.push({
          kind: 'particle', x: p.x, y: p.y,
          vx: Math.cos(a) * 26, vy: Math.sin(a) * 26 - 12,
          life: 0.5, max: 0.5, color: STATUS_COLORS[id],
        });
      }
    }
  }

  private updateStatuses(dt: number, p: Player): void {
    let active = false;
    for (const id of ['poison', 'burn', 'infection'] as StatusId[]) {
      if (this.statuses[id] <= 0) continue;
      active = true;
      this.statuses[id] = Math.max(0, this.statuses[id] - dt);
    }
    if (!active) {
      this.statusTick = 0;
      return;
    }
    this.statusTick += dt;
    if (this.statusTick < 0.5) return;
    this.statusTick -= 0.5;
    for (const id of ['poison', 'burn', 'infection'] as StatusId[]) {
      if (this.statuses[id] <= 0) continue;
      const damage = Math.max(1, Math.round(STATUS_DAMAGE[id] * 0.5));
      p.hp -= damage;
      if (Math.random() < 0.4) {
        this.effects.push({
          kind: 'text', x: p.x + (Math.random() - 0.5) * 8, y: p.y - 10,
          life: 0.45, max: 0.45, text: `-${damage}`, color: STATUS_COLORS[id],
        });
      }
      if (this.graphics.particles) {
        for (let i = 0; i < 2; i += 1) {
          this.effects.push({
            kind: 'particle', x: p.x + (Math.random() - 0.5) * 10, y: p.y + 4,
            vx: (Math.random() - 0.5) * 8, vy: -12 - Math.random() * 14,
            life: 0.4, max: 0.4, color: STATUS_COLORS[id],
          });
        }
      }
    }
  }

  private clearStatus(id: StatusId | undefined): void {
    if (!id) return;
    this.statuses[id] = 0;
    this.callbacks.toast(`${STATUS_LABELS[id]} ИЗЛЕЧЕНО`);
    if (this.player) this.addRing(this.player.x, this.player.y, 34, ANTIDOTE_COLOR[id]);
  }

  private bloodBurst(x: number, y: number, count: number, splatRadius = 0): void {
    if (!this.graphics.blood) return;
    const colors = ['#7a1414', '#9c1f1f', '#b83232', '#5c1010'];
    count = Math.round(count * this.qualityScale);
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 95;
      this.effects.push({
        kind: 'particle', x, y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.3 + Math.random() * 0.45, max: 0.75,
        color: colors[i % colors.length],
      });
    }
    if (splatRadius > 0) {
      this.effects.push({
        kind: 'splat', x, y, life: 7 + Math.random() * 3, max: 10,
        r: splatRadius, color: '#591414',
      });
    }
    if (this.effects.length > 480) this.effects.splice(0, this.effects.length - 480);
  }

  /** Открывает лестницу или сундук, когда на этаже не осталось живых врагов. */
  private checkInteriorProgress(): void {
    const b = this.activeBuilding;
    if (!b || this.interiorCleared) return;
    if (this.enemies.some((enemy) => !enemy.dead)) return;
    b.clearedFloors = Math.max(b.clearedFloors, this.interiorFloor);
    this.interiorCleared = true;
    if (this.player) {
      const reward = 30 + b.floors * 12;
      this.player.coins += reward;
      this.effects.push({
        kind: 'text', x: this.player.x, y: this.player.y - 14,
        life: 0.8, max: 0.8, text: `+${reward}`, color: '#f0d68a',
      });
    }
    if (this.interiorStairs) {
      this.callbacks.toast(`ЭТАЖ ${this.interiorFloor} ЗАЧИЩЕН · ЛЕСТНИЦА ОТКРЫТА`);
    } else if (this.interiorChest) {
      this.callbacks.toast('ВРАГИ ПОВЕРЖЕНЫ · СУНДУК ЗДАНИЯ');
    } else {
      this.callbacks.toast('ЭТАЖ ЗАЧИЩЕН · ВЫХОД ОТКРЫТ');
    }
    this.sound.levelUp();
  }

  private advanceInteriorFloor(): void {
    const b = this.activeBuilding;
    if (!b || !this.interiorStairs || !this.interiorCleared || this.interiorFloor >= b.floors) return;
    this.interiorFloor += 1;
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.mines = [];
    this.generateInteriorFloor();
    this.callbacks.toast(`ЭТАЖ ${this.interiorFloor}/${b.floors} · ВРАГИ ×${this.interiorEnemyScale.toFixed(2)}`);
    this.sound.levelUp();
    this.emitHud();
  }

  /** Шанс сундука растёт с улучшением «Врата города» на базе. */
  private cityChestChance(): number {
    return Math.min(0.98, 0.72 + (this.storage.data.baseUpgrades.gate ?? 0) * 0.05);
  }

  private openInteriorChest(): void {
    const b = this.activeBuilding;
    if (!b || !this.player || !this.interiorChest) return;
    b.clearedFloors = b.floors;
    this.interiorChest = null;
    const locked = lockedWeapons(this.storage.data.unlockedWeapons);
    const reward = locked.length > 0 ? locked[Math.floor(Math.random() * locked.length)] : null;
    if (reward) {
      this.storage.update({ unlockedWeapons: [...this.storage.data.unlockedWeapons, reward.id] });
      this.storage.addMail('Сундук здания', `В ${b.name} найдено оружие «${reward.name}».`);
      this.callbacks.toast(`СУНДУК ЗДАНИЯ: ${reward.name.toUpperCase()}`);
    } else {
      this.player.coins += 180;
      this.storage.addMail('Сундук здания', 'Всё оружие уже открыто. Найдено 180 монет.');
      this.callbacks.toast('СУНДУК ЗДАНИЯ: +180 МОНЕТ');
    }
    this.player.coins += 80 + b.loot * 4;
    this.addRing(this.player.x, this.player.y, 70, '#f0d68a');
    this.sound.levelUp();
    this.exitBuilding();
  }

  /** Открывает тайник один раз и переносит добычу в постоянный профиль. */
  private claimLootCache(cache: LootCache): void {
    if (cache.claimed || !this.player) return;
    cache.claimed = true;
    const p = this.player;
    const save = this.storage.data;
    const claimed = [...new Set([...save.lootedCaches, cache.id])].slice(-256);
    this.storage.update({ lootedCaches: claimed });

    const coins = 50 + Math.floor(hash(cache.x, cache.y) * 90);
    p.coins += coins;
    this.storage.update({ coins: save.coins + Math.round(coins * 0.5) });
    const rewards: string[] = [`+${coins} монет`];

    if (cache.kind === 'armory') {
      const locked = lockedWeapons(save.unlockedWeapons);
      if (locked.length > 0) {
        const weapon = locked[Math.floor(hash(cache.y, cache.x) * locked.length)];
        this.storage.update({ unlockedWeapons: [...save.unlockedWeapons, weapon.id] });
        rewards.push(`оружие «${weapon.name}»`);
        this.storage.addMail('Тайник открытого мира', `В оружейном тайнике найдено оружие «${weapon.name}».`);
      } else {
        this.storage.update({ cases: save.cases + 1 });
        rewards.push('кейс');
      }
    } else if (cache.kind === 'relic') {
      const diamonds = 1 + Math.floor(hash(cache.x + 17, cache.y + 23) * 3);
      this.storage.update({ diamonds: save.diamonds + diamonds });
      rewards.push(`+${diamonds} алмазов`);
      const modules = MODULES.filter((module) => !save.modules.includes(module.id));
      if (modules.length > 0) {
        const module = modules[Math.floor(hash(cache.y + 31, cache.x + 37) * modules.length)];
        this.storage.update({ modules: [...save.modules, module.id] });
        rewards.push(`модуль «${module.name}»`);
        this.storage.addMail('Тайник открытого мира', `В тайнике найден модуль «${module.name}».`);
      }
    } else {
      this.storage.update({ cases: save.cases + 1 });
      p.hp = Math.min(p.stats.maxHp, p.hp + 30);
      p.xp += 12;
      rewards.push('кейс', '+30 HP', '+12 XP');
    }

    this.sound.levelUp();
    this.addRing(cache.x, cache.y, 38, '#f0d68a');
    this.callbacks.toast(`ТАЙНИК: ${rewards.join(' · ')}`);
    this.emitHud();
  }

  private exitBuilding(): void {
    const b = this.activeBuilding;
    if (!b || !this.player) return;
    if (this.interiorCleared && this.interiorFloor >= b.floors) b.clearedFloors = b.floors;
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.mines = [];
    this.pickups = this.pickups.filter((item) => item.x > this.interiorW || item.y > this.interiorH);
    this.player.x = this.streetX;
    this.player.y = this.streetY;
    if (this.mode.openWorld) this.generateOpenWorld(true);
    else this.generateCity(true);
    this.callbacks.toast(`${b.name}: ${b.clearedFloors}/${b.floors} ЭТАЖЕЙ · ${'★'.repeat(Math.min(5, b.clearedFloors))}`);
    this.emitHud();
  }

  private updateInteract(): void {
    const p = this.player;
    if (!p) return;
    this.interactHint = '';
    if (!this.mode.city && !this.mode.openWorld) return;
    const pressed = this.input.takePress(this.storage.data.bindings.interact) || this.interactRequested;
    this.interactRequested = false;

    if (this.activeBuilding) {
      if (this.interiorCleared && this.interiorChest && Math.hypot(p.x - this.interiorChest.x, p.y - this.interiorChest.y) < 38) {
        this.interactHint = `ОТКРЫТЬ СУНДУК [${keyLabel(this.storage.data.bindings.interact)}]`;
        if (pressed) this.openInteriorChest();
        return;
      }
      if (this.interiorCleared && this.interiorStairs && Math.hypot(p.x - this.interiorStairs.x, p.y - this.interiorStairs.y) < 38) {
        this.interactHint = `СЛЕДУЮЩИЙ ЭТАЖ [${keyLabel(this.storage.data.bindings.interact)}]`;
        if (pressed) this.advanceInteriorFloor();
        return;
      }
      if (this.interiorExit && Math.hypot(p.x - this.interiorExit.x, p.y - this.interiorExit.y) < 38) {
        this.interactHint = `ВЫЙТИ НА УЛИЦУ [${keyLabel(this.storage.data.bindings.interact)}]`;
        if (pressed) this.exitBuilding();
      }
      return;
    }

    if (this.mode.openWorld && this.merchant && Math.hypot(p.x - this.merchant.x, p.y - this.merchant.y) < 46) {
      this.interactHint = `МАГАЗИН ВРЕМЕННОГО ОРУЖИЯ [${keyLabel(this.storage.data.bindings.interact)}]`;
      if (pressed) this.openTempShop();
      return;
    }

    let nearestCache: LootCache | null = null;
    let cacheDistance = 40;
    for (const cache of this.lootCaches) {
      if (cache.claimed) continue;
      const distance = Math.hypot(p.x - cache.x, p.y - cache.y);
      if (distance < cacheDistance) {
        cacheDistance = distance;
        nearestCache = cache;
      }
    }
    if (nearestCache) {
      const label = nearestCache.kind === 'armory' ? 'ОРУЖЕЙНЫЙ'
        : nearestCache.kind === 'relic' ? 'РЕЛИКВИЯ' : 'ПОЛЕВОЙ';
      this.interactHint = `ОБЫСКАТЬ ${label} ТАЙНИК [${keyLabel(this.storage.data.bindings.interact)}]`;
      if (pressed) this.claimLootCache(nearestCache);
      return;
    }

    let nearest: CityBuilding | null = null;
    let best = 48;
    for (const building of this.cityBuildings) {
      const distance = Math.hypot(p.x - building.doorX, p.y - building.doorY);
      if (distance < best) {
        best = distance;
        nearest = building;
      }
    }
    if (nearest) {
      const stars = '★'.repeat(Math.min(5, nearest.floors)) + '☆'.repeat(Math.max(0, 5 - nearest.floors));
      this.interactHint = `ВОЙТИ · ${nearest.name} · ${stars} · ВРАГИ ×${this.cityEnemyScale(nearest).toFixed(2)} [${keyLabel(this.storage.data.bindings.interact)}]`;
      if (pressed) this.enterBuilding(nearest);
    }
  }

  /** Не даёт выйти за стены здания и за границы города. */
  private clampToArea(entity: { x: number; y: number }, radius = PLAYER_RADIUS): void {
    if (this.roomBounds) {
      entity.x = clamp(entity.x, this.roomBounds.minX + radius + 16, this.roomBounds.maxX - radius - 16);
      entity.y = clamp(entity.y, this.roomBounds.minY + radius + 16, this.roomBounds.maxY - radius - 16);
      return;
    }
    entity.x = clamp(entity.x, radius, this.worldW - radius);
    entity.y = clamp(entity.y, radius, this.worldH - radius);
  }

  private hitsObstacle(x: number, y: number, radius: number): Obstacle | null {
    for (const obstacle of this.obstacles) {
      const nearestX = clamp(x, obstacle.x, obstacle.x + obstacle.w);
      const nearestY = clamp(y, obstacle.y, obstacle.y + obstacle.h);
      if (Math.hypot(x - nearestX, y - nearestY) < radius) return obstacle;
    }
    return null;
  }

  private moveWithCollision(entity: { x: number; y: number }, dx: number, dy: number, radius: number): void {
    if (!this.hitsObstacle(entity.x + dx, entity.y, radius)) entity.x += dx;
    if (!this.hitsObstacle(entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  private damageObstacle(obstacle: Obstacle, damage: number): void {
    if ((obstacle.kind !== 'barrel' && obstacle.kind !== 'crate') || obstacle.hp <= 0) return;
    obstacle.hp -= damage;
    if (obstacle.hp > 0) return;
    const x = obstacle.x + obstacle.w / 2;
    const y = obstacle.y + obstacle.h / 2;
    this.obstacles = this.obstacles.filter((o) => o !== obstacle);
    if (this.player) {
      if (this.pickups.length < 260) {
        this.pickups.push({ x, y, kind: 'xp', value: 4 + Math.floor(hash(x, y) * 5), life: 120, bob: 0 });
        this.pickups.push({ x: x + 4, y: y - 3, kind: 'coin', value: 5 + Math.floor(hash(y, x) * 6), life: 120, bob: 0 });
      }
      if (this.mode.city && Math.random() < this.cityChestChance() * 0.055) {
        this.pickups.push({ x: x + 2, y: y + 5, kind: 'chest', value: 0, life: 180, bob: 0 });
      }
    }
    if (obstacle.kind === 'barrel') {
      this.explode(x, y, 40, 35, { burn: true });
      if (this.player) this.player.coins += 6;
    } else {
      this.shake = Math.max(this.shake, 1.5);
      this.sound.hit();
      for (let i = 0; i < 5; i += 1) {
        const a = Math.random() * Math.PI * 2;
        this.effects.push({
          kind: 'particle', x, y,
          vx: Math.cos(a) * 55, vy: Math.sin(a) * 55,
          life: 0.25, max: 0.25, color: '#9a7050',
        });
      }
    }
    if (this.activeBuilding) this.activeBuilding.loot += 1;
  }

  private damageNearbyObstacles(x: number, y: number, radius: number, damage: number): void {
    for (const obstacle of this.obstacles) {
      if (obstacle.kind !== 'barrel' && obstacle.kind !== 'crate') continue;
      if (Math.hypot(obstacle.x + obstacle.w / 2 - x, obstacle.y + obstacle.h / 2 - y) <= radius) {
        this.damageObstacle(obstacle, damage);
      }
    }
  }

  start(
    classId: ClassId,
    weaponId: string,
    modeId = this.storage.data.modeId,
    profileLevel = this.storage.data.selectedLevel,
  ): void {
    // Временное оружие из открытого мира не переносится в новый забег.
    this.clearTempWeapon();
    const cls = getClass(classId);
    this.classId = classId;
    this.modeId = getMode(modeId).id;
    this.campaignLevel = Math.min(MAX_PROFILE_LEVEL, Math.max(1, Math.floor(profileLevel) || 1));
    this.campaignVictory = false;
    this.storage.update({ modeId: this.modeId, classId, weaponId, selectedLevel: this.campaignLevel });
    const chosen = getWeapon(weaponId);
    this.weapon = chosen.classId === classId ? chosen : getWeapon(cls.starter);
    const stats = this.applyModules(this.applyBaseBonuses({ ...cls.base }));
    this.player = {
      x: this.worldW / 2,
      y: this.worldH / 2,
      hp: stats.maxHp,
      stats,
      facing: 0,
      invuln: 0,
      fireTimer: 0.2,
      level: 1,
      xp: 0,
      xpNext: 8,
      coins: 0,
      kills: 0,
    };
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.mines = [];
    this.pickups = [];
    this.effects = [];
    this.animals = [];
    this.statuses = { poison: 0, burn: 0, infection: 0 };
    this.moveTrail = [];
    this.weaponKick = 0;
    this.statusTick = 0;
    this.taken = {};
    this.pendingLevels = 0;
    this.time = 0;
    this.flashlightOn = true;
    this.lightBattery = 100;
    this.wave = 1;
    this.spawnTimer = 0.5;
    this.bossTimer = 0;
    this.reviveUsed = false;
    this.cooldowns = {};
    this.rage = 0;
    this.rapid = 0;
    this.shield = 0;
    this.healCharges = HEAL_CHARGES;
    this.healCd = 0;
    this.arena = 1;
    this.dungeon = null;
    this.chest = null;
    this.cityBuildings = [];
    this.activeBuilding = null;
    this.roomBounds = null;
    this.interiorCleared = false;
    this.interactHint = '';
    this.interactRequested = false;
    this.generateLevel(0);
    if (this.mode.city || this.mode.openWorld) {
      this.player.x = this.worldW / 2;
      this.player.y = this.worldH / 2;
    }
    this.camX = this.player.x - W / 2;
    this.camY = this.player.y - H / 2;
    this.input.clearPresses();
    this.state = 'playing';
    this.sound.unlock();
    this.sound.setMusic(this.mode.city ? 'city' : 'explore');
    this.callbacks.toast(`УРОВЕНЬ ${this.campaignLevel} · ${this.location.name.toUpperCase()}`);
    this.emitHud();
  }

  /** Передаёт кадр внешней сцене (ходимой базе), не останавливая общий RAF. */
  setExternalFrame(frame: ((dt: number) => void) | null): void {
    this.externalFrame = frame;
    this.lastFrame = 0;
  }

  private readonly loop = (now: number): void => {
    const dt = this.lastFrame === 0 ? 0 : Math.min(0.034, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.externalFrame) {
      this.externalFrame(dt);
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    if (this.state === 'playing') this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    this.clearTempWeapon();
    cancelAnimationFrame(this.raf);
  }

  togglePause(): boolean {
    if (this.state === 'playing') {
      this.state = 'paused';
      return true;
    }
    if (this.state === 'paused') {
      this.state = 'playing';
      return false;
    }
    return false;
  }

  resume(): void {
    if (this.state === 'paused' || this.state === 'levelup') this.state = 'playing';
  }

  /** Вызывается кнопкой HUD на тач-экранах. */
  interact(): void {
    if (this.state === 'playing') this.interactRequested = true;
  }

  /** Снимок витрины торговца: монеты текущего забега и список товаров. */
  tempShopState(): TempShopContext {
    const list = weaponsForClass(this.classId);
    const picks: WeaponDef[] = [];
    for (const weapon of [list[1], list[2], list[3], list[list.length - 1]]) {
      if (weapon && !picks.some((item) => item.id === weapon.id)) picks.push(weapon);
    }
    const offers: TempShopOffer[] = picks.map((weapon, index) => ({
      weaponId: weapon.id,
      name: weapon.name,
      description: weapon.description,
      price: 45 + index * 35,
      color: weapon.color,
      kind: weapon.kind,
    }));
    return {
      coins: this.player?.coins ?? 0,
      offers,
      activeWeaponId: this.tempWeapon?.weaponId ?? null,
    };
  }

  /** Покупка списывает монеты забега и сохраняется в локальной БД. */
  buyTempWeapon(id: string): boolean {
    if (this.state !== 'paused' || !this.player || !this.mode.openWorld) return false;
    const offer = this.tempShopState().offers.find((item) => item.weaponId === id);
    if (!offer) return false;
    if (this.player.coins < offer.price) {
      this.callbacks.toast('НЕДОСТАТОЧНО МОНЕТ');
      this.sound.click();
      return false;
    }
    const weapon = getWeapon(id);
    if (weapon.classId !== this.classId) return false;
    this.player.coins -= offer.price;
    this.weapon = weapon;
    const entry: TempWeaponEntry = {
      weaponId: weapon.id,
      classId: this.classId,
      purchasedAt: Date.now(),
    };
    this.tempWeapon = entry;
    const db = loadTempShop();
    saveTempShop({ active: entry, purchases: [...db.purchases, entry].slice(-24) });
    this.sound.levelUp();
    this.callbacks.toast(`ВРЕМЕННОЕ ОРУЖИЕ: ${weapon.name.toUpperCase()}`);
    this.emitHud();
    return true;
  }

  private openTempShop(): void {
    if (this.state !== 'playing') return;
    this.sound.click();
    this.callbacks.tempShop(this.tempShopState());
  }

  /** Вызывается при старте/выходе: временные покупки не переживают забег. */
  private clearTempWeapon(): void {
    this.tempWeapon = null;
    clearTempShop();
  }

  toMenu(): void {
    this.clearTempWeapon();
    this.state = 'idle';
  }

  chooseUpgrade(id: string): void {
    if (this.state !== 'levelup' || !this.player) return;
    const upgrade = rollUpgrades(this.taken, 20).find((u) => u.id === id);
    if (!upgrade) return;
    upgrade.apply(this.player.stats);
    if (id === 'hp') this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + 25);
    if (id === 'heal') this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + this.player.stats.maxHp * 0.6);
    this.taken[id] = (this.taken[id] ?? 0) + 1;
    this.sound.click();

    if (this.pendingLevels > 0) {
      this.pendingLevels -= 1;
      this.state = 'levelup';
      this.callbacks.levelUp(rollUpgrades(this.taken));
    } else {
      this.state = 'playing';
    }
  }

  canRevive(): boolean {
    return this.state === 'gameover' && !this.reviveUsed && this.player !== null;
  }

  revive(): void {
    if (!this.canRevive() || !this.player) return;
    this.reviveUsed = true;
    this.player.hp = Math.round(this.player.stats.maxHp * 0.55);
    this.player.invuln = 2;
    this.enemies = this.enemies.filter((enemy) => Math.hypot(enemy.x - this.player!.x, enemy.y - this.player!.y) > 90);
    this.state = 'playing';
    this.addRing(this.player.x, this.player.y, 70, '#c9a24b');
    this.callbacks.toast('Ты вернулся из мёртвых!');
    this.sound.levelUp();
  }

  result(): RunResult | null {
    if (!this.player) return null;
    // Прохождение уровня кампании теперь даёт гарантированную награду, даже если игрок почти не собирал монеты.
    const clearBonus = this.campaignVictory ? 120 + this.campaignLevel * 8 : 0;
    return {
      time: Math.floor(this.time),
      kills: this.player.kills,
      level: this.player.level,
      coins: Math.round(
        (this.player.coins + clearBonus) * this.mode.coinMul * this.location.rewardMul
        * (1 + (this.storage.data.baseUpgrades.vault ?? 0) * 0.08),
      ),
      wave: this.wave,
      classId: this.classId,
      weaponId: this.weapon.id,
      modeId: this.modeId,
      campaignLevel: this.campaignLevel,
      campaignName: this.location.name,
      victory: this.campaignVictory,
    };
  }

  // ---------------------------------------------------------------- update

  private update(dt: number): void {
    const p = this.player;
    if (!p) return;
    const bindings = this.storage.data.bindings;

    if (this.input.takePress(bindings.flashlight)) {
      this.flashlightOn = !this.flashlightOn;
      this.callbacks.toast(this.flashlightOn ? 'ФОНАРИК ВКЛЮЧЁН' : 'ФОНАРИК ВЫКЛЮЧЕН');
      this.sound.click();
    }
    if (this.flashlightOn && this.lightBattery > 0) {
      this.lightBattery = Math.max(0, this.lightBattery - dt * 0.8);
      if (this.lightBattery === 0) {
        this.flashlightOn = false;
        this.callbacks.toast('ФОНАРИК РАЗРЯЖЕН · НАЙДИ СВЕТ');
      }
    } else if (!this.flashlightOn) {
      this.lightBattery = Math.min(100, this.lightBattery + dt * 0.25);
    }

    this.time += dt;
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 8 + Math.random() * 7;
      this.sound.ambient();
    }
    if (!this.mode.city && !this.mode.openWorld && !this.campaignVictory && this.time >= CAMPAIGN_CLEAR_TIME) {
      this.campaignVictory = true;
      this.finishRun();
      return;
    }
    if (this.mode.timeLimit && this.time >= this.mode.timeLimit) {
      this.campaignVictory = false;
      this.finishRun();
      return;
    }
    const newWave = Math.floor(this.time / 30) + 1;
    if (newWave !== this.wave) {
      this.wave = newWave;
      this.callbacks.toast(`ВОЛНА ${this.wave}`);
      if (this.wave % this.mode.bossEvery === 0) {
        this.spawnEnemy('boss');
        this.sound.setMusic('boss');
        this.callbacks.toast('Костяной титан появился!');
      }
    }

    const targetArena = Math.floor(this.time / (BIOME_DURATION * this.mode.biomeMul)) + 1;
    if (targetArena !== this.arena && this.wave % this.mode.bossEvery !== 0) {
      this.arena = targetArena;
      if (this.mode.city && !this.activeBuilding) {
        // Город не пересоздаём: меняется только атмосфера района и состав врагов.
        this.biomeIndex = (this.biomeIndex + 1) % BIOMES.length;
        this.location = getCampaignLevel(this.campaignLevel + this.arena - 1);
        this.callbacks.toast(`РАЙОН ${this.arena} · ${this.biome.name.toUpperCase()}`);
      } else if (this.mode.openWorld) {
        // Открытый мир живёт по координатам: биом и локация меняются, когда игрок идёт.
        const index = this.biomeIndexAt(p.x, p.y);
        if (index !== this.biomeIndex) {
          this.biomeIndex = index;
          this.callbacks.toast(`БИОМ: ${this.biome.name.toUpperCase()}`);
        }
      } else if (!this.mode.city) {
        this.generateLevel(targetArena - 1);
        this.callbacks.toast(`ЛОКАЦИЯ: ${this.location.name.toUpperCase()}`);
        this.addRing(p.x, p.y, 100, this.biome.accent);
      }
      this.shake = 5;
    }

    for (const key of Object.keys(this.cooldowns)) {
      this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    }
    this.rage = Math.max(0, this.rage - dt);
    this.rapid = Math.max(0, this.rapid - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.healCd = Math.max(0, this.healCd - dt);
    this.shake = Math.max(0, this.shake - dt * 22);
    const kickTarget = p.fireTimer > 0 ? 1 : 0;
    this.weaponKick += (kickTarget - this.weaponKick) * Math.min(1, dt * 18);

    if (this.input.takePress(bindings.dash)) this.useDash();
    if (this.input.takePress(bindings.ability1)) this.useAbility('a1');
    if (this.input.takePress(bindings.ability2)) this.useAbility('a2');
    if (this.input.takePress(bindings.ultimate)) this.useAbility('ultimate');
    if (this.input.takePress(bindings.heal)) this.useHeal();
    if (this.input.takePress(bindings.minimap)) this.showMinimap = !this.showMinimap;

    p.invuln = Math.max(0, p.invuln - dt);
    if (p.stats.regen > 0) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * dt);
    this.updateStatuses(dt, p);
    for (const obstacle of this.obstacles) {
      if (obstacle.kind !== 'brazier') continue;
      if (Math.hypot(p.x - (obstacle.x + 6), p.y - (obstacle.y + 6)) < 34) {
        p.hp = Math.min(p.stats.maxHp, p.hp + 2.5 * dt);
      }
    }

    const axis = this.input.axis();
    const moving = Math.abs(axis.x) + Math.abs(axis.y) > 0.01;
    this.walking = moving;
    const speed = p.stats.moveSpeed * (this.rage > 0 ? 1.2 : 1);
    if (moving) {
      this.moveWithCollision(p, axis.x * speed * dt, axis.y * speed * dt, PLAYER_RADIUS);
      this.clampToArea(p);
      p.facing = Math.atan2(axis.y, axis.x);
      this.brushVegetation(p.x, p.y, axis.x, axis.y);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.31;
        this.sound.footstep();
        if (this.graphics.particles && this.graphics.vegetation) {
          for (let i = 0; i < 3; i += 1) {
            const spread = (Math.random() - 0.5) * 0.9;
            this.effects.push({
              kind: 'particle',
              x: p.x - axis.x * 5 + (Math.random() - 0.5) * 10,
              y: p.y - axis.y * 5 + (Math.random() - 0.5) * 8,
              vx: -axis.x * (18 + Math.random() * 22) + spread * 12,
              vy: -axis.y * (18 + Math.random() * 22) - 12 - Math.random() * 14,
              life: 0.32, max: 0.32,
              color: i === 0 ? '#6a5a42' : i === 1 ? '#4f7048' : '#7a9665',
            });
          }
        }
      }
      if (this.graphics.motionBlur) {
        this.moveTrail.push({ x: p.x, y: p.y, life: 0.16, max: 0.16 });
        if (this.moveTrail.length > 8) this.moveTrail.shift();
      }
    } else if (bindings.aimMode !== 'mouse') {
      const nearest = this.nearestEnemy(p.x, p.y);
      if (nearest) p.facing = Math.atan2(nearest.y - p.y, nearest.x - p.x);
    }

    const pointer = this.input.pointer();
    if (bindings.aimMode === 'mouse' && pointer.active) {
      p.facing = Math.atan2(this.camY + pointer.y - p.y, this.camX + pointer.x - p.x);
    }

    if (this.mode.city || this.mode.openWorld) {
      this.updateInteract();
      this.checkInteriorProgress();
    } else if (this.dungeon?.active) {
      const dx = p.x - this.dungeon.centerX;
      const dy = p.y - this.dungeon.centerY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance > 260) {
        p.x = this.dungeon.centerX + (dx / distance) * 260;
        p.y = this.dungeon.centerY + (dy / distance) * 260;
      }
      // Выход из подземелья доступен в любой момент — никаких запирающих ограничений.
      this.interactHint = `ВЫЙТИ ИЗ ПОДЗЕМЕЛЬЯ [${keyLabel(bindings.interact)}]`;
      if (this.input.takePress(bindings.interact) || this.interactRequested) {
        this.interactRequested = false;
        this.exitDungeon();
        return;
      }
      const alive = this.enemies.filter((enemy) => !enemy.dead).length;
      if (alive === 0 && this.dungeon.spawned > 0 && !this.dungeon.cleared) {
        this.dungeon.cleared = true;
        this.dungeon.active = false;
        this.chest = { x: clamp(this.dungeon.centerX + 42, 20, this.worldW - 20), y: clamp(this.dungeon.centerY + 34, 20, this.worldH - 20) };
        this.callbacks.toast('ПОДЗЕМЕЛЬЕ ЗАЧИЩЕНО — СУНДУК!');
        this.sound.levelUp();
      }
    } else {
      this.interactHint = '';
      for (const portal of this.portals) {
        if (!portal.used && Math.hypot(p.x - portal.x, p.y - portal.y) < 18) {
          this.enterDungeon(portal);
          break;
        }
      }
      if (this.chest && Math.hypot(p.x - this.chest.x, p.y - this.chest.y) < 18) this.openChest();
    }

    p.fireTimer -= dt;
    const fireKey = this.input.takePress(bindings.fire);
    const wantsFire = bindings.fireMode === 'auto' || pointer.down || fireKey;
    if (p.fireTimer <= 0 && wantsFire) this.fire(p);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const alive = this.enemies.filter((enemy) => !enemy.dead).length;
      const cap = this.mode.city ? (this.activeBuilding ? 12 + this.interiorFloor * 2 : 28)
        : this.mode.openWorld ? 120 : 90;
      if (alive < cap) {
        const base = 1 + Math.floor(this.time / 75) + (Math.random() < 0.3 ? 1 : 0);
        const amount = Math.max(1, Math.round(Math.min(4, base) * this.mode.spawnMul));
        for (let i = 0; i < amount && alive + i < cap; i += 1) this.spawnEnemy(this.rollEnemyType());
        this.spawnTimer = Math.max(this.mode.city ? 0.5 : 0.16, 1.15 - this.time * 0.008 - this.wave * 0.014);
      } else {
        this.spawnTimer = 0.6;
      }
    }

    this.bossTimer -= dt;
    if (this.bossTimer <= 0) {
      const boss = this.enemies.find((e) => e.def.boss && !e.dead);
      if (boss) {
        for (let i = 0; i < 2; i += 1) this.spawnEnemy('skeleton', boss.x, boss.y);
        this.bossTimer = 4.5;
      } else {
        this.bossTimer = 1;
      }
    }

    this.updateEnemies(dt, p);
    this.updateProjectiles(dt, p);
    this.updateMines(dt);
    this.updatePickups(dt, p);
    this.updateAnimals(dt, p);
    this.updateEffects(dt);

    this.camX += (clamp(p.x - W / 2, 0, this.worldW - W) - this.camX) * Math.min(1, dt * 7);
    this.camY += (clamp(p.y - H / 2, 0, this.worldH - H) - this.camY) * Math.min(1, dt * 7);

    if (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level += 1;
      p.xpNext = Math.round(6 + p.level * 3.2 + p.level * p.level * 0.32);
      this.pendingLevels += 1;
    }
    if (this.pendingLevels > 0 && this.state === 'playing') {
      this.pendingLevels -= 1;
      this.state = 'levelup';
      this.sound.levelUp();
      this.callbacks.levelUp(rollUpgrades(this.taken));
      this.callbacks.hud(this.hudState());
      return;
    }

    if (p.hp <= 0) {
      this.finishRun();
      return;
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.emitHud();
  }

  private rollEnemyType(): string {
    const t = this.time;
    const roll = Math.random();
    const bias = this.biome.enemyBias;
    if (bias === 'cultist' && t > 25 && roll < 0.35) return 'cultist';
    if (bias === 'zombie' && roll < 0.45) return 'zombie';
    if (bias === 'vampire' && t > 15 && roll < 0.4) return 'vampire';
    if (bias === 'skeleton' && roll < 0.7) return 'skeleton';
    if (t > 150 && roll < 0.14) return 'cultist';
    if (t > 105 && roll < 0.28) return 'ghost';
    if (t > 70 && roll < 0.45) return 'vampire';
    if (t > 35 && roll < 0.62) return 'zombie';
    return 'skeleton';
  }

  private spawnEnemy(type: string, atX?: number, atY?: number): void {
    const def = ENEMIES[type];
    if (!def || !this.player) return;
    let x = atX ?? this.player.x;
    let y = atY ?? this.player.y;
    if (atX === undefined || atY === undefined) {
      if (this.roomBounds) {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const nx = this.roomBounds.minX + 28 + Math.random() * (this.roomBounds.maxX - this.roomBounds.minX - 56);
          const ny = this.roomBounds.minY + 28 + Math.random() * (this.roomBounds.maxY - this.roomBounds.minY - 56);
          if (Math.hypot(nx - this.player.x, ny - this.player.y) > 100 && !this.hitsObstacle(nx, ny, def.size * 0.5)) {
            x = nx;
            y = ny;
            break;
          }
        }
      } else {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const angle = Math.random() * Math.PI * 2;
          const distance = 285 + Math.random() * 70;
          const nx = clamp(this.player.x + Math.cos(angle) * distance, 16, this.worldW - 16);
          const ny = clamp(this.player.y + Math.sin(angle) * distance, 16, this.worldH - 16);
          const insideBuilding = this.mode.city && this.cityBuildings.some((b) =>
            nx > b.x && nx < b.x + b.w && ny > b.y && ny < b.y + b.h);
          if (!insideBuilding && (Math.hypot(nx - this.player.x, ny - this.player.y) > 200 || attempt === 5)) {
            x = nx;
            y = ny;
            break;
          }
        }
      }
    }
    const hpScale = (1 + (this.wave - 1) * 0.16 + this.time * 0.003)
      * this.mode.hpMul * this.location.difficulty * this.interiorEnemyScale;
    const speedScale = 1 + Math.min(0.55, (this.wave - 1) * 0.025);
    this.enemies.push({
      def,
      x,
      y,
      hp: def.hp * hpScale,
      maxHp: def.hp * hpScale,
      speed: def.speed * speedScale * (0.9 + Math.random() * 0.2),
      size: def.size,
      flash: 0,
      slow: 0,
      burn: 0,
      burnDamage: 0,
      bleed: 0,
      bleedDamage: 0,
      hitCooldown: 0,
      attackTimer: 1 + Math.random(),
      spitTimer: 1.2 + Math.random() * 1.8,
      aggro: this.mode.openWorld ? 0 : AGGRO_MEMORY,
      wobble: Math.random() * Math.PI * 2,
      dead: false,
    });
  }

  private updateEnemies(dt: number, p: Player): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.hitCooldown = Math.max(0, enemy.hitCooldown - dt);
      enemy.attackTimer -= dt;
      enemy.spitTimer = Math.max(0, enemy.spitTimer - dt);
      enemy.aggro = Math.max(0, enemy.aggro - dt);
      enemy.wobble += dt * 3;

      if (enemy.burn > 0) {
        enemy.burn -= dt;
        this.damageEnemy(enemy, enemy.burnDamage * dt, {}, false, true);
        if (enemy.dead) continue;
        if (this.graphics.particles && Math.random() < 0.5) {
          this.effects.push({
            kind: 'particle', x: enemy.x + (Math.random() - 0.5) * enemy.size, y: enemy.y,
            vx: (Math.random() - 0.5) * 6, vy: -12 - Math.random() * 10,
            life: 0.3, max: 0.3, color: Math.random() < 0.5 ? '#e5813a' : '#f0c05a',
          });
        }
      }
      if (enemy.bleed > 0) {
        enemy.bleed -= dt;
        this.damageEnemy(enemy, enemy.bleedDamage * dt, {}, false, true);
        if (enemy.dead) continue;
        if (this.graphics.blood && Math.random() < 0.35) {
          this.effects.push({
            kind: 'particle', x: enemy.x, y: enemy.y + 3,
            vx: (Math.random() - 0.5) * 8, vy: 4,
            life: 0.45, max: 0.45, color: '#7a1414',
          });
        }
      }

      const dx = p.x - enemy.x;
      const dy = p.y - enemy.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const speed = enemy.speed * (enemy.slow > 0 ? 0.55 : 1);
      enemy.slow = Math.max(0, enemy.slow - dt);
      // На улице открытого мира зомби не видят игрока сами: интерес держится только на звуке выстрела.
      // Внутри здания-данжа враги обычные — иначе зачистить этаж было бы невозможно.
      const quietOpenWorld = this.mode.openWorld && !this.activeBuilding;
      const provoked = !quietOpenWorld || enemy.aggro > 0 || distance < 22;
      // Ближняя оборона не требует выстрела: подошедшего вплотную зомби всё равно кусает и плюётся.
      // При этом издалека враг по-прежнему не поднимает агро без звука выстрела.
      const canSpit = provoked || (quietOpenWorld && distance < 38);

      if (provoked && enemy.def.ranged && distance < 165 && distance > 45 && enemy.attackTimer <= 0) {
        const projectileSpeed = 82;
        this.enemyProjectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: (dx / distance) * projectileSpeed,
          vy: (dy / distance) * projectileSpeed,
          damage: enemy.def.damage * this.mode.damageMul * this.location.difficulty * this.interiorEnemyScale,
          life: 2.6,
          radius: 4,
          color: '#d06a4a',
          status: enemy.def.status,
        });
        enemy.attackTimer = 2.1 + Math.random() * 0.6;
      } else if (canSpit && enemy.def.spit && distance < GUN_NOISE_RADIUS && distance > 24 && enemy.spitTimer <= 0) {
        // Ядовитый плювок: урон приходит снарядом, а не только при касании.
        const projectileSpeed = 78;
        this.enemyProjectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: (dx / distance) * projectileSpeed,
          vy: (dy / distance) * projectileSpeed,
          damage: enemy.def.damage * 0.6 * (1 + (this.wave - 1) * 0.04)
            * this.mode.damageMul * this.location.difficulty * this.interiorEnemyScale,
          life: 2.2,
          radius: 5,
          color: STATUS_COLORS.poison,
          status: enemy.def.status,
        });
        enemy.spitTimer = 2.4 + Math.random() * 0.8;
        this.addRing(enemy.x, enemy.y, 7, STATUS_COLORS.poison);
      } else if (provoked && distance > 22) {
        const wobbleX = Math.sin(enemy.wobble) * 0.18;
        const wobbleY = Math.cos(enemy.wobble * 0.8) * 0.18;
        this.moveWithCollision(
          enemy,
          ((dx / distance) + wobbleX) * speed * dt,
          ((dy / distance) + wobbleY) * speed * dt,
          enemy.size * 0.4,
        );
        this.clampToArea(enemy, enemy.size * 0.4);
      }

      // Контактный урон есть у ВСЕХ врагов, включая стрелков и плюющихся зомби.
      // Спрайт врага 32 px, поэтому зона касания немного больше физического радиуса.
      const touchDistance = Math.hypot(p.x - enemy.x, p.y - enemy.y);
      if (touchDistance < enemy.size * 0.75 + PLAYER_RADIUS + 3
        && enemy.hitCooldown <= 0 && p.invuln <= 0) {
        this.damagePlayer(enemy.def.damage * (1 + (this.wave - 1) * 0.04)
          * this.mode.damageMul * this.location.difficulty * this.interiorEnemyScale);
        this.applyStatus(enemy.def.status);
        enemy.hitCooldown = 0.75;
        if (enemy.def.lifesteal) enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.def.lifesteal);
      }
    }
  }

  private updateProjectiles(dt: number, p: Player): void {
    for (const shot of this.projectiles) {
      shot.life -= dt;
      if (shot.homing) {
        const target = this.nearestEnemy(shot.x, shot.y);
        if (target) {
          const angle = Math.atan2(target.y - shot.y, target.x - shot.x);
          const speed = Math.hypot(shot.vx, shot.vy);
          const turn = 0.14;
          shot.vx += (Math.cos(angle) * speed - shot.vx) * turn;
          shot.vy += (Math.sin(angle) * speed - shot.vy) * turn;
          const current = Math.hypot(shot.vx, shot.vy);
          shot.vx = (shot.vx / current) * speed;
          shot.vy = (shot.vy / current) * speed;
        }
      }
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;

      const obstacle = this.hitsObstacle(shot.x, shot.y, shot.radius);
      if (obstacle) {
        if (obstacle.kind === 'barrel' || obstacle.kind === 'crate') this.damageObstacle(obstacle, shot.damage);
        shot.life = 0;
        continue;
      }

      for (const enemy of this.enemies) {
        if (enemy.dead || shot.hit.has(enemy)) continue;
        if (Math.hypot(enemy.x - shot.x, enemy.y - shot.y) > enemy.size * 0.55 + shot.radius) continue;
        shot.hit.add(enemy);
        this.damageEnemy(enemy, shot.damage, shot.specials, true);
        if (shot.aoe > 0) this.explode(shot.x, shot.y, shot.aoe * p.stats.area, shot.damage * 0.7, shot.specials);
        shot.pierce -= 1;
        if (shot.pierce < 0) {
          shot.life = 0;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((s) => s.life > 0 && s.x > -20 && s.x < this.worldW + 20 && s.y > -20 && s.y < this.worldH + 20);

    for (const shot of this.enemyProjectiles) {
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (Math.hypot(shot.x - p.x, shot.y - p.y) < PLAYER_RADIUS + shot.radius && p.invuln <= 0) {
        this.damagePlayer(shot.damage);
        this.applyStatus(shot.status);
        shot.life = 0;
      }
    }
    this.enemyProjectiles = this.enemyProjectiles.filter((s) => s.life > 0);
  }

  private updateMines(dt: number): void {
    for (const mine of this.mines) {
      mine.life -= dt;
      const trigger = this.enemies.find((e) => !e.dead && Math.hypot(e.x - mine.x, e.y - mine.y) < 15);
      if (trigger || mine.life <= 0) {
        this.explode(mine.x, mine.y, mine.aoe, mine.damage, mine.specials);
        mine.life = -1;
      }
    }
    this.mines = this.mines.filter((m) => m.life > 0);
  }

  private updatePickups(dt: number, p: Player): void {
    for (const item of this.pickups) {
      item.life -= dt;
      item.bob += dt * 4;
      const distance = Math.hypot(item.x - p.x, item.y - p.y);
      if (distance < p.stats.pickup && distance > 1) {
        const speed = 90 + (p.stats.pickup - distance) * 2;
        item.x += ((p.x - item.x) / distance) * speed * dt;
        item.y += ((p.y - item.y) / distance) * speed * dt;
      }
      if (distance < PLAYER_RADIUS + 5) {
        item.life = 0;
        if (item.kind === 'xp') {
          p.xp += item.value;
          this.effects.push({
            kind: 'text', x: item.x, y: item.y - 8,
            life: 0.6, max: 0.6, text: `+${item.value} XP`, color: '#c8a8ff',
          });
        } else if (item.kind === 'coin') p.coins += item.value;
        else if (item.kind === 'chest') this.openLootChest(item.x, item.y);
        else if (item.kind === 'light') this.collectLight(item);
        else if (item.kind === 'antidote') this.collectAntidote(item);
        else p.hp = Math.min(p.stats.maxHp, p.hp + item.value);
        this.sound.pickup();
      }
    }
    this.pickups = this.pickups.filter((item) => item.life > 0);
  }

  /** Помечает тайлы, по которым проходит игрок: трава прижимается и снова встаёт. */
  private brushVegetation(x: number, y: number, dx: number, dy: number): void {
    if (!this.graphics.vegetation) return;
    const minX = Math.floor((x - 20) / 16);
    const maxX = Math.floor((x + 20) / 16);
    const minY = Math.floor((y - 20) / 16);
    const maxY = Math.floor((y + 20) / 16);
    for (let gx = minX; gx <= maxX; gx += 1) {
      for (let gy = minY; gy <= maxY; gy += 1) {
        const tileX = gx * 16 + 8;
        const tileY = gy * 16 + 8;
        if (Math.hypot(tileX - x, tileY - y) > 24) continue;
        const key = gx * 100000 + gy;
        const patch = this.trampled.get(key) ?? { bx: 0, by: 0, life: 0 };
        patch.bx = patch.bx * 0.55 + dx * 0.45;
        patch.by = patch.by * 0.55 + dy * 0.45;
        patch.life = Math.min(1.2, patch.life + 0.5);
        this.trampled.set(key, patch);
      }
    }
    while (this.trampled.size > 400) {
      const oldest = this.trampled.keys().next().value;
      if (oldest === undefined) break;
      this.trampled.delete(oldest);
    }
  }

  private updateEffects(dt: number): void {
    for (const effect of this.effects) {
      effect.life -= dt;
      if (effect.kind === 'particle') {
        effect.x += effect.vx * dt;
        effect.y += effect.vy * dt;
      }
      if (effect.kind === 'text') effect.y -= 18 * dt;
    }
    for (const ghost of this.moveTrail) ghost.life -= dt;
    this.moveTrail = this.moveTrail.filter((ghost) => ghost.life > 0);
    for (const [key, patch] of this.trampled) {
      patch.life -= dt * 1.1;
      if (patch.life <= 0) this.trampled.delete(key);
    }
    this.effects = this.effects.filter((e) => e.life > 0);
  }

  // ---------------------------------------------------------------- combat

  private nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const distance = Math.hypot(enemy.x - x, enemy.y - y);
      if (distance < bestDist) {
        bestDist = distance;
        best = enemy;
      }
    }
    return best;
  }

  /** Звук выстрела в открытом мире: раздаёт агро зомби в радиусе 7 клеток вокруг игрока. */
  private emitGunNoise(x: number, y: number): void {
    if (!this.mode.openWorld) return;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (Math.hypot(enemy.x - x, enemy.y - y) > GUN_NOISE_RADIUS) continue;
      enemy.aggro = AGGRO_MEMORY;
      if (enemy.def.spit) enemy.spitTimer = Math.min(enemy.spitTimer, 0.6);
    }
  }

  private fire(p: Player): void {
    const w = this.weapon;
    const color = this.shotColor ?? w.color;
    const s = p.stats;
    const crit = Math.random() < s.crit;
    const damage = s.damage * w.damageMul * (crit ? 2 : 1) * (this.rage > 0 ? 1.7 : 1);
    const speed = s.projectileSpeed * w.speedMul;
    const count = ['melee', 'nova', 'mine'].includes(w.kind) ? w.count : w.count + s.projectileCount;
    const angle = p.facing;
    this.sound.shoot(w.kind, w.id, { source: 'weapon', aoe: w.aoe });
    // Ближний бой тихий: сундуки и данжи можно чистить, не поднимая агро.
    if (w.kind !== 'melee') this.emitGunNoise(p.x, p.y);

    if (w.kind === 'melee') {
      const radius = (w.radius ?? 36) * s.area;
      const arc = w.arc ?? 1.2;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (dist > radius + enemy.size * 0.5) continue;
        const diff = Math.abs(this.angleDiff(Math.atan2(enemy.y - p.y, enemy.x - p.x), angle));
        if (diff > arc / 2) continue;
        this.damageEnemy(enemy, damage, w.specials ?? {}, crit);
        if (w.specials?.knockback) this.knockback(enemy, angle, 110);
      }
      this.damageNearbyObstacles(p.x, p.y, radius, damage);
      this.effects.push({ kind: 'slash', x: p.x, y: p.y, life: 0.16, max: 0.16, r: radius, angle, arc, color });
    } else if (w.kind === 'nova') {
      const radius = (w.radius ?? 55) * s.area;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        if (Math.hypot(enemy.x - p.x, enemy.y - p.y) > radius + enemy.size * 0.5) continue;
        this.damageEnemy(enemy, damage, w.specials ?? {}, crit);
        const a = Math.atan2(enemy.y - p.y, enemy.x - p.x);
        if (w.specials?.knockback) this.knockback(enemy, a, 130);
      }
      this.damageNearbyObstacles(p.x, p.y, radius, damage);
      this.addRing(p.x, p.y, radius, color);
    } else if (w.kind === 'mine') {
      for (let i = 0; i < count; i += 1) {
        const a = angle + (i - (count - 1) / 2) * 0.7;
        this.mines.push({
          x: p.x + Math.cos(a) * 14,
          y: p.y + Math.sin(a) * 14,
          life: 9,
          damage,
          aoe: (w.aoe ?? 40) * s.area,
          color,
          specials: w.specials ?? {},
        });
      }
    } else {
      const spread = count > 1 ? w.spread || 0.18 : 0;
      for (let i = 0; i < count; i += 1) {
        const offset = count > 1 ? (i - (count - 1) / 2) * spread : (Math.random() - 0.5) * w.spread;
        const a = angle + offset;
        const life = w.kind === 'flame' ? (w.range ?? 60) / speed : (s.range + (w.range ?? 0)) / speed;
        this.projectiles.push({
          x: p.x + Math.cos(a) * 9,
          y: p.y + Math.sin(a) * 9,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          damage,
          life,
          radius: w.kind === 'flame' ? 4 : w.kind === 'explosive' ? 4 : 3,
          color,
          pierce: w.kind === 'flame' ? 1 : (w.pierce ?? 0) + 1,
          aoe: w.kind === 'explosive' ? (w.aoe ?? 36) : 0,
          homing: w.specials?.homing === true,
          specials: w.specials ?? {},
          hit: new Set<Enemy>(),
        });
      }
      this.addRing(p.x + Math.cos(angle) * 10, p.y + Math.sin(angle) * 10, 6, color);
    }

    p.fireTimer = Math.max(0.06, w.cooldownMul / (s.fireRate * (this.rapid > 0 ? 2 : 1)));
  }

  // ---------------------------------------------------------------- способности

  private shootBurst(
    angle: number,
    count: number,
    spread: number,
    damage: number,
    speed: number,
    color: string,
    specials: WeaponSpecials = {},
    aoe = 0,
    life = 1.4,
    radius = 3,
  ): void {
    const p = this.player;
    if (!p) return;
    for (let i = 0; i < count; i += 1) {
      const offset = count > 1 ? (i - (count - 1) / 2) * spread : 0;
      const a = angle + offset;
      this.projectiles.push({
        x: p.x + Math.cos(a) * 9,
        y: p.y + Math.sin(a) * 9,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        damage,
        life,
        radius,
        color,
        pierce: aoe > 0 ? 1 : 2,
        aoe,
        homing: false,
        specials,
        hit: new Set<Enemy>(),
      });
    }
    this.addRing(p.x + Math.cos(angle) * 10, p.y + Math.sin(angle) * 10, 8, color);
  }

  private dash(distance: number, invuln: number): void {
    const p = this.player;
    if (!p) return;
    this.moveWithCollision(p, Math.cos(p.facing) * distance, Math.sin(p.facing) * distance, PLAYER_RADIUS);
    this.clampToArea(p);
    p.invuln = Math.max(p.invuln, invuln);
    this.shake = Math.max(this.shake, 3);
    for (let i = 0; i < 10; i += 1) {
      const a = p.facing + Math.PI + (Math.random() - 0.5) * 1.2;
      this.effects.push({
        kind: 'particle', x: p.x, y: p.y,
        vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
        life: 0.3, max: 0.3, color: '#9fb6c4',
      });
    }
  }

  useDash(): boolean {
    const p = this.player;
    if (!p || this.state !== 'playing' || (this.cooldowns.dash ?? 0) > 0) return false;
    this.cooldowns.dash = DASH_COOLDOWN;
    this.dash(64, 0.35);
    this.sound.shoot('bolt', undefined, { source: 'dash' });
    return true;
  }

  useHeal(): boolean {
    const p = this.player;
    if (!p || this.state !== 'playing' || this.healCharges <= 0 || this.healCd > 0) return false;
    this.healCharges -= 1;
    this.healCd = HEAL_COOLDOWN;
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.35);
    this.addRing(p.x, p.y, 44, '#6f9c62');
    this.callbacks.toast(`Аптечка • осталось ${this.healCharges}`);
    this.sound.levelUp();
    return true;
  }

  useAbility(slot: AbilitySlot): boolean {
    const p = this.player;
    if (!p || this.state !== 'playing') return false;
    const ability = abilityForSlot(this.classId, slot);
    if (!ability || (this.cooldowns[ability.id] ?? 0) > 0) return false;
    const s = p.stats;
    const power = s.damage * (this.rage > 0 ? 1.7 : 1);
    const nearest = this.nearestEnemy(p.x, p.y);
    const aim = nearest ? Math.atan2(nearest.y - p.y, nearest.x - p.x) : p.facing;

    switch (ability.id) {
      case 'mage_nova':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 82) {
            this.damageEnemy(enemy, power * 2.2, { slow: true }, false);
            enemy.slow = Math.max(enemy.slow, 2.6);
          }
        }
        this.addRing(p.x, p.y, 82, '#9fd8e8');
        this.shake = 4;
        break;
      case 'mage_blink':
        this.dash(96, 0.6);
        this.addRing(p.x, p.y, 42, '#b47ce0');
        break;
      case 'mage_meteor':
        if (nearest) this.explode(nearest.x, nearest.y, 90, power * 7, { burn: true });
        break;
      case 'ninja_smoke':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 74) {
            this.damageEnemy(enemy, power * 1.8, { burn: true }, false);
            enemy.slow = Math.max(enemy.slow, 2);
          }
        }
        this.addRing(p.x, p.y, 74, '#7fac7c');
        break;
      case 'ninja_step': {
        const fromX = p.x;
        const fromY = p.y;
        this.dash(110, 0.45);
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - fromX, enemy.y - fromY) < 120 && Math.hypot(enemy.x - p.x, enemy.y - p.y) < 80) {
            this.damageEnemy(enemy, power * 2.6, {}, true);
          }
        }
        break;
      }
      case 'ninja_storm':
        for (let i = 0; i < 4; i += 1) {
          const a = (i / 4) * Math.PI * 2;
          this.effects.push({ kind: 'slash', x: p.x, y: p.y, life: 0.3 + i * 0.05, max: 0.3 + i * 0.05, r: 70, angle: a, arc: 1.2, color: '#dce6eb' });
        }
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 92) this.damageEnemy(enemy, power * 4.5, {}, false);
        }
        this.shake = 5;
        break;
      case 'soldier_grenade':
        if (nearest) this.explode(nearest.x, nearest.y, 52, power * 3.2, {});
        break;
      case 'soldier_suppress':
        this.rapid = Math.max(this.rapid, 5);
        this.addRing(p.x, p.y, 36, '#e0d6a8');
        break;
      case 'soldier_airstrike':
        if (nearest) {
          for (let i = 0; i < 5; i += 1) {
            const a = (i / 5) * Math.PI * 2;
            this.explode(nearest.x + Math.cos(a) * 34, nearest.y + Math.sin(a) * 34, 46, power * 2.6, {});
          }
        }
        this.shake = 9;
        break;
      case 'boxer_rage':
        this.rage = Math.max(this.rage, 6);
        this.addRing(p.x, p.y, 58, '#c98d55');
        break;
      case 'boxer_slam':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 62) {
            this.damageEnemy(enemy, power * 2.4, { knockback: true }, false);
            this.knockback(enemy, Math.atan2(enemy.y - p.y, enemy.x - p.x), 180);
          }
        }
        this.addRing(p.x, p.y, 62, '#d9b17a');
        this.shake = 5;
        break;
      case 'boxer_quake':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 110) {
            this.damageEnemy(enemy, power * 4, { knockback: true }, false);
            this.knockback(enemy, Math.atan2(enemy.y - p.y, enemy.x - p.x), 220);
          }
        }
        this.addRing(p.x, p.y, 110, '#d9b17a');
        this.shake = 10;
        break;
      case 'bandit_fan':
        this.shootBurst(aim, 8, 0.17, power * 1.3, s.projectileSpeed * 1.4, '#e5c58c', {}, 0, 1, 3);
        break;
      case 'bandit_evade':
        this.dash(90, 0.9);
        this.addRing(p.x, p.y, 40, '#b56b5e');
        break;
      case 'bandit_bundle':
        if (nearest) {
          for (let i = 0; i < 4; i += 1) {
            const a = Math.random() * Math.PI * 2;
            this.explode(nearest.x + Math.cos(a) * 28, nearest.y + Math.sin(a) * 28, 42, power * 2.2, {});
          }
        }
        this.shake = 8;
        break;
      case 'demo_minefield':
        for (let i = 0; i < 4; i += 1) {
          const a = (i / 4) * Math.PI * 2;
          this.mines.push({
            x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30,
            life: 12, damage: power * 1.8, aoe: 46, color: '#c9a24b', specials: {},
          });
        }
        break;
      case 'demo_burst':
        this.shootBurst(p.facing, 7, 0.24, power * 1.1, s.projectileSpeed, '#e8793a', { burn: true }, 0, 0.6, 5);
        break;
      case 'demo_nuke':
        if (nearest) this.explode(nearest.x, nearest.y, 120, power * 6, { burn: true, knockback: true });
        this.shake = 12;
        break;
      case 'vampire_drain':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 78) this.damageEnemy(enemy, power * 2.2, { bleed: true }, false);
        }
        p.hp = Math.min(p.stats.maxHp, p.hp + 12 + power * 0.4);
        this.addRing(p.x, p.y, 78, '#b83848');
        break;
      case 'vampire_bite': {
        const fromX = p.x;
        const fromY = p.y;
        this.dash(88, 0.5);
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - fromX, enemy.y - fromY) < 110 && Math.hypot(enemy.x - p.x, enemy.y - p.y) < 60) {
            this.damageEnemy(enemy, power * 3, { bleed: true }, true);
          }
        }
        p.hp = Math.min(p.stats.maxHp, p.hp + 14 + power * 0.5);
        break;
      }
      case 'vampire_moon':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 118) this.damageEnemy(enemy, power * 4.5, { bleed: true }, false);
        }
        p.hp = Math.min(p.stats.maxHp, p.hp + 24 + power);
        this.addRing(p.x, p.y, 118, '#e05a5a');
        this.shake = 7;
        break;
      case 'vprime_vortex':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 96) {
            this.damageEnemy(enemy, power * 4, { bleed: true, knockback: true }, false);
            this.knockback(enemy, Math.atan2(enemy.y - p.y, enemy.x - p.x), 150);
          }
        }
        p.hp = Math.min(p.stats.maxHp, p.hp + 18 + power * 0.8);
        this.addRing(p.x, p.y, 96, '#e05a5a');
        this.shake = 6;
        break;
      case 'vprime_bite': {
        const fromX = p.x;
        const fromY = p.y;
        this.dash(112, 0.7);
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - fromX, enemy.y - fromY) < 140 && Math.hypot(enemy.x - p.x, enemy.y - p.y) < 76) {
            this.damageEnemy(enemy, power * 4.4, { burn: true, bleed: true }, true);
          }
        }
        p.hp = Math.min(p.stats.maxHp, p.hp + 26 + power);
        break;
      }
      case 'vprime_apocalypse':
        if (nearest) this.explode(nearest.x, nearest.y, 138, power * 7.5, { burn: true, knockback: true });
        p.hp = Math.min(p.stats.maxHp, p.hp + 36 + power * 1.2);
        this.shake = 14;
        break;
      case 'executioner_guillotine':
        for (const enemy of this.enemies) {
          const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
          if (dist > 76) continue;
          const diff = Math.abs(this.angleDiff(Math.atan2(enemy.y - p.y, enemy.x - p.x), aim));
          if (diff > 0.55) continue;
          this.damageEnemy(enemy, power * 5, { knockback: true }, false);
          this.knockback(enemy, aim, 190);
        }
        this.effects.push({ kind: 'slash', x: p.x, y: p.y, life: 0.26, max: 0.26, r: 76, angle: aim, arc: 1.1, color: '#8c8f96' });
        break;
      case 'executioner_sweep':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 82) {
            this.damageEnemy(enemy, power * 2.8, { knockback: true }, false);
            this.knockback(enemy, Math.atan2(enemy.y - p.y, enemy.x - p.x), 220);
          }
        }
        this.addRing(p.x, p.y, 82, '#8c8f96');
        this.shake = 5;
        break;
      case 'executioner_sentence':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 126) this.damageEnemy(enemy, power * 5.5, { knockback: true }, true);
        }
        this.addRing(p.x, p.y, 126, '#c9a24b');
        this.shake = 12;
        break;
      case 'necro_souls':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 84) this.damageEnemy(enemy, power * 2.6, { bleed: true }, false);
        }
        this.addRing(p.x, p.y, 84, '#8fbf63');
        break;
      case 'necro_bolt':
        this.shootBurst(aim, 3, 0.12, power * 1.6, s.projectileSpeed * 1.25, '#8fbf63', { bleed: true }, 0, 1.6, 4);
        break;
      case 'necro_blight':
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < 128) {
            this.damageEnemy(enemy, power * 4.2, { burn: true, bleed: true }, false);
            enemy.slow = Math.max(enemy.slow, 3);
          }
        }
        this.addRing(p.x, p.y, 128, '#7d9b6c');
        this.shake = 8;
        break;
    }

    this.cooldowns[ability.id] = ability.cooldown;
    this.sound.shoot(
      ability.id.includes('nuke') || ability.id.includes('meteor') ? 'explosive' : 'nova',
      undefined,
      { source: 'ability' },
    );
    this.sound.ability();
    this.callbacks.toast(`${ability.icon} ${ability.name}`);
    return true;
  }

  private enterDungeon(portal: Portal): void {
    const p = this.player;
    if (!p || this.dungeon) return;
    portal.used = true;
    this.sound.portal();
    this.dungeon = {
      centerX: portal.x,
      centerY: portal.y,
      returnX: p.x,
      returnY: p.y,
      active: true,
      cleared: false,
      spawned: 0,
    };
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.mines = [];
    p.x = portal.x;
    p.y = portal.y;
    const amount = 5 + this.wave * 2;
    for (let i = 0; i < amount; i += 1) {
      const angle = (i / amount) * Math.PI * 2;
      const distance = 65 + Math.random() * 70;
      this.spawnEnemy(i === amount - 1 && this.wave > 2 ? 'boss' : this.rollEnemyType(),
        portal.x + Math.cos(angle) * distance, portal.y + Math.sin(angle) * distance);
    }
    this.dungeon.spawned = amount;
    this.callbacks.toast('ТЫ ВОШЁЛ В ПОДЗЕМЕЛЬЕ');
    this.addRing(p.x, p.y, 70, '#c9a24b');
    this.sound.levelUp();
  }

  private exitDungeon(): void {
    const p = this.player;
    if (!p || !this.dungeon) return;
    p.x = this.dungeon.returnX;
    p.y = this.dungeon.returnY;
    this.dungeon = null;
    this.chest = null;
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.mines = [];
    this.interactHint = '';
    this.generateLevel(this.arena - 1);
    this.callbacks.toast('ТЫ ВЕРНУЛСЯ НА ПОВЕРХНОСТЬ');
    this.sound.click();
  }

  private openChest(): void {
    const p = this.player;
    if (!p || !this.dungeon || !this.chest) return;
    const locked = lockedWeapons(this.storage.data.unlockedWeapons);
    const reward = locked.length > 0 ? locked[Math.floor(Math.random() * locked.length)] : null;
    if (reward) {
      this.storage.update({ unlockedWeapons: [...this.storage.data.unlockedWeapons, reward.id] });
      this.callbacks.toast(`НОВОЕ ОРУЖИЕ: ${reward.name.toUpperCase()}`);
    } else {
      p.coins += 20;
      this.callbacks.toast('ВСЁ ОРУЖИЕ ОТКРЫТО • +20 МОНЕТ');
    }
    p.coins += 15;
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.3);
    this.addRing(p.x, p.y, 70, '#f0d68a');
    for (let i = 0; i < 20; i += 1) {
      const a = Math.random() * Math.PI * 2;
      this.effects.push({
        kind: 'particle', x: this.chest.x, y: this.chest.y,
        vx: Math.cos(a) * 80, vy: Math.sin(a) * 80,
        life: 0.5, max: 0.5, color: '#f0d68a',
      });
    }
    p.x = this.dungeon.returnX;
    p.y = this.dungeon.returnY;
    this.dungeon = null;
    this.chest = null;
    this.generateLevel(this.arena - 1);
    this.sound.levelUp();
  }

  private collectLight(item: Pickup): void {
    const p = this.player;
    const kind = item.lightKind ?? 'candle';
    if (!p) return;
    const before = this.lightBattery;
    this.lightBattery = Math.min(100, this.lightBattery + LIGHT_FUEL[kind]);
    this.flashlightOn = true;
    const gained = Math.round(this.lightBattery - before);
    this.callbacks.toast(`${LIGHT_NAMES[kind].toUpperCase()} · +${gained}% СВЕТА`);
    this.addRing(item.x, item.y, 42, '#ffd27a');
    this.effects.push({
      kind: 'text', x: item.x, y: item.y - 12,
      life: 0.55, max: 0.55, text: `+${gained}%`, color: '#ffd27a',
    });
  }

  private collectAntidote(item: Pickup): void {
    const p = this.player;
    if (!p) return;
    const id = item.antidote;
    if (!id) return;
    const had = this.statuses[id] > 0;
    this.clearStatus(id);
    if (!had) {
      p.hp = Math.min(p.stats.maxHp, p.hp + 8);
      this.callbacks.toast(`ЗАПАСНОЕ ПРОТИВОЯДИЕ · +8 HP`);
    }
    this.effects.push({
      kind: 'text', x: item.x, y: item.y - 12,
      life: 0.6, max: 0.6, text: STATUS_LABELS[id], color: ANTIDOTE_COLOR[id],
    });
  }

  private openLootChest(x: number, y: number): void {
    const p = this.player;
    if (!p) return;
    const locked = lockedWeapons(this.storage.data.unlockedWeapons);
    const reward = locked.length > 0 ? locked[Math.floor(Math.random() * locked.length)] : null;
    if (reward) {
      this.storage.update({ unlockedWeapons: [...this.storage.data.unlockedWeapons, reward.id] });
      this.storage.addMail('Сундук на улице', `Из мешочка выпало оружие «${reward.name}».`);
      this.callbacks.toast(`НОВОЕ ОРУЖИЕ: ${reward.name.toUpperCase()}`);
    } else {
      p.coins += 180;
      this.storage.addMail('Сундук на улице', 'Всё оружие уже открыто. Найдено 180 монет.');
      this.callbacks.toast('ВСЁ ОРУЖИЕ ОТКРЫТО • +180 МОНЕТ');
    }
    p.coins += 80;
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.12);
    this.addRing(x, y, 40, '#f0d68a');
    this.sound.levelUp();
  }

  private angleDiff(a: number, b: number): number {
    let diff = a - b;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  private knockback(enemy: Enemy, angle: number, force: number): void {
    const scale = enemy.def.boss ? 0.25 : 1;
    enemy.x += Math.cos(angle) * force * scale * 0.1;
    enemy.y += Math.sin(angle) * force * scale * 0.1;
  }

  private damageEnemy(enemy: Enemy, amount: number, specials: WeaponSpecials, crit: boolean, silent = false): void {
    if (enemy.dead) return;
    enemy.hp -= amount;
    if (!silent) {
      enemy.flash = crit ? 0.16 : 0.09;
      this.sound.hit();
      if (crit) {
        this.sound.crit();
        if (this.graphics.shake) this.shake = Math.max(this.shake, 2.4);
        this.effects.push({
          kind: 'crit', x: enemy.x, y: enemy.y - 6, life: 0.5, max: 0.5,
          text: `КРИТ ${Math.round(amount)}`, color: '#f0c05a',
        });
        this.addRing(enemy.x, enemy.y, enemy.size + 10, '#f0c05a');
        if (this.graphics.particles) {
          for (let i = 0; i < 9; i += 1) {
            const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 45 + Math.random() * 60;
            this.effects.push({
              kind: 'particle', x: enemy.x, y: enemy.y,
              vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
              life: 0.3, max: 0.3, color: i % 2 === 0 ? '#f0c05a' : '#fff0c0',
            });
          }
        }
      } else if (amount > 40) {
        this.effects.push({
          kind: 'text', x: enemy.x, y: enemy.y - 10, life: 0.55, max: 0.55,
          text: `${Math.round(amount)}`, color: '#d8d3c7',
        });
      }
      if (this.graphics.particles && !this.graphics.blood) {
        for (let i = 0; i < 3; i += 1) {
          this.effects.push({
            kind: 'particle',
            x: enemy.x, y: enemy.y,
            vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
            life: 0.25, max: 0.25, color: enemy.def.color,
          });
        }
      }
      this.bloodBurst(enemy.x, enemy.y, crit ? 9 : 5, crit ? enemy.size * 0.7 : 0);
    }
    if (this.player && this.player.stats.lifesteal > 0 && !silent) {
      this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + amount * this.player.stats.lifesteal);
    }
    if (specials.slow) enemy.slow = Math.max(enemy.slow, 1.5 + this.player!.stats.slow);
    if (specials.burn) {
      enemy.burn = Math.max(enemy.burn, 2.5);
      enemy.burnDamage = Math.max(enemy.burnDamage, 3 + this.player!.stats.burn);
    }
    if (specials.bleed) {
      enemy.bleed = Math.max(enemy.bleed, 3);
      enemy.bleedDamage = Math.max(enemy.bleedDamage, 2 + this.player!.stats.burn);
    }
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Enemy): void {
    enemy.dead = true;
    const p = this.player;
    if (!p) return;
    p.kills += 1;
    this.bloodBurst(enemy.x, enemy.y, enemy.def.boss ? 34 : 14, enemy.size * (enemy.def.boss ? 1.8 : 1.1));
    if (this.graphics.particles) {
      for (let i = 0; i < (enemy.def.boss ? 16 : 5); i += 1) {
        const a = Math.random() * Math.PI * 2;
        const speed = 25 + Math.random() * 75;
        this.effects.push({
          kind: 'particle', x: enemy.x, y: enemy.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          life: 0.3 + Math.random() * 0.35, max: 0.6, color: enemy.def.color,
        });
      }
    }
    this.effects.push({ kind: 'ring', x: enemy.x, y: enemy.y, life: 0.18, max: 0.18, r: enemy.size, color: enemy.def.color });
    const count = enemy.def.boss ? 10 : 1;
    for (let i = 0; i < count; i += 1) {
      this.pickups.push({
        x: enemy.x + (Math.random() - 0.5) * (enemy.def.boss ? 50 : 8),
        y: enemy.y + (Math.random() - 0.5) * (enemy.def.boss ? 50 : 8),
        kind: 'xp', value: enemy.def.xp, life: 30, bob: Math.random() * 6,
      });
    }
    if (Math.random() < 0.14) {
      this.pickups.push({ x: enemy.x, y: enemy.y, kind: 'coin', value: enemy.def.boss ? 60 : 4 + Math.floor(Math.random() * 4), life: 30, bob: 0 });
    }
    if (Math.random() < 0.045 || enemy.def.boss) {
      this.pickups.push({ x: enemy.x + 6, y: enemy.y, kind: 'hp', value: enemy.def.boss ? 45 : 12, life: 20, bob: 0 });
    }
    if (enemy.def.status && (Math.random() < 0.1 || enemy.def.boss)) {
      this.pickups.push({
        x: enemy.x - 6, y: enemy.y + 3, kind: 'antidote',
        antidote: enemy.def.status, value: 0, life: 60, bob: 0,
      });
    }
    if (enemy.def.boss) {
      this.explode(enemy.x, enemy.y, 70, 40, {});
      this.callbacks.toast('Титан повержен!');
      this.sound.explosion();
      this.sound.setMusic(this.mode.city ? 'city' : 'explore');
    }
  }

  private explode(x: number, y: number, radius: number, damage: number, specials: WeaponSpecials): void {
    for (const obstacle of this.obstacles) {
      if ((obstacle.kind !== 'barrel' && obstacle.kind !== 'crate') || obstacle.hp <= 0) continue;
      const distance = Math.hypot(obstacle.x + obstacle.w / 2 - x, obstacle.y + obstacle.h / 2 - y);
      if (distance <= radius) this.damageObstacle(obstacle, damage * 0.6);
    }
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const distance = Math.hypot(enemy.x - x, enemy.y - y);
      if (distance > radius + enemy.size * 0.5) continue;
      const falloff = 0.55 + 0.45 * (1 - distance / radius);
      this.damageEnemy(enemy, damage * falloff, specials, false);
      if (specials.knockback) {
        const angle = Math.atan2(enemy.y - y, enemy.x - x);
        this.knockback(enemy, angle, 160);
      }
    }
    this.addRing(x, y, radius, '#e0905a');
    for (let i = 0; i < 18; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 130;
      this.effects.push({
        kind: 'particle', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.3 + Math.random() * 0.35, max: 0.65,
        color: i % 3 === 0 ? '#f0d68a' : i % 3 === 1 ? '#e0905a' : '#8a4a3a',
      });
    }
    this.addRing(x, y, radius * 0.6, '#f0d68a');
    this.shake = Math.max(this.shake, Math.min(9, radius * 0.12));
    this.sound.explosion();
  }

  private damagePlayer(raw: number): void {
    const p = this.player;
    if (!p || p.invuln > 0 || this.shield > 0) return;
    const damage = Math.max(1, Math.round(raw - p.stats.armor));
    p.hp -= damage;
    p.invuln = 0.45;
    this.sound.hurt();
    this.bloodBurst(p.x, p.y, 10, 12);
    this.effects.push({ kind: 'text', x: p.x, y: p.y - 12, life: 0.6, max: 0.6, text: `-${damage}`, color: '#e05a5a' });
  }

  private addRing(x: number, y: number, r: number, color: string): void {
    this.effects.push({ kind: 'ring', x, y, life: 0.22, max: 0.22, r, color });
  }

  private finishRun(): void {
    this.state = 'gameover';
    this.sound.setMusic('menu');
    if (this.campaignVictory) this.sound.levelUp();
    else this.sound.death();
    const result = this.result();
    if (!result) return;
    this.clearTempWeapon();
    const campaign = this.mode.city
      ? { cleared: false, nextUnlocked: false }
      : this.storage.completeCampaignLevel(result.campaignLevel, result.time, result.kills);
    if (campaign.cleared) {
      this.callbacks.toast(`УРОВЕНЬ ${result.campaignLevel} ПРОЙДЕН · РЕКОРД ${formatTime(result.time)}`);
      this.storage.addMail('Кампания', `Уровень ${result.campaignLevel} «${result.campaignName}» пройден за ${formatTime(result.time)}.`);
    }
    if (campaign.nextUnlocked) {
      this.callbacks.toast(`ОТКРЫТ УРОВЕНЬ ${this.storage.data.campaignUnlocked}`);
      this.storage.addMail('Открыт новый уровень', `Теперь доступен уровень ${this.storage.data.campaignUnlocked}. Телепорт настроен на базе.`);
    }
    const xpReward = Math.round(result.coins * 1.25 + result.kills * 3 + Math.floor(result.time / 3));
    const progress = this.storage.addProfileXp(xpReward);
    this.storage.update({
      best: Math.max(this.storage.data.best, result.time),
      coins: this.storage.data.coins + result.coins + progress.coins,
      runs: this.storage.data.runs + 1,
    });
    if (progress.levels > 0) {
      this.callbacks.toast(`УРОВЕНЬ ПРОФИЛЯ ${this.storage.data.level} · +${progress.coins} монет`);
    }
    void this.yandex.setScore(result.time);
    this.callbacks.hud(this.hudState());
    this.callbacks.gameOver(result);
  }

  /** Пересобирает список статических источников света после генерации локации. */
  private refreshLights(): void {
    const list: LightSource[] = [];
    const add = (x: number, y: number, kind: LightKind, intensity = 1): void => {
      list.push({
        x, y,
        radius: LIGHT_RADIUS[kind],
        color: LIGHT_RGB[kind],
        intensity,
        phase: hash(x, y) * Math.PI * 2,
      });
    };

    for (const deco of this.decorations) {
      if (deco.kind === 'candle') add(deco.x, deco.y, 'candle', 0.75);
      else if (deco.kind === 'torch') add(deco.x, deco.y, 'torch', 0.95);
      else if (deco.kind === 'brazier') add(deco.x, deco.y, 'brazier', 1);
      else if (deco.kind === 'lantern') add(deco.x, deco.y - 8, 'lantern', 1);
    }
    for (const obstacle of this.obstacles) {
      if (obstacle.kind === 'brazier') {
        add(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, 'brazier', 1);
      }
    }
    if (this.mode.city && !this.activeBuilding) {
      for (const building of this.cityBuildings) add(building.doorX, building.doorY, 'lantern', 0.7);
    }
    if (this.chest) add(this.chest.x, this.chest.y, 'lantern', 0.85);
    for (const portal of this.portals) {
      if (portal.used) continue;
      list.push({
        x: portal.x, y: portal.y, radius: 48, color: '180,124,224', intensity: 0.65,
        phase: hash(portal.x, portal.y) * Math.PI * 2,
      });
    }
    if (this.activeBuilding) {
      if (this.interiorExit) add(this.interiorExit.x, this.interiorExit.y, 'lantern', 0.65);
      if (this.interiorStairs) add(this.interiorStairs.x, this.interiorStairs.y, 'torch', 0.8);
      if (this.interiorChest) add(this.interiorChest.x, this.interiorChest.y, 'lantern', 0.9);
    }
    this.lights = list;
  }

  /** HD-2D: мягкая тьма с вырезанными источниками и ADD-бликами поверх сцены. */
  private drawLighting(camX: number, camY: number): void {
    const lc = this.lightCtx;
    lc.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, W, H);
    const darkness = this.activeBuilding ? 0.86 : this.mode.city ? 0.66 : 0.72;
    lc.fillStyle = `rgba(3,4,7,${darkness})`;
    lc.fillRect(0, 0, W, H);

    lc.globalCompositeOperation = 'destination-out';
    const cut = (sx: number, sy: number, radius: number, intensity: number): void => {
      const x = sx - camX;
      const y = sy - camY;
      if (x < -radius || x > W + radius || y < -radius || y > H + radius) return;
      const gradient = lc.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(0,0,0,${clamp(intensity, 0, 1)})`);
      gradient.addColorStop(0.42, `rgba(0,0,0,${clamp(intensity * 0.74, 0, 1)})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = gradient;
      lc.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    const lightScale = 0.92 + (this.qualityScale - 1) * 0.16;
    if (this.player) cut(this.player.x, this.player.y, 54 * lightScale, 0.82);
    for (const light of this.lights) {
      const flicker = 0.9 + Math.sin(this.time * 5 + light.phase) * 0.1;
      cut(light.x, light.y, light.radius * flicker * lightScale, light.intensity);
    }
    for (const item of this.pickups) {
      if (item.kind !== 'light') continue;
      const kind = item.lightKind ?? 'candle';
      cut(item.x, item.y, LIGHT_RADIUS[kind] * 1.1, 0.88);
    }

    let flashlightRadius = 0;
    let flashlightX = 0;
    let flashlightY = 0;
    let flashlightAngle = 0;
    if (this.player && this.flashlightOn && this.lightBattery > 0) {
      const p = this.player;
      flashlightX = p.x - camX;
      flashlightY = p.y - camY;
      flashlightAngle = p.facing;
      flashlightRadius = 126 + (this.lightBattery / 100) * 22;
      lc.save();
      lc.beginPath();
      lc.moveTo(flashlightX, flashlightY);
      lc.arc(flashlightX, flashlightY, flashlightRadius, flashlightAngle - 0.42, flashlightAngle + 0.42);
      lc.closePath();
      lc.clip();
      const beam = lc.createRadialGradient(flashlightX, flashlightY, 0, flashlightX, flashlightY, flashlightRadius);
      beam.addColorStop(0, 'rgba(0,0,0,0.96)');
      beam.addColorStop(0.58, 'rgba(0,0,0,0.72)');
      beam.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = beam;
      lc.fillRect(
        flashlightX - flashlightRadius, flashlightY - flashlightRadius,
        flashlightRadius * 2, flashlightRadius * 2,
      );
      lc.restore();
    }

    lc.globalCompositeOperation = 'source-over';
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.lightCanvas, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (sx: number, sy: number, radius: number, color: string, alpha: number): void => {
      const x = sx - camX;
      const y = sy - camY;
      if (x < -radius || x > W + radius || y < -radius || y > H + radius) return;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${color},${alpha})`);
      gradient.addColorStop(0.5, `rgba(${color},${alpha * 0.4})`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    if (this.player) glow(this.player.x, this.player.y, 46, '255,205,130', 0.07);
    for (const light of this.lights) {
      glow(light.x, light.y, light.radius * 0.8, light.color, 0.09 * light.intensity);
    }
    for (const item of this.pickups) {
      if (item.kind !== 'light') continue;
      const kind = item.lightKind ?? 'candle';
      glow(item.x, item.y, LIGHT_RADIUS[kind] * 0.7, LIGHT_RGB[kind], 0.12);
    }
    if (flashlightRadius > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(flashlightX, flashlightY);
      ctx.arc(flashlightX, flashlightY, flashlightRadius, flashlightAngle - 0.42, flashlightAngle + 0.42);
      ctx.closePath();
      ctx.clip();
      const beam = ctx.createRadialGradient(flashlightX, flashlightY, 0, flashlightX, flashlightY, flashlightRadius);
      beam.addColorStop(0, 'rgba(255,226,170,0.12)');
      beam.addColorStop(0.6, 'rgba(255,226,170,0.045)');
      beam.addColorStop(1, 'rgba(255,226,170,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(
        flashlightX - flashlightRadius, flashlightY - flashlightRadius,
        flashlightRadius * 2, flashlightRadius * 2,
      );
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, W, H);

    const canShake = this.shake > 0 && this.graphics.shake;
    const shakeX = canShake ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = canShake ? (Math.random() - 0.5) * this.shake : 0;
    const camX = Math.round(this.camX + shakeX);
    const camY = Math.round(this.camY + shakeY);
    this.drawGround(camX, camY);
    this.drawDecorations(camX, camY);
    this.drawObstacles(camX, camY);
    this.drawDungeon(camX, camY);
    this.drawCityInteractables(camX, camY);
    this.drawAnimals(camX, camY);

    for (const item of this.pickups) {
      const x = Math.round(item.x - camX);
      const y = Math.round(item.y - camY + Math.sin(item.bob) * 1.5);
      if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
      // XP-иконки рисуем после эффектов крови, иначе они тонут в луже на месте убийства.
      if (item.kind === 'xp') continue;
      if (item.kind === 'coin') {
        ctx.fillStyle = '#c9a24b';
        ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = '#f0d68a';
        ctx.fillRect(x - 1, y - 1, 2, 2);
      } else if (item.kind === 'chest') {
        ctx.fillStyle = '#0a0b0d';
        ctx.fillRect(x - 6, y - 4, 12, 9);
        ctx.fillStyle = '#6a4c31';
        ctx.fillRect(x - 5, y - 3, 10, 7);
        ctx.fillStyle = '#c9a24b';
        ctx.fillRect(x - 5, y - 3, 10, 2);
        ctx.fillRect(x - 1, y - 3, 2, 7);
      } else if (item.kind === 'light') {
        const kind = item.lightKind ?? 'candle';
        ctx.fillStyle = '#0a0b0d';
        ctx.fillRect(x - 4, y - 4, 9, 10);
        ctx.fillStyle = '#8a8270';
        ctx.fillRect(x - 3, y - 2, 7, 6);
        ctx.fillStyle = kind === 'lantern' ? '#9fd8e8' : '#d99b46';
        ctx.fillRect(x - 2, y - 1, 5, 4);
        const flicker = Math.sin(this.time * 10 + item.bob) * 1.2;
        ctx.fillStyle = '#f0d68a';
        ctx.fillRect(x - 1, y - 5 + flicker, 2, 4);
      } else if (item.kind === 'antidote') {
        const color = ANTIDOTE_COLOR[item.antidote ?? 'poison'];
        const pulse = 0.75 + Math.sin(this.time * 5 + item.bob) * 0.25;
        ctx.globalAlpha = 0.16 * pulse;
        ctx.fillStyle = color;
        ctx.fillRect(x - 7, y - 8, 15, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0a0b0d';
        ctx.fillRect(x - 4, y - 5, 9, 11);
        ctx.fillStyle = '#c9c4b4';
        ctx.fillRect(x - 3, y - 6, 7, 2);
        ctx.fillStyle = color;
        ctx.fillRect(x - 3, y - 3, 7, 6);
        ctx.fillStyle = '#f4ecd8';
        ctx.fillRect(x - 1, y - 2, 3, 1);
        ctx.fillRect(x, y - 3, 1, 3);
      } else {
        ctx.fillStyle = '#a33a3a';
        ctx.fillRect(x - 3, y - 1, 6, 2);
        ctx.fillRect(x - 1, y - 3, 2, 6);
      }
    }

    for (const mine of this.mines) {
      const x = Math.round(mine.x - camX);
      const y = Math.round(mine.y - camY);
      ctx.fillStyle = '#0a0b0d';
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = mine.color;
      ctx.fillRect(x - 2, y - 2, 4, 4);
      ctx.fillStyle = '#f0d68a';
      ctx.fillRect(x - 1, y - 1, 1, 1);
    }

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const x = Math.round(enemy.x - camX);
      const y = Math.round(enemy.y - camY);
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const size = enemy.def.boss ? 48 : 32;
      const sprite = characterSprite(`enemy:${enemy.def.id}`);
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      if (enemy.flash > 0) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - size / 2 + 2, y - size / 2 + 2, size - 4, size - 4);
        ctx.globalAlpha = 1;
      }
      if (enemy.slow > 0) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#9fd8e8';
        ctx.fillRect(x - size / 2 + 2, y - size / 2 + 2, size - 4, size - 4);
        ctx.globalAlpha = 1;
      }
      if (enemy.hp < enemy.maxHp || enemy.def.boss) {
        const barW = enemy.def.boss ? 44 : 18;
        const hpRatio = clamp(enemy.hp / enemy.maxHp, 0, 1);
        ctx.fillStyle = '#050608';
        ctx.fillRect(x - barW / 2 - 1, y - size / 2 - 5, barW + 2, 4);
        ctx.fillStyle = enemy.def.boss ? '#a33a3a' : '#8b4a4a';
        ctx.fillRect(x - barW / 2, y - size / 2 - 4, Math.round(barW * hpRatio), 2);
      }
    }

    for (const shot of this.enemyProjectiles) {
      const x = Math.round(shot.x - camX);
      const y = Math.round(shot.y - camY);
      const r = shot.radius;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = shot.color;
      ctx.fillRect(x - r - 1, y - r - 1, (r + 1) * 2, (r + 1) * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = shot.color;
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
      ctx.fillStyle = '#f0c07a';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    for (const shot of this.projectiles) {
      const x = Math.round(shot.x - camX);
      const y = Math.round(shot.y - camY);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = shot.color;
      ctx.fillRect(Math.round(x - shot.vx * 0.035) - shot.radius / 2, Math.round(y - shot.vy * 0.035) - shot.radius / 2, shot.radius, shot.radius);
      ctx.globalAlpha = 1;
      ctx.fillStyle = shot.color;
      ctx.fillRect(x - shot.radius / 2, y - shot.radius / 2, shot.radius, shot.radius);
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(x - 1, y - 1, 1, 1);
    }

    this.drawEffects(camX, camY);

    // Поверх крови: иконки опыта остаются заметными прямо на месте убийства.
    for (const item of this.pickups) {
      if (item.kind !== 'xp') continue;
      const x = Math.round(item.x - camX);
      const y = Math.round(item.y - camY + Math.sin(item.bob) * 1.5);
      if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 7 + item.bob);
      // Ромб-кристалл вместо креста: крест читался как аптечка, а не опыт.
      const core = item.value > 2 ? '#d7a9ff' : '#8fd7ff';
      ctx.globalAlpha = 0.16 + pulse * 0.2;
      ctx.fillStyle = core;
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = core;
      ctx.fillRect(x, y - 5, 1, 1);
      ctx.fillRect(x - 1, y - 4, 3, 2);
      ctx.fillRect(x - 2, y - 2, 5, 4);
      ctx.fillRect(x - 1, y + 2, 3, 2);
      ctx.fillRect(x, y + 4, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 2, 2, 2);
    }

    if (this.player) {
      const p = this.player;
      const x = Math.round(p.x - camX);
      const y = Math.round(p.y - camY);
      for (const id of ['poison', 'burn', 'infection'] as StatusId[]) {
        if (this.statuses[id] <= 0) continue;
        ctx.globalAlpha = 0.22 + Math.sin(this.time * 8 + x) * 0.08;
        ctx.fillStyle = STATUS_COLORS[id];
        ctx.fillRect(x - 17, y - 17, 34, 34);
        ctx.globalAlpha = 1;
      }
      const sprite = characterSprite(`class:${this.classId}`);
      if (this.graphics.motionBlur) {
        for (const ghost of this.moveTrail) {
          ctx.globalAlpha = 0.16 * (ghost.life / ghost.max);
          ctx.drawImage(sprite, Math.round(ghost.x - camX) - 16, Math.round(ghost.y - camY) - 16, 32, 32);
        }
        ctx.globalAlpha = 1;
      }
      const bob = this.walking ? Math.round(Math.sin(this.time * 13) * 1.2) : 0;
      if (p.invuln <= 0 || Math.floor(this.time * 14) % 2 === 0) {
        ctx.drawImage(sprite, x - 16, y - 16 + bob, 32, 32);
        const skin = getSkin(this.storage.data.equippedSkin);
        if (skin) {
          ctx.fillStyle = skin.color;
          ctx.fillRect(x - 4, y - 14 + bob, 8, 4);
          ctx.fillStyle = skin.accent;
          ctx.fillRect(x - 1, y - 16 + bob, 2, 3);
        }
      }
      // Сглаженная отдача: оружие откатывается и возвращается без дёрганья.
      const kick = this.weaponKick * 3;
      drawHeldWeapon(
        ctx, this.weapon,
        x + Math.cos(p.facing) * (8 - kick),
        y + Math.sin(p.facing) * (8 - kick) + bob,
        p.facing, 0.75,
      );
    }

    if (this.graphics.lighting) this.drawLighting(camX, camY);

    // Лёгкий vignette по краям экрана.
    ctx.fillStyle = 'rgba(5,6,8,0.28)';
    ctx.fillRect(0, 0, W, 3);
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillRect(0, 0, 3, H);
    ctx.fillRect(W - 3, 0, 3, H);

    // Прицел рисуется поверх тьмы и vignette, иначе он тонет в затемнении.
    if (this.state === 'playing') this.drawCrosshair();

    // Карта — только боевой HUD. В меню/паузе канвас всё равно виден под оверлеем,
    // поэтому рисуем её исключительно в активном забеге.
    if (this.state === 'playing') this.drawMinimap();
  }

  private drawAnimals(camX: number, camY: number): void {
    if (!this.graphics.animals) return;
    const ctx = this.ctx;
    for (const animal of this.animals) {
      const x = Math.round(animal.x - camX);
      const y = Math.round(animal.y - camY);
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const flap = Math.sin(animal.phase) > 0;
      if (animal.kind === 'rat') {
        ctx.fillStyle = '#4d463d';
        ctx.fillRect(x - 4, y - 2, 7, 4);
        ctx.fillRect(x + 2, y - 4, 2, 2);
        ctx.fillStyle = '#2b2723';
        ctx.fillRect(x - 6, y, 3, 1);
        ctx.fillStyle = '#d06a4a';
        ctx.fillRect(x + 3, y - 1, 1, 1);
      } else if (animal.kind === 'crow') {
        ctx.fillStyle = '#1a1c22';
        ctx.fillRect(x - 3, y - 2, 6, 4);
        ctx.fillRect(x + 3, y - 1, 2, 1);
        ctx.fillStyle = flap ? '#2d313a' : '#111318';
        ctx.fillRect(x - 6, y - (flap ? 3 : 1), 4, 2);
        ctx.fillRect(x + 2, y - (flap ? 3 : 1), 4, 2);
        ctx.fillStyle = '#c9a24b';
        ctx.fillRect(x + 4, y - 1, 1, 1);
      } else if (animal.kind === 'bat') {
        ctx.fillStyle = '#3a2a44';
        ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = flap ? '#52405e' : '#2a1d33';
        ctx.fillRect(x - 7, y - (flap ? 4 : 0), 5, 2);
        ctx.fillRect(x + 2, y - (flap ? 4 : 0), 5, 2);
        ctx.fillStyle = '#c95a5a';
        ctx.fillRect(x - 1, y - 1, 1, 1);
        ctx.fillRect(x + 1, y - 1, 1, 1);
      } else if (animal.kind === 'beetle') {
        ctx.fillStyle = '#263a2c';
        ctx.fillRect(x - 3, y - 2, 6, 4);
        ctx.fillStyle = '#6f9c62';
        ctx.fillRect(x - 2, y - 2, 4, 2);
        ctx.fillStyle = '#12160f';
        ctx.fillRect(x, y - 3, 1, 1);
        ctx.fillRect(x - 4, y + 2, 1, 2);
        ctx.fillRect(x + 3, y + 2, 1, 2);
      } else {
        ctx.fillStyle = '#5c6168';
        ctx.fillRect(x - 5, y - 3, 9, 5);
        ctx.fillRect(x + 2, y - 5, 3, 3);
        ctx.fillStyle = '#787e86';
        ctx.fillRect(x - 3, y - 5, 2, 2);
        ctx.fillRect(x, y - 5, 2, 2);
        ctx.fillStyle = '#e0b866';
        ctx.fillRect(x + 3, y - 4, 1, 1);
        ctx.fillRect(x - 7, y - 2, 3, 1);
      }
    }
  }

  /** Прицел поверх затемнения: заменяет системный курсор в активном забеге. */
  private drawCrosshair(): void {
    const ctx = this.ctx;
    const pointer = this.input.pointer();
    const style = this.crosshair.style;
    if (!pointer.active || !this.crosshair.enabled || style === 'off') return;
    const x = Math.round(pointer.x);
    const y = Math.round(pointer.y);
    const tint = this.shotColor ?? '#f0d68a';
    const recoil = this.player && this.player.fireTimer > 0 ? 1 : 0;
    ctx.save();
    ctx.strokeStyle = tint;
    ctx.fillStyle = tint;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.shadowColor = tint;
    ctx.shadowBlur = 2 + recoil;
    ctx.globalAlpha = 0.98;
    if (style === 'dot') {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 5 + recoil, 0, Math.PI * 2);
      ctx.stroke();
    } else if (style === 'ring') {
      ctx.beginPath();
      ctx.arc(x, y, 6 + recoil, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
        ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
        ctx.stroke();
      }
    } else if (style === 'rune') {
      const spin = this.time * 0.6;
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        const px = Math.cos(a) * (7 + recoil);
        const py = Math.sin(a) * (7 + recoil);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const gap = 3 + recoil;
      const len = 5;
      ctx.beginPath();
      ctx.moveTo(x - len - gap, y);
      ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y);
      ctx.lineTo(x + len + gap, y);
      ctx.moveTo(x, y - len - gap);
      ctx.lineTo(x, y - gap);
      ctx.moveTo(x, y + gap);
      ctx.lineTo(x, y + len + gap);
      ctx.stroke();
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  /** Компактная тактическая карта: рельеф, улицы, строения, цели и стрелка игрока. */
  private drawMinimap(): void {
    const ctx = this.ctx;
    const mw = 104;
    const mh = 78;
    const mx = W - mw - 7;
    const my = 27;
    const headerH = 9;
    const footerH = 8;
    const mapY = my + headerH;
    const mapH = mh - headerH - footerH;
    const sx = mw / this.worldW;
    const sy = mapH / this.worldH;
    const px = (x: number): number => mx + x * sx;
    const py = (y: number): number => mapY + y * sy;

    if (!this.showMinimap) {
      ctx.fillStyle = 'rgba(5,6,8,0.88)';
      ctx.fillRect(W - 54, my, 47, 10);
      ctx.strokeStyle = 'rgba(201,162,75,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(W - 54, my, 47, 10);
      ctx.fillStyle = '#c9a24b';
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[M] КАРТА', W - 30, my + 7);
      return;
    }

    // Рамка и шапка.
    ctx.fillStyle = 'rgba(3,4,6,0.94)';
    ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    ctx.strokeStyle = 'rgba(201,162,75,0.72)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 3, my - 3, mw + 6, mh + 6);
    ctx.fillStyle = '#080a0d';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = 'rgba(201,162,75,0.15)';
    ctx.fillRect(mx + 1, my + 1, mw - 2, headerH - 1);
    ctx.fillStyle = '#e0c78d';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(this.activeBuilding ? 'ПЛАН' : 'КАРТА', mx + 3, my + 7);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8a8d94';
    ctx.fillText(`${Math.round(this.player?.x ?? 0)}:${Math.round(this.player?.y ?? 0)}`, mx + mw - 3, my + 7);

    ctx.save();
    ctx.beginPath();
    ctx.rect(mx + 1, mapY, mw - 2, mapH);
    ctx.clip();

    ctx.fillStyle = '#101317';
    ctx.fillRect(mx, mapY, mw, mapH);
    ctx.strokeStyle = 'rgba(216,211,199,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = mx + 12; x < mx + mw; x += 12) {
      ctx.moveTo(x, mapY);
      ctx.lineTo(x, mapY + mapH);
    }
    for (let y = mapY + 12; y < mapY + mapH; y += 12) {
      ctx.moveTo(mx, y);
      ctx.lineTo(mx + mw, y);
    }
    ctx.stroke();

    // Биомы открытого мира — цветные зоны по координатам, как и на самой карте.
    if (this.mode.openWorld && !this.activeBuilding) {
      const cellW = 720;
      const cellH = 540;
      for (let y = 0; y < this.worldH; y += cellH) {
        for (let x = 0; x < this.worldW; x += cellW) {
          ctx.globalAlpha = 0.24;
          ctx.fillStyle = BIOMES[this.biomeIndexAt(x + cellW / 2, y + cellH / 2)].accent;
          ctx.fillRect(px(x), py(y), cellW * sx + 1, cellH * sy + 1);
        }
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(180,188,198,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < this.worldW; x += 960) {
        ctx.moveTo(px(x), mapY);
        ctx.lineTo(px(x), mapY + mapH);
      }
      for (let y = 0; y < this.worldH; y += 720) {
        ctx.moveTo(mx, py(y));
        ctx.lineTo(mx + mw, py(y));
      }
      ctx.stroke();
    } else if (this.mode.city && !this.activeBuilding) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = this.biome.accent;
      ctx.fillRect(mx, mapY, mw, mapH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(174,182,192,0.34)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let col = 0; col <= 9; col += 1) {
        const x = px(this.cityRoadX(col));
        ctx.moveTo(x, mapY);
        ctx.lineTo(x, mapY + mapH);
      }
      for (let row = 0; row <= 6; row += 1) {
        const y = py(this.cityRoadY(row));
        ctx.moveTo(mx, y);
        ctx.lineTo(mx + mw, y);
      }
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = this.biome.accent;
      ctx.fillRect(mx, mapY, mw, mapH);
      ctx.globalAlpha = 1;
    }

    // Статичные объекты: стены, здания, машины, ориентиры.
    for (const obstacle of this.obstacles) {
      const color = obstacle.kind === 'building' ? '#68717c'
        : obstacle.kind === 'car' ? '#a56b43'
          : obstacle.kind === 'brazier' ? '#d99b46'
            : obstacle.kind === 'tree' ? '#35543a'
              : obstacle.kind === 'crate' ? '#8a6f45'
                : obstacle.kind === 'furniture' ? '#4a3f36' : '#464b52';
      const x = px(obstacle.x);
      const y = py(obstacle.y);
      const w = Math.max(1, obstacle.w * sx);
      const h = Math.max(1, obstacle.h * sy);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      if (obstacle.kind === 'building') {
        ctx.strokeStyle = 'rgba(224,199,141,0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }
    for (const building of this.cityBuildings) {
      if (building.clearedFloors <= 0) continue;
      ctx.fillStyle = '#e0c78d';
      ctx.fillRect(px(building.x + building.w / 2) - 1, py(building.y + building.h / 2) - 1, 2, 2);
    }
    for (const cache of this.lootCaches) {
      if (cache.claimed) continue;
      ctx.fillStyle = cache.kind === 'relic' ? '#9fd8e8' : '#f0d68a';
      ctx.fillRect(Math.round(px(cache.x)) - 1, Math.round(py(cache.y)) - 1, 2, 2);
    }

    if (this.dungeon?.active) {
      ctx.strokeStyle = '#c9a24b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px(this.dungeon.centerX), py(this.dungeon.centerY), 165 * sx, 165 * sy, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const portal of this.portals) {
      if (portal.used) continue;
      ctx.fillStyle = '#b47ce0';
      ctx.fillRect(Math.round(px(portal.x)) - 1, Math.round(py(portal.y)) - 1, 3, 3);
    }
    if (this.interiorExit) {
      ctx.fillStyle = '#6f9c62';
      ctx.fillRect(Math.round(px(this.interiorExit.x)) - 1, Math.round(py(this.interiorExit.y)) - 1, 3, 3);
    }
    if (this.interiorStairs) {
      ctx.fillStyle = '#9fb6c4';
      ctx.fillRect(Math.round(px(this.interiorStairs.x)) - 1, Math.round(py(this.interiorStairs.y)) - 1, 3, 3);
    }
    const mapTarget = this.chest ?? this.interiorChest;
    if (mapTarget) {
      ctx.fillStyle = '#f0d68a';
      ctx.fillRect(Math.round(px(mapTarget.x)) - 2, Math.round(py(mapTarget.y)) - 2, 4, 4);
    }
    for (const pickup of this.pickups) {
      ctx.fillStyle = pickup.kind === 'antidote'
        ? ANTIDOTE_COLOR[pickup.antidote ?? 'poison']
        : pickup.kind === 'xp' ? '#c8a8ff' : pickup.kind === 'light' ? '#d99b46' : '#c9a24b';
      ctx.fillRect(Math.round(px(pickup.x)), Math.round(py(pickup.y)), pickup.kind === 'antidote' ? 2 : 1, 1);
    }
    if (this.graphics.animals) {
      ctx.fillStyle = '#6b7078';
      for (const animal of this.animals) {
        ctx.fillRect(Math.round(px(animal.x)), Math.round(py(animal.y)), 1, 1);
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const ex = Math.round(px(enemy.x));
      const ey = Math.round(py(enemy.y));
      ctx.fillStyle = enemy.def.boss ? '#ff6b6b' : '#a33a3a';
      if (enemy.def.boss) {
        ctx.beginPath();
        ctx.moveTo(ex, ey - 3);
        ctx.lineTo(ex + 3, ey);
        ctx.lineTo(ex, ey + 3);
        ctx.lineTo(ex - 3, ey);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(ex, ey, 1, 1);
      }
    }

    const p = this.player;
    if (p) {
      const playerX = px(p.x);
      const playerY = py(p.y);
      // Конус обзора и видимая область камеры.
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#f0d68a';
      ctx.beginPath();
      ctx.moveTo(playerX, playerY);
      ctx.arc(playerX, playerY, 12, p.facing - 0.42, p.facing + 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(240,214,138,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px(this.camX), py(this.camY), Math.max(2, W * sx), Math.max(2, H * sy));
      ctx.strokeStyle = 'rgba(240,214,138,0.28)';
      ctx.beginPath();
      ctx.arc(playerX, playerY, 3.5 + Math.sin(this.time * 5) * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.translate(playerX, playerY);
      ctx.rotate(p.facing);
      ctx.fillStyle = '#f4ecd8';
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-3, -3);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Нижняя строка: название локации и легенда.
    const footerY = my + mh - footerH;
    ctx.fillStyle = 'rgba(201,162,75,0.12)';
    ctx.fillRect(mx + 1, footerY, mw - 2, footerH - 1);
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c9a24b';
    const mapLabel = this.activeBuilding
      ? `${this.activeBuilding.name} · ${this.interiorFloor}/${this.activeBuilding.floors}`
      : this.mode.city
        ? `ГОРОД · РАЙОН ${this.arena}`
        : this.mode.openWorld
          ? `ОТКРЫТЫЙ МИР · ${this.biome.name}`
          : `L${this.arena} ${this.biome.name}`;
    ctx.fillText(mapLabel, mx + 4, footerY + 7);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8a8d94';
    ctx.fillText('M — СКРЫТЬ', mx + mw - 4, footerY + 7);

    // Угловые засечки в стиле Некрополя.
    ctx.fillStyle = 'rgba(201,162,75,0.8)';
    for (const [cx, cy] of [[mx - 3, my - 3], [mx + mw, my - 3], [mx - 3, my + mh], [mx + mw, my + mh]]) {
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
    }
  }

  private drawObstacles(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const obstacle of this.obstacles) {
      const x = Math.round(obstacle.x - camX);
      const y = Math.round(obstacle.y - camY);
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
      switch (obstacle.kind) {
        case 'wall':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 1, y - 1, obstacle.w + 2, obstacle.h + 2);
          ctx.fillStyle = this.biome.accent;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x, y, obstacle.w, obstacle.h);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#050608';
          ctx.fillRect(x + 2, y + 2, Math.max(1, obstacle.w - 8), 1);
          break;
        case 'pillar':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 1, y - 1, obstacle.w + 2, obstacle.h + 2);
          ctx.fillStyle = '#4a4d52';
          ctx.fillRect(x, y, obstacle.w, obstacle.h);
          ctx.fillStyle = '#6d7075';
          ctx.fillRect(x + 1, y + 1, obstacle.w - 2, 2);
          break;
        case 'barrel':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 1, y - 1, obstacle.w + 2, obstacle.h + 2);
          ctx.fillStyle = '#6a4c31';
          ctx.fillRect(x, y, obstacle.w, obstacle.h);
          ctx.fillStyle = '#a33a3a';
          ctx.fillRect(x, y + 4, obstacle.w, 2);
          if (obstacle.hp < 26) {
            ctx.fillStyle = '#2a1c14';
            ctx.fillRect(x + 5, y + 2, 3, 3);
          }
          break;
        case 'tree':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x + 3, y + 4, 8, 11);
          ctx.fillStyle = '#3b3327';
          ctx.fillRect(x + 5, y + 5, 4, 9);
          ctx.fillStyle = '#4d5a3c';
          ctx.fillRect(x + 1, y + 1, 12, 4);
          ctx.fillRect(x + 3, y, 8, 2);
          break;
        case 'building': {
          const building = this.cityBuildings.find((b) => b.x === obstacle.x && b.y === obstacle.y);
          if (!building || building.openWorld) {
            // Дома открытого мира рисуются настоящими CC0-тайлами µFantasy.
            this.drawCc0House(x, y, obstacle.w, obstacle.h, Math.floor(hash(obstacle.x, obstacle.y) * 3));
            break;
          }
          ctx.fillStyle = '#08090c';
          ctx.fillRect(x - 2, y - 2, obstacle.w + 4, obstacle.h + 4);
          const style = building?.style ?? 'archive';
          const wall = style === 'hospital' ? '#3b4144'
            : style === 'crypt' || style === 'vault' ? '#2d3038'
              : style === 'forge' ? '#40342a'
                : style === 'tower' ? '#303743' : '#343941';
          const accent = style === 'hospital' ? '#9fc0b4'
            : style === 'forge' ? '#e5813a'
              : style === 'crypt' ? '#b06bd8'
                : style === 'barracks' ? '#c9a24b' : '#7c93a8';
          ctx.fillStyle = wall;
          ctx.fillRect(x, y, obstacle.w, obstacle.h);
          ctx.fillStyle = '#15191e';
          ctx.fillRect(x + 4, y + 4, obstacle.w - 8, obstacle.h - 8);
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x, y, obstacle.w, 3);
          ctx.fillRect(x, y, 3, obstacle.h);
          ctx.globalAlpha = 1;
          if (style === 'tower') {
            ctx.fillStyle = '#222830';
            ctx.fillRect(x + obstacle.w / 2 - 18, y - 22, 36, 22);
            ctx.fillStyle = accent;
            ctx.fillRect(x + obstacle.w / 2 - 2, y - 30, 4, 9);
          } else if (style === 'hospital') {
            ctx.fillStyle = '#d8d3c7';
            ctx.fillRect(x + obstacle.w / 2 - 2, y + 18, 4, 16);
            ctx.fillRect(x + obstacle.w / 2 - 8, y + 23, 16, 4);
          } else if (style === 'forge') {
            ctx.fillStyle = '#5c5142';
            ctx.fillRect(x + obstacle.w - 30, y - 18, 12, 18);
            ctx.fillStyle = '#d99b46';
            ctx.fillRect(x + obstacle.w - 28, y - 16, 8, 5);
          }
          // Крышу и стены рисуем только полностью непрозрачными тайлами атласа:
          // полупрозрачные стыковые ячейки давали «дыры» и кривые швы при движении камеры.
          const roofAtlas = cc0Image(CC0_PATHS.topdown);
          if (roofAtlas) {
            const roofTiles = [[1, 0], [4, 1], [4, 0]];
            for (let col = 0; col < Math.ceil(obstacle.w / 16); col += 1) {
              const tile = roofTiles[col % roofTiles.length];
              ctx.drawImage(roofAtlas, tile[0] * 8, tile[1] * 8, 8, 8, x + col * 16, y + 3, 16, 16);
            }
            for (let col = 0; col < Math.ceil(obstacle.w / 16); col += 1) {
              for (let row = 0; y + 20 + row * 16 < y + obstacle.h - 22; row += 1) {
                ctx.drawImage(
                  roofAtlas, (col % 5) * 8, (3 + (row % 4)) * 8, 8, 8,
                  x + col * 16, y + 20 + row * 16, 16, 16,
                );
              }
            }
            ctx.globalAlpha = 0.42;
            ctx.fillStyle = '#0a0c10';
            ctx.fillRect(x, y + 3, obstacle.w, 16);
            ctx.globalAlpha = 1;
          }
          const floors = building?.floors ?? 3;
          for (let f = 0; f < floors; f += 1) {
            const wy = y + 26 + f * Math.floor((obstacle.h - 48) / Math.max(1, floors));
            for (let wx = x + 18; wx < x + obstacle.w - 18; wx += 30) {
              ctx.fillStyle = (f + wx) % 3 === 0 ? accent : '#4b525b';
              ctx.fillRect(wx, wy, 9, 8);
              ctx.fillStyle = '#0d0f12';
              ctx.fillRect(wx + 4, wy, 1, 8);
            }
          }
          ctx.fillStyle = '#101317';
          ctx.fillRect(x + obstacle.w / 2 - 13, y + obstacle.h - 22, 26, 22);
          ctx.fillStyle = '#8a6f45';
          ctx.fillRect(x + obstacle.w / 2 - 11, y + obstacle.h - 20, 22, 20);
          if (building) {
            const stars = '★'.repeat(Math.min(5, building.clearedFloors)) + '☆'.repeat(Math.max(0, building.floors - building.clearedFloors));
            ctx.fillStyle = '#f0d68a';
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${stars} ×${this.cityEnemyScale(building).toFixed(1)}`, x + obstacle.w / 2, y - 4);
            ctx.fillStyle = '#aab0b6';
            ctx.fillText(building.name, x + obstacle.w / 2, y - 12);
          }
          break;
        }
        case 'crate':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 1, y - 1, obstacle.w + 2, obstacle.h + 2);
          ctx.fillStyle = '#7a5a3c';
          ctx.fillRect(x, y, obstacle.w, obstacle.h);
          ctx.fillStyle = '#a47c50';
          ctx.fillRect(x + 1, y + 1, obstacle.w - 2, 2);
          ctx.fillRect(x + obstacle.w / 2 - 1, y + 1, 2, obstacle.h - 2);
          if (obstacle.hp < 18) ctx.fillStyle = '#2a1c14';
          else ctx.fillStyle = '#503a28';
          ctx.fillRect(x + 3, y + 5, 3, 3);
          break;
        case 'car': {
          ctx.fillStyle = '#08090b';
          ctx.fillRect(x - 1, y + 2, obstacle.w + 2, obstacle.h - 1);
          const rust = ['#5c3b32', '#3d4a52', '#4a3f36', '#33413a'][Math.floor(obstacle.x) % 4];
          ctx.fillStyle = rust;
          ctx.fillRect(x, y + 4, obstacle.w, 7);
          ctx.fillRect(x + 5, y, 12, 6);
          ctx.fillStyle = '#12161a';
          ctx.fillRect(x + 7, y + 1, 4, 4);
          ctx.fillRect(x + 12, y + 1, 3, 4);
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x + 3, y + 10, 5, 3);
          ctx.fillRect(x + 14, y + 10, 5, 3);
          ctx.fillStyle = '#8a6f45';
          ctx.fillRect(x + obstacle.w - 4, y + 5, 3, 2);
          ctx.fillStyle = 'rgba(122,20,20,0.55)';
          ctx.fillRect(x + 2, y + 8, 7, 2);
          break;
        }
        case 'furniture':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 1, y - 1, obstacle.w + 2, obstacle.h + 2);
          ctx.fillStyle = '#5a4430';
          ctx.fillRect(x, y, obstacle.w, obstacle.h);
          ctx.fillStyle = '#7a5c3e';
          ctx.fillRect(x + 1, y + 1, obstacle.w - 2, 2);
          ctx.fillStyle = '#2c2118';
          ctx.fillRect(x + 2, y + 4, obstacle.w / 2 - 3, obstacle.h - 6);
          ctx.fillRect(x + obstacle.w / 2 + 1, y + 4, obstacle.w / 2 - 3, obstacle.h - 6);
          ctx.fillStyle = '#c9a24b';
          ctx.fillRect(x + obstacle.w / 2 - 3, y + 7, 1, 1);
          ctx.fillRect(x + obstacle.w / 2 + 2, y + 7, 1, 1);
          break;
        case 'brazier': {
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 1, y + 4, obstacle.w + 2, obstacle.h - 2);
          ctx.fillStyle = '#5c5142';
          ctx.fillRect(x, y + 5, obstacle.w, obstacle.h - 4);
          const flicker = Math.sin(this.time * 9 + obstacle.x) * 1.5;
          ctx.fillStyle = '#d99b46';
          ctx.fillRect(x + 3, y + flicker, 6, 6);
          ctx.fillStyle = '#f0d68a';
          ctx.fillRect(x + 5, y + 2 + flicker, 2, 3);
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = '#d99b46';
          ctx.fillRect(x - 20, y - 18, 52, 52);
          ctx.globalAlpha = 1;
          break;
        }
      }
    }
  }


  /** Входы в здания, лестницы, выходы и сундуки города и открытого мира. */
  private drawCityInteractables(camX: number, camY: number): void {
    const ctx = this.ctx;
    if (!this.mode.city && !this.mode.openWorld) return;

    if (!this.activeBuilding) {
      if (this.merchant) {
        const x = Math.round(this.merchant.x - camX);
        const y = Math.round(this.merchant.y - camY);
        if (x > -30 && x < W + 30 && y > -30 && y < H + 30) {
          const pulse = 0.6 + Math.sin(this.time * 4) * 0.25;
          ctx.globalAlpha = 0.22 * pulse;
          ctx.fillStyle = '#f0d68a';
          ctx.fillRect(x - 20, y - 24, 40, 40);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#050608';
          ctx.fillRect(x - 9, y - 12, 18, 18);
          ctx.fillStyle = '#4a3c6b';
          ctx.fillRect(x - 7, y - 10, 14, 16);
          ctx.fillStyle = '#2a2238';
          ctx.fillRect(x - 5, y - 14, 10, 7);
          ctx.fillStyle = '#d9b17a';
          ctx.fillRect(x - 3, y - 10, 2, 2);
          ctx.fillRect(x + 2, y - 10, 2, 2);
          ctx.fillStyle = '#f0d68a';
          ctx.fillRect(x - 1, y - 22, 2, 8);
          ctx.fillRect(x - 5, y - 20, 10, 4);
          ctx.font = '7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('ТОРГОВЕЦ', x, y - 27);
        }
      }
      for (const cache of this.lootCaches) {
        if (cache.claimed) continue;
        const x = Math.round(cache.x - camX);
        const y = Math.round(cache.y - camY);
        if (x < -24 || x > W + 24 || y < -24 || y > H + 24) continue;
        const color = cache.kind === 'armory' ? '#d9b17a'
          : cache.kind === 'relic' ? '#9fd8e8' : '#a9c47c';
        const pulse = 0.5 + Math.sin(this.time * 4 + cache.x) * 0.25;
        ctx.globalAlpha = 0.2 * pulse;
        ctx.fillStyle = color;
        ctx.fillRect(x - 14, y - 14, 28, 28);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#050608';
        ctx.fillRect(x - 8, y - 6, 16, 12);
        ctx.fillStyle = '#5a4632';
        ctx.fillRect(x - 7, y - 5, 14, 10);
        ctx.fillStyle = color;
        ctx.fillRect(x - 7, y - 5, 14, 2);
        ctx.fillRect(x - 1, y - 5, 2, 10);
        ctx.fillStyle = '#f0d68a';
        ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ТАЙНИК', x, y - 10);
      }
      for (const building of this.cityBuildings) {
        const x = Math.round(building.doorX - camX);
        const y = Math.round(building.doorY - camY);
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const pulse = 0.55 + Math.sin(this.time * 3 + building.id) * 0.2;
        ctx.globalAlpha = 0.18 * pulse;
        ctx.fillStyle = '#f0d68a';
        ctx.fillRect(x - 16, y - 14, 32, 28);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#c9a24b';
        ctx.fillRect(x - 1, y - 6, 2, 12);
        ctx.fillRect(x - 4, y - 3, 2, 6);
        ctx.fillRect(x + 2, y - 3, 2, 6);
        ctx.fillStyle = '#0a0b0d';
        ctx.fillRect(x - 5, y + 4, 10, 3);
      }
      return;
    }

    if (this.interiorExit) {
      const x = Math.round(this.interiorExit.x - camX);
      const y = Math.round(this.interiorExit.y - camY);
      ctx.fillStyle = '#0a0b0d';
      ctx.fillRect(x - 9, y - 13, 18, 26);
      ctx.fillStyle = '#4d6a4a';
      ctx.fillRect(x - 7, y - 11, 14, 24);
      ctx.fillStyle = '#8fbf63';
      ctx.fillRect(x - 5, y - 9, 10, 20);
      ctx.fillStyle = '#d8d3c7';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ВЫХОД', x, y - 16);
    }

    if (this.interiorCleared && this.interiorStairs) {
      const x = Math.round(this.interiorStairs.x - camX);
      const y = Math.round(this.interiorStairs.y - camY);
      ctx.fillStyle = '#0a0b0d';
      ctx.fillRect(x - 12, y - 12, 24, 24);
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? '#8a8d94' : '#5c6268';
        ctx.fillRect(x - 10 + i * 2, y + 8 - i * 5, 20 - i * 4, 4);
      }
      ctx.fillStyle = '#f0d68a';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ВВЕРХ', x, y - 16);
    }

    if (this.interiorCleared && this.interiorChest) {
      const x = Math.round(this.interiorChest.x - camX);
      const y = Math.round(this.interiorChest.y - camY);
      const pulse = 0.5 + Math.sin(this.time * 5) * 0.25;
      ctx.globalAlpha = 0.2 * pulse;
      ctx.fillStyle = '#f0d68a';
      ctx.fillRect(x - 18, y - 18, 36, 36);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0b0d';
      ctx.fillRect(x - 10, y - 6, 20, 14);
      ctx.fillStyle = '#6a4c31';
      ctx.fillRect(x - 9, y - 5, 18, 12);
      ctx.fillStyle = '#c9a24b';
      ctx.fillRect(x - 9, y - 5, 18, 3);
      ctx.fillRect(x - 1, y - 5, 2, 12);
      ctx.fillStyle = '#f0d68a';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('СУНДУК', x, y - 10);
    }
  }

  /** Порталы, границы подземелья и сундук с наградой. */
  private drawDungeon(camX: number, camY: number): void {
    const ctx = this.ctx;

    for (const portal of this.portals) {
      if (portal.used) continue;
      const x = Math.round(portal.x - camX);
      const y = Math.round(portal.y - camY);
      if (x < -24 || x > W + 24 || y < -24 || y > H + 24) continue;
      const pulse = 0.75 + Math.sin(this.time * 3 + portal.x) * 0.25;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(portalSprite(), x - 32, y - 54, 64, 80);
      // Живой вихрь поверх модели: вращение, пульсация и вылетающие искры.
      ctx.translate(x, y - 9);
      ctx.rotate(this.time * 1.5 + portal.x * 0.01);
      ctx.strokeStyle = '#e8cfff';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5 * pulse;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.ellipse(0, 0, 4 + i * 3, 9 + i, i * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#d8b4f0';
      ctx.globalAlpha = 0.7 + Math.sin(this.time * 5 + portal.y) * 0.3;
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + this.time * 0.7;
        const r = 20 + (i % 3) * 5 + Math.sin(this.time * 2 + i) * 2;
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 10 + Math.sin(a) * r * 0.7), 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#c9a24b';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ПОРТАЛ · ПОДЗЕМЕЛЬЕ', x, y - 58);
    }

    if (this.dungeon?.active) {
      const d = this.dungeon;
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 4) * 0.12;
      ctx.fillStyle = '#c9a24b';
      for (let i = 0; i < 40; i += 1) {
        const a = (i / 40) * Math.PI * 2;
        const x = Math.round(d.centerX + Math.cos(a) * 165 - camX);
        const y = Math.round(d.centerY + Math.sin(a) * 165 - camY);
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#c9a24b';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ПОДЗЕМЕЛЬЕ', Math.round(d.centerX - camX), Math.round(d.centerY - camY - 130));
    }

    if (this.chest) {
      const x = Math.round(this.chest.x - camX);
      const y = Math.round(this.chest.y - camY);
      if (x > -24 && x < W + 24 && y > -24 && y < H + 24) {
        const pulse = 0.55 + Math.sin(this.time * 5) * 0.25;
        ctx.globalAlpha = 0.18 * pulse;
        ctx.fillStyle = '#f0d68a';
        ctx.fillRect(x - 16, y - 16, 32, 32);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0a0b0d';
        ctx.fillRect(x - 9, y - 5, 18, 13);
        ctx.fillStyle = '#6a4c31';
        ctx.fillRect(x - 8, y - 4, 16, 11);
        ctx.fillStyle = '#c9a24b';
        ctx.fillRect(x - 8, y - 4, 16, 2);
        ctx.fillRect(x - 1, y - 4, 2, 11);
        ctx.fillStyle = '#f0d68a';
        ctx.fillRect(x - 1, y - 1, 2, 3);
        ctx.fillStyle = '#f0d68a';
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('СУНДУК', x, y - 9);
      }
    }
  }

  /** Дом из тайлов µFantasy (CC0) с тёмной прорисовкой поверх для стиля Некрополя. */
  private drawCc0House(x: number, y: number, w: number, h: number, variant = 0): void {
    const ctx = this.ctx;
    // Текстуры µFantasy (CC0): 8×8 исходные ячейки, в игре тайл = 16 world units.
    // Используем локальный номер колонки: иначе сдвиг камеры «заставлял» крышу ползти.
    const atlas = cc0Image(CC0_PATHS.topdown);
    const cols = Math.ceil(w / 16);
    const roofRows = h >= 64 ? 2 : 1;
    const roofH = roofRows * 16;
    ctx.fillStyle = '#050607';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#2b211b';
    ctx.fillRect(x, y, w, h);
    if (atlas) {
      // Только непрозрачные ячейки атласа: стыковые тайлы row0/row2 имеют alpha < 1
      // и выглядели как дыры и «съехавшие» швы на маленьких домах 48×40.
      const roofTiles = [[1, 0], [4, 1], [4, 0]];
      for (let row = 0; row < roofRows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const tile = roofTiles[(col + row + variant) % roofTiles.length];
          ctx.drawImage(atlas, tile[0] * 8, tile[1] * 8, 8, 8, x + col * 16, y + row * 16, 16, 16);
        }
      }
      // Каменные стены: ряды 3–6, колонки 0–4 — сплошные тайлы без прозрачных краёв.
      for (let col = 0; col < cols; col += 1) {
        for (let row = 0; y + roofH + row * 16 < y + h; row += 1) {
          ctx.drawImage(
            atlas, ((col + variant) % 5) * 8, (3 + ((row + variant) % 4)) * 8, 8, 8,
            x + col * 16, y + roofH + row * 16, 16, 16,
          );
        }
      }
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#0d0a09';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#0a0c0e';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);
    ctx.fillRect(x, y + roofH, w, 1);
    // Дверь и окна рисуются поверх стен и тайлов, чтобы вход читался с любого расстояния.
    ctx.fillStyle = '#5a4632';
    const doorW = 14;
    ctx.fillRect(x + w / 2 - doorW / 2, y + h - 14, doorW, 14);
    ctx.fillStyle = '#1b1512';
    ctx.fillRect(x + w / 2 - doorW / 2 + 2, y + h - 12, doorW - 4, 12);
    ctx.fillStyle = '#d99b46';
    ctx.fillRect(x + 5, y + h - 20, 6, 5);
    ctx.fillRect(x + w - 11, y + h - 20, 6, 5);
    ctx.fillStyle = '#f0d68a';
    ctx.fillRect(x + 7, y + h - 19, 2, 2);
    ctx.fillRect(x + w - 9, y + h - 19, 2, 2);
  }

  private drawGround(camX: number, camY: number): void {
    const ctx = this.ctx;
    const stoneFloor = cc0Image(CC0_PATHS.floor);
    const topdown = cc0Image(CC0_PATHS.topdown);
    const jungle = cc0Image(CC0_PATHS.jungle);
    const startX = Math.floor(camX / 16);
    const startY = Math.floor(camY / 16);
    const endX = startX + Math.ceil(W / 16) + 1;
    const endY = startY + Math.ceil(H / 16) + 1;
    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        const h = hash(gx, gy);
        const tx = gx * 16;
        const ty = gy * 16;
        const dx = tx - camX;
        const dy = ty - camY;
        const onRoad = !this.activeBuilding && (
          (this.mode.city && this.isCityRoad(tx + 8, ty + 8)) ||
          (this.mode.openWorld && this.isOpenRoad(tx + 8, ty + 8))
        );
        const palette = this.activeBuilding ? INTERIOR_GROUND
          : onRoad ? ['#2b2f35', '#262a30', '#20242a', '#1a1d22'] as [string, string, string, string]
            : this.mode.city ? CITY_GROUND
              : this.mode.openWorld ? BIOMES[this.biomeIndexAt(tx, ty)].ground
                : this.biome.ground;
        const [gHigh, gMid, gLow, gDark] = palette;
        const shade = h > 0.72 ? gHigh : h > 0.42 ? gMid : h > 0.14 ? gLow : gDark;
        ctx.fillStyle = shade;
        ctx.fillRect(dx, dy, 16, 16);

        // CC0-тайлы поверх процедурной подложки. Атласы µFantasy имеют шаг 8 пикселей,
        // DungeonTileset II — 16; раньше шаг путали, поэтому текстура почти не читалась.
        let atlas: HTMLImageElement | null = null;
        let sx = 0;
        let sy = 0;
        let cellSize = 16;
        let tint = 0.32;
        if (this.activeBuilding) {
          atlas = stoneFloor ?? topdown;
          sx = Math.floor(h * 5) * 16;
          sy = 16;
        } else if (onRoad) {
          // Каменное полотно дороги из DungeonTileset II, без «крыш» из µFantasy.
          atlas = stoneFloor;
          sx = (1 + Math.floor(hash(gx * 3, gy * 7) * 4)) * 16;
          sy = Math.floor(hash(gx * 5, gy * 13) * 3) * 16;
          tint = 0.2;
        } else if (this.mode.openWorld) {
          atlas = jungle ?? stoneFloor;
          cellSize = atlas === stoneFloor ? 16 : 8;
          const index = this.biomeIndexAt(tx, ty);
          const cells = index === 4
            ? [[0, 3], [1, 3], [2, 6], [0, 6], [4, 3]]
            : [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [0, 6], [2, 6], [3, 6], [4, 6]];
          const cell = cells[Math.floor(hash(gx * 5, gy * 11) * cells.length)];
          sx = cell[0] * cellSize;
          sy = cell[1] * cellSize;
        } else {
          atlas = stoneFloor ?? topdown;
          sx = Math.floor(hash(gx * 13, gy * 17) * 6) * 16;
          sy = h > 0.55 ? 16 : 0;
          tint = 0.38;
        }
        if (atlas) {
          ctx.drawImage(atlas, sx, sy, cellSize, cellSize, dx, dy, 16, 16);
          ctx.globalAlpha = tint;
          ctx.fillStyle = shade;
          ctx.fillRect(dx, dy, 16, 16);
          ctx.globalAlpha = 1;
        }

        if (onRoad) {
          ctx.fillStyle = hash(gx * 3, gy * 5) > 0.6 ? '#3a3e45' : '#21252a';
          ctx.fillRect(dx + 2, dy + 7, 10, 1);
          if (hash(gx * 7, gy * 3) > 0.86) {
            ctx.fillStyle = '#14171a';
            ctx.fillRect(dx + 6, dy + 2, 1, 12);
          }
        } else if (h > 0.88) {
          ctx.fillStyle = this.mode.openWorld ? '#0d0f0c' : '#101215';
          ctx.fillRect(dx + 3, dy + 5, 6, 1);
          ctx.fillRect(dx + 8, dy + 6, 1, 4);
        }
        if (!onRoad && this.graphics.vegetation) this.drawGroundGrass(gx, gy, dx, dy, h);
        if (this.festive && !this.activeBuilding && hash(gx * 13, gy * 17) > 0.72) {
          ctx.globalAlpha = 0.42;
          ctx.fillStyle = '#c3d0d2';
          ctx.fillRect(dx, dy, 16, 16);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /** Густая трава прямо на полу; реагирует на шаги игрока и ветер. */
  private drawGroundGrass(gx: number, gy: number, dx: number, dy: number, h: number): void {
    const density = this.mode.openWorld ? 0.72 : this.mode.city ? 0.2 : 0.34;
    if (h > density) return;
    const patch = this.trampled.get(gx * 100000 + gy);
    const press = patch ? clamp(patch.life, 0, 1) : 0;
    const bendX = patch ? patch.bx * press * 4 : 0;
    const bendY = patch ? patch.by * press * 2 : 0;
    const sway = Math.sin(this.time * 1.7 + gx * 0.9 + gy * 0.6) * 0.7;
    const index = this.mode.openWorld
      ? this.biomeIndexAt(gx * 16 + 8, gy * 16 + 8)
      : this.biomeIndex;
    const colors = index === 4
      ? ['#4f6b4e', '#6f8a63', '#86977a']
      : index === 0 ? ['#3a4a37', '#4d5c42', '#5e6b4d']
        : ['#38543a', '#4d6e47', '#63835a'];
    const ctx = this.ctx;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const bx = 3 + Math.floor(hash(gx * 41 + i * 7, gy * 43 + i * 11) * 10);
      const height = Math.round((4 + Math.floor(hash(gx * 19 + i, gy * 23 + i) * 3)) * (1 - press * 0.6));
      if (height < 1) continue;
      ctx.strokeStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(dx + bx, dy + 13);
      ctx.lineTo(dx + bx + sway + bendX * (0.6 + height / 8), dy + 13 - height + bendY);
      ctx.stroke();
      if (height > 4) {
        ctx.fillStyle = '#7a9665';
        ctx.fillRect(dx + bx + Math.round(sway + bendX), dy + 13 - height + Math.round(bendY), 1, 1);
      }
    }
  }

  private drawDecorations(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const deco of this.decorations) {
      const x = Math.round(deco.x - camX);
      const y = Math.round(deco.y - camY);
      if (x < -12 || x > W + 12 || y < -12 || y > H + 12) continue;
      switch (deco.kind) {
        case 'grave':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 5, y - 8, 11, 13);
          ctx.fillStyle = '#5c5b56';
          ctx.fillRect(x - 4, y - 7, 9, 11);
          ctx.fillStyle = '#383a38';
          ctx.fillRect(x - 1, y - 5, 2, 6);
          ctx.fillRect(x - 3, y - 4, 6, 2);
          break;
        case 'candle':
          ctx.fillStyle = '#8a8270';
          ctx.fillRect(x - 1, y - 3, 3, 6);
          ctx.fillStyle = '#d99b46';
          ctx.fillRect(x, y - 6, 1, 3);
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = '#d99b46';
          ctx.fillRect(x - 5, y - 8, 11, 11);
          ctx.globalAlpha = 1;
          break;
        case 'lantern': {
          // CC0-фонарь из DungeonTileset II + живое пламя и подсветка из системы света.
          const lamp = cc0Image(CC0_PATHS.floor);
          const flicker = Math.sin(this.time * 7 + deco.x * 0.13) * 1.4;
          ctx.fillStyle = '#050607';
          ctx.fillRect(x - 9, y - 16, 18, 22);
          if (lamp) {
            ctx.drawImage(lamp, 16, 80, 16, 16, x - 8, y - 15, 16, 16);
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = '#100c08';
            ctx.fillRect(x - 8, y - 15, 16, 16);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = '#4b4032';
          ctx.fillRect(x - 1, y + 1, 2, 6);
          ctx.fillStyle = '#d99b46';
          ctx.fillRect(x - 2, y - 8 + flicker, 4, 5);
          ctx.fillStyle = '#f0d68a';
          ctx.fillRect(x - 1, y - 7 + flicker, 2, 3);
          break;
        }
        case 'bone':
          ctx.fillStyle = '#8d887c';
          ctx.fillRect(x - 4, y, 8, 2);
          ctx.fillRect(x - 5, y - 1, 2, 4);
          ctx.fillRect(x + 3, y - 1, 2, 4);
          break;
        case 'pine': {
          // Модель дерева из кэша + лёгкое покачивание кроны.
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(this.time * 1.1 + deco.x * 0.05) * 0.022);
          ctx.globalAlpha = 0.97;
          ctx.drawImage(treeSprite(deco.tint ?? 0, this.festive), -24, -60, 48, 64);
          ctx.restore();
          break;
        }
        case 'snow':
          ctx.globalAlpha = 0.62;
          ctx.fillStyle = '#c3d0d2';
          ctx.fillRect(x - 9, y - 2, 18, 5);
          ctx.fillRect(x - 5, y - 5, 10, 4);
          ctx.globalAlpha = 1;
          break;
        case 'rubble':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 4, y - 2, 9, 6);
          ctx.fillStyle = '#575149';
          ctx.fillRect(x - 3, y - 1, 7, 4);
          ctx.fillStyle = '#777066';
          ctx.fillRect(x - 2, y - 1, 3, 2);
          break;
        case 'puddle':
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#2f4a3c';
          ctx.fillRect(x - 5, y - 2, 10, 4);
          ctx.fillStyle = '#466b53';
          ctx.fillRect(x - 2, y - 1, 5, 2);
          ctx.globalAlpha = 1;
          break;
        case 'rug':
          ctx.fillStyle = '#2a2027';
          ctx.fillRect(x - 16, y - 7, 32, 14);
          ctx.fillStyle = '#6a3f44';
          ctx.fillRect(x - 14, y - 5, 28, 10);
          ctx.fillStyle = '#c9a24b';
          ctx.fillRect(x - 10, y - 3, 20, 1);
          ctx.fillRect(x - 10, y + 2, 20, 1);
          ctx.fillRect(x - 2, y - 3, 4, 6);
          break;
        case 'shelf':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 9, y - 10, 19, 17);
          ctx.fillStyle = '#5a4430';
          ctx.fillRect(x - 8, y - 9, 17, 15);
          ctx.fillStyle = '#3a2c20';
          ctx.fillRect(x - 7, y - 4, 15, 2);
          ctx.fillStyle = '#7fa4b8';
          ctx.fillRect(x - 5, y - 8, 2, 4);
          ctx.fillStyle = '#8fbf63';
          ctx.fillRect(x + 2, y - 8, 2, 4);
          ctx.fillStyle = '#b83848';
          ctx.fillRect(x + 4, y + 1, 2, 4);
          break;
        case 'table':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 12, y - 4, 25, 9);
          ctx.fillStyle = '#6a4c31';
          ctx.fillRect(x - 11, y - 3, 23, 4);
          ctx.fillStyle = '#8a6f45';
          ctx.fillRect(x - 10, y - 3, 21, 1);
          ctx.fillStyle = '#3a2c20';
          ctx.fillRect(x - 9, y + 1, 2, 5);
          ctx.fillRect(x + 8, y + 1, 2, 5);
          ctx.fillStyle = '#d99b46';
          ctx.fillRect(x + 2, y - 6, 2, 3);
          break;
        case 'torch': {
          const flicker = Math.sin(this.time * 9 + deco.x) * 1.5;
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 2, y - 2, 5, 8);
          ctx.fillStyle = '#5c5142';
          ctx.fillRect(x - 1, y - 1, 3, 6);
          ctx.fillStyle = '#d99b46';
          ctx.fillRect(x - 2, y - 7 + flicker, 5, 6);
          ctx.fillStyle = '#f0d68a';
          ctx.fillRect(x - 1, y - 5 + flicker, 2, 4);
          break;
        }
        case 'brazier': {
          const flicker = Math.sin(this.time * 8 + deco.y) * 1.5;
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 5, y - 1, 11, 8);
          ctx.fillStyle = '#5c5142';
          ctx.fillRect(x - 4, y, 9, 5);
          ctx.fillStyle = '#d99b46';
          ctx.fillRect(x - 3, y - 6 + flicker, 7, 7);
          ctx.fillStyle = '#f0d68a';
          ctx.fillRect(x - 1, y - 4 + flicker, 3, 4);
          break;
        }
        case 'stone':
          ctx.fillStyle = '#0a0b0d';
          ctx.fillRect(x - 4, y - 3, 9, 7);
          ctx.fillStyle = '#565b60';
          ctx.fillRect(x - 3, y - 2, 7, 5);
          ctx.fillStyle = '#777c81';
          ctx.fillRect(x - 2, y - 2, 4, 1);
          break;
        case 'grass': {
          const patch = this.trampled.get(Math.floor(deco.x / 16) * 100000 + Math.floor(deco.y / 16));
          const press = patch ? clamp(patch.life, 0, 1) : 0;
          const bendX = patch ? Math.round(patch.bx * press * 4) : 0;
          const bendY = patch ? Math.round(patch.by * press * 2) : 0;
          const sway = Math.sin(this.time * 1.6 + deco.x) + bendX;
          const height = 1 - press * 0.55;
          const green = deco.tint === 1 ? '#4f7048' : deco.tint === 2 ? '#3d5e3c' : '#5f7f52';
          ctx.fillStyle = green;
          ctx.fillRect(x - 3, y - Math.round(4 * height) + bendY, 1, Math.round(5 * height));
          ctx.fillRect(x - 1 + sway, y - Math.round(6 * height) + bendY, 1, Math.round(7 * height));
          ctx.fillRect(x + 2 - sway, y - Math.round(4 * height) + bendY, 1, Math.round(5 * height));
          ctx.fillStyle = '#7a9665';
          ctx.fillRect(x + bendX, y - Math.round(6 * height) + bendY, 1, 2);
          break;
        }
        case 'bush': {
          const patch = this.trampled.get(Math.floor(deco.x / 16) * 100000 + Math.floor(deco.y / 16));
          const press = patch ? clamp(patch.life, 0, 1) : 0;
          const shake = patch ? Math.round(patch.bx * press * 3 + Math.sin(this.time * 9 + deco.y) * press) : 0;
          const squash = Math.round(press * 2);
          ctx.fillStyle = '#17251b';
          ctx.fillRect(x - 8, y - 5 + squash, 17, 8 - squash);
          ctx.fillStyle = deco.tint === 1 ? '#35543a' : '#2c4a33';
          ctx.fillRect(x - 7 + shake, y - 6 + squash, 15, 7 - squash);
          ctx.fillStyle = '#456b45';
          ctx.fillRect(x - 4 + shake, y - 7 + squash, 8, 3);
          ctx.fillStyle = '#1a2b1e';
          ctx.fillRect(x - 2 + shake, y - 4 + squash, 5, 2);
          break;
        }
        case 'flower': {
          const sway = Math.sin(this.time * 1.2 + deco.y) * 0.8;
          ctx.fillStyle = '#3e5e3a';
          ctx.fillRect(x + sway, y - 4, 1, 6);
          ctx.fillStyle = deco.tint === 0 ? '#a8526a' : deco.tint === 1 ? '#c9a24b' : '#8d71ad';
          ctx.fillRect(x - 2 + sway, y - 8, 5, 4);
          ctx.fillStyle = '#e8d6a0';
          ctx.fillRect(x + sway, y - 7, 1, 2);
          break;
        }
        case 'mushroom': {
          ctx.fillStyle = '#9a9180';
          ctx.fillRect(x - 1, y - 3, 3, 5);
          ctx.fillStyle = deco.tint === 0 ? '#7c3a3a' : '#8a6f45';
          ctx.fillRect(x - 4, y - 6, 9, 4);
          ctx.fillStyle = '#c2b29a';
          ctx.fillRect(x - 2, y - 5, 1, 1);
          ctx.fillRect(x + 1, y - 5, 1, 1);
          break;
        }
        case 'vine': {
          ctx.fillStyle = '#2d4b32';
          ctx.fillRect(x, y - 14, 2, 15);
          ctx.fillStyle = '#466e43';
          ctx.fillRect(x - 4, y - 10, 5, 2);
          ctx.fillRect(x + 2, y - 6, 5, 2);
          ctx.fillRect(x - 3, y - 3, 5, 2);
          break;
        }
        case 'root': {
          ctx.fillStyle = '#3a3026';
          ctx.fillRect(x - 7, y - 2, 14, 3);
          ctx.fillRect(x - 5, y + 1, 3, 2);
          ctx.fillRect(x + 3, y + 1, 4, 2);
          ctx.fillStyle = '#5a4836';
          ctx.fillRect(x - 6, y - 2, 8, 1);
          break;
        }
        default:
          ctx.fillStyle = '#24282d';
          ctx.fillRect(x - 2, y - 1, 5, 3);
          break;
      }
    }
  }

  private drawEffects(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const effect of this.effects) {
      const ratio = clamp(effect.life / effect.max, 0, 1);
      const x = Math.round(effect.x - camX);
      const y = Math.round(effect.y - camY);
      ctx.globalAlpha = ratio;
      if (effect.kind === 'ring') {
        const r = effect.r * (1 - ratio * 0.7);
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (effect.kind === 'slash') {
        const r = effect.r * (1 - ratio * 0.15);
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r, effect.angle - effect.arc / 2, effect.angle + effect.arc / 2);
        ctx.stroke();
      } else if (effect.kind === 'particle') {
        ctx.fillStyle = effect.color;
        ctx.fillRect(x, y, 2, 2);
        ctx.globalAlpha = ratio * 0.35;
        ctx.fillRect(x - 1, y - 1, 4, 4);
        ctx.globalAlpha = ratio;
      } else if (effect.kind === 'splat') {
        ctx.globalAlpha = ratio * 0.72;
        ctx.fillStyle = effect.color;
        const r = effect.r;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2 + r;
          ctx.fillRect(x + Math.cos(a) * r * 1.1 - 1, y + Math.sin(a) * r * 0.65 - 1, 3, 2);
        }
        ctx.globalAlpha = ratio;
      } else if (effect.kind === 'crit') {
        const burst = 1 - ratio;
        const r = 9 + burst * 18;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 + burst * 0.7;
          const inner = i % 2 === 0 ? r * 0.55 : r * 0.85;
          ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.stroke();
        ctx.fillStyle = effect.color;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(effect.text, x, y - 12 - burst * 8);
      } else {
        ctx.fillStyle = effect.color;
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(effect.text, x, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  private hudState(): HudState {
    const p = this.player;
    return {
      time: formatTime(this.time),
      remaining: this.mode.timeLimit ? Math.max(0, this.mode.timeLimit - this.time) : null,
      hint: this.interactHint,
      hintKey: keyLabel(this.storage.data.bindings.interact),
      light: this.lightBattery,
      flashlightOn: this.flashlightOn,
      wave: this.wave,
      kills: p?.kills ?? 0,
      coins: (p?.coins ?? 0) + this.storage.data.coins,
      diamonds: this.storage.data.diamonds,
      hp: Math.max(0, Math.round(p?.hp ?? 0)),
      maxHp: Math.round(p?.stats.maxHp ?? 1),
      armor: Math.round(p?.stats.armor ?? 0),
      crit: p?.stats.crit ?? 0,
      armorSet: this.armorSet,
      xp: p?.xp ?? 0,
      xpNext: p?.xpNext ?? 1,
      level: p?.level ?? 1,
      weaponName: this.weapon.name,
      biomeName: this.location.name,
      modeName: this.mode.name,
      arena: this.arena,
      abilities: this.abilityStates(),
      statuses: (['poison', 'burn', 'infection'] as StatusId[])
        .filter((id) => this.statuses[id] > 0)
        .map((id) => ({
          id,
          label: STATUS_LABELS[id],
          remaining: Math.ceil(this.statuses[id]),
        })),
    };
  }

  /** Клик по кнопке огня в HUD: работает при любом режиме стрельбы. */
  requestFire(): void {
    if (this.state !== 'playing' || !this.player || this.player.fireTimer > 0) return;
    this.fire(this.player);
  }

  private abilityStates(): AbilitySlotState[] {
    const bindings = this.storage.data.bindings;
    const fireMax = this.player ? Math.max(0.06, this.weapon.cooldownMul / this.player.stats.fireRate) : 1;
    const slots: AbilitySlotState[] = [
      {
        id: 'fire', name: this.storage.data.bindings.fireMode === 'manual'
          ? `Огонь [${keyLabel(bindings.fire)}]` : 'Огонь (авто)',
        icon: '✦', key: 'ЛКМ', cd: this.player?.fireTimer ?? 0, max: fireMax,
      },
      { id: 'dash', name: 'Рывок', icon: '➤', key: keyLabel(bindings.dash), cd: this.cooldowns.dash ?? 0, max: DASH_COOLDOWN },
      { id: 'heal', name: 'Аптечка', icon: '✚', key: keyLabel(bindings.heal), cd: this.healCd, max: HEAL_COOLDOWN, charges: this.healCharges },
    ];
    for (const slot of ['a1', 'a2', 'ultimate'] as AbilitySlot[]) {
      const ability = abilityForSlot(this.classId, slot);
      if (!ability) continue;
      const key = slot === 'a1' ? bindings.ability1 : slot === 'a2' ? bindings.ability2 : bindings.ultimate;
      slots.push({
        id: ability.id, slot, name: ability.name, icon: ability.icon,
        key: keyLabel(key), cd: this.cooldowns[ability.id] ?? 0, max: ability.cooldown,
      });
    }
    return slots;
  }


  private emitHud(): void {
    this.callbacks.hud(this.hudState());
  }
}
