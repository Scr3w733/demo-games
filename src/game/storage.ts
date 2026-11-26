import { CAMPAIGN_CLEAR_TIME } from './campaign';
import type { CampaignRecord } from './campaign';
import {
  BASE_UPGRADES,
  CLASSES,
  DEFAULT_BINDINGS,
  DIAMOND_PACKAGES,
  GAME_MODES,
  MAX_MODULES,
  MAX_PROFILE_LEVEL,
  MODULES,
  SKINS,
  WEAPONS,
  baseUpgradeCost,
  xpForLevel,
} from './config';
import type { Bindings, ClassId, CrosshairSettings, GraphicsSettings, LocaleId, MusicSettings } from './types';

export interface MailMessage {
  id: number;
  title: string;
  body: string;
  at: number;
  read: boolean;
}

export interface SaveData {
  best: number;
  coins: number;
  diamonds: number;
  runs: number;
  muted: boolean;
  classId: string;
  weaponId: string;
  bindings: Bindings;
  graphics: GraphicsSettings;
  music: MusicSettings;
  crosshair: CrosshairSettings;
  unlockedWeapons: string[];
  unlockedClasses: ClassId[];
  skins: string[];
  equippedSkin: string | null;
  modules: string[];
  equippedModules: string[];
  cases: number;
  modeId: string;
  level: number;
  xp: number;
  locale: LocaleId;
  /** Per-level campaign progress, keyed by profile level. */
  campaign: Record<string, CampaignRecord>;
  campaignUnlocked: number;
  selectedLevel: number;
  baseUpgrades: Record<string, number>;
  mailbox: MailMessage[];
  mailSeq: number;
  /** Миграция управления: старые сохранения получают мышиное наведение. */
  inputRevision?: number;
}

const KEY = 'grimhollow.save.v1';

/* Пределы для значений, пришедших из localStorage. JSON.parse не гарантирует,
 * что число конечно, а строка — безопасна для вставки в HTML. */
const MAX_SAVE_NUMBER = 1_000_000_000_000;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 4_000;
const MAX_KEY_LENGTH = 32;
const GRAPHICS_QUALITIES = ['low', 'medium', 'high', 'ultra'] as const;
const CROSSHAIR_STYLES = ['cross', 'dot', 'ring', 'rune', 'off'] as const;

const SAVE_KEYS: Array<keyof SaveData> = [
  'best', 'coins', 'diamonds', 'runs', 'muted', 'classId', 'weaponId', 'bindings',
  'graphics', 'music', 'crosshair', 'unlockedWeapons', 'unlockedClasses', 'skins',
  'equippedSkin', 'modules', 'equippedModules', 'cases', 'modeId', 'level', 'xp',
  'locale', 'campaign', 'campaignUnlocked', 'selectedLevel', 'baseUpgrades',
  'mailbox', 'mailSeq', 'inputRevision',
];

const defaults: SaveData = {
  best: 0,
  coins: 0,
  diamonds: 0,
  runs: 0,
  muted: false,
  classId: 'soldier',
  weaponId: 'soldier_rifle',
  bindings: { ...DEFAULT_BINDINGS },
  graphics: {
    quality: 'high', blood: true, particles: true, lighting: true, vegetation: true, animals: true, shake: true,
    festive: new Date().getMonth() === 11, motionBlur: true,
  },
  music: { enabled: true, volume: 0.7 },
  crosshair: { enabled: true, style: 'cross' },
  unlockedWeapons: [...new Set(CLASSES.map((cls) => cls.starter))],
  unlockedClasses: CLASSES.filter((cls) => cls.unlock === 'starter').map((cls) => cls.id),
  skins: [],
  equippedSkin: null,
  modules: [],
  equippedModules: [],
  cases: 0,
  modeId: 'classic',
  level: 1,
  xp: 0,
  locale: 'ru',
  campaign: {},
  campaignUnlocked: 1,
  selectedLevel: 1,
  baseUpgrades: {},
  mailbox: [],
  mailSeq: 1,
  inputRevision: 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function safeText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

/** Идентификатор клавиши: короткая строка без HTML-метасимволов и управляющих символов. */
function safeKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const key = value.slice(0, MAX_KEY_LENGTH);
  if (!key || /[<>&\u0000-\u001f\u007f]/.test(key)) return fallback;
  return key;
}

function sanitizeBindings(raw: unknown): Bindings {
  const source = isRecord(raw) ? raw : {};
  const result: Bindings = { ...DEFAULT_BINDINGS };
  for (const field of Object.keys(DEFAULT_BINDINGS) as Array<keyof Bindings>) {
    const value = source[field];
    if (field === 'aimMode') {
      result.aimMode = value === 'auto' || value === 'mouse' ? value : DEFAULT_BINDINGS.aimMode;
    } else if (field === 'fireMode') {
      result.fireMode = value === 'auto' || value === 'manual' ? value : DEFAULT_BINDINGS.fireMode;
    } else {
      (result as unknown as Record<string, string>)[field] = safeKey(value, DEFAULT_BINDINGS[field] as string);
    }
  }
  return result;
}

function sanitizeGraphics(raw: unknown): GraphicsSettings {
  const source = isRecord(raw) ? raw : {};
  const quality = source.quality;
  return {
    quality: GRAPHICS_QUALITIES.includes(quality as (typeof GRAPHICS_QUALITIES)[number])
      ? quality as GraphicsSettings['quality']
      : defaults.graphics.quality,
    blood: typeof source.blood === 'boolean' ? source.blood : defaults.graphics.blood,
    particles: typeof source.particles === 'boolean' ? source.particles : defaults.graphics.particles,
    lighting: typeof source.lighting === 'boolean' ? source.lighting : defaults.graphics.lighting,
    vegetation: typeof source.vegetation === 'boolean' ? source.vegetation : defaults.graphics.vegetation,
    animals: typeof source.animals === 'boolean' ? source.animals : defaults.graphics.animals,
    shake: typeof source.shake === 'boolean' ? source.shake : defaults.graphics.shake,
    festive: typeof source.festive === 'boolean' ? source.festive : defaults.graphics.festive,
    motionBlur: typeof source.motionBlur === 'boolean' ? source.motionBlur : defaults.graphics.motionBlur,
  };
}

function sanitizeMusic(raw: unknown): MusicSettings {
  const source = isRecord(raw) ? raw : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : defaults.music.enabled,
    volume: safeNumber(source.volume, defaults.music.volume, 0, 1),
  };
}

function sanitizeCrosshair(raw: unknown): CrosshairSettings {
  const source = isRecord(raw) ? raw : {};
  const style = source.style;
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : defaults.crosshair.enabled,
    style: CROSSHAIR_STYLES.includes(style as (typeof CROSSHAIR_STYLES)[number])
      ? style as CrosshairSettings['style']
      : defaults.crosshair.style,
  };
}

function sanitizeIdArray(raw: unknown, allowed: ReadonlySet<string>, fallback: readonly string[], max: number): string[] {
  const source = Array.isArray(raw) ? raw : fallback;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of source) {
    if (typeof value !== 'string' || value.length > 128 || !allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

export class Storage {
  data: SaveData;

  constructor() {
    this.data = {
      ...defaults,
      bindings: { ...defaults.bindings },
      graphics: { ...defaults.graphics },
      music: { ...defaults.music },
      crosshair: { ...defaults.crosshair },
      unlockedWeapons: [...defaults.unlockedWeapons],
      unlockedClasses: [...defaults.unlockedClasses],
      skins: [...defaults.skins],
      modules: [...defaults.modules],
      equippedModules: [...defaults.equippedModules],
      baseUpgrades: { ...defaults.baseUpgrades },
      mailbox: [...defaults.mailbox],
      campaign: {},
    };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) throw new Error('Некорректное сохранение');
        // Копируем только известные ключи: __proto__ из JSON не должен менять прототип данных.
        for (const key of SAVE_KEYS) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) {
            (this.data as unknown as Record<string, unknown>)[key] = parsed[key];
          }
        }
      }

      this.data.bindings = sanitizeBindings(this.data.bindings);
      this.data.graphics = sanitizeGraphics(this.data.graphics);
      this.data.music = sanitizeMusic(this.data.music);
      this.data.crosshair = sanitizeCrosshair(this.data.crosshair);

      this.data.muted = this.data.muted === true;
      this.data.best = safeInteger(this.data.best, 0, 0, MAX_SAVE_NUMBER);
      this.data.coins = safeInteger(this.data.coins, 0, 0, MAX_SAVE_NUMBER);
      this.data.diamonds = safeInteger(this.data.diamonds, 0, 0, MAX_SAVE_NUMBER);
      this.data.runs = safeInteger(this.data.runs, 0, 0, MAX_SAVE_NUMBER);
      this.data.cases = safeInteger(this.data.cases, 0, 0, MAX_SAVE_NUMBER);
      this.data.level = safeInteger(this.data.level, 1, 1, MAX_PROFILE_LEVEL);
      this.data.xp = safeInteger(this.data.xp, 0, 0, MAX_SAVE_NUMBER);
      this.data.mailSeq = safeInteger(this.data.mailSeq, 1, 1, MAX_SAVE_NUMBER);
      this.data.inputRevision = safeInteger(this.data.inputRevision, defaults.inputRevision ?? 3, 0, 100);
      this.data.locale = this.data.locale === 'en' ? 'en' : 'ru';

      if ((this.data.inputRevision ?? 0) < 3) {
        // Раньше стояло автонаведение и автоматическая стрельба — из-за этого
        // курсор казался бесполезным. Миграция включает мышь, огонь по ЛКМ и прицел.
        this.data.bindings.aimMode = 'mouse';
        this.data.bindings.fireMode = 'manual';
        this.data.crosshair = { ...defaults.crosshair };
        this.data.inputRevision = 3;
      }

      const weaponIds = new Set(WEAPONS.map((weapon) => weapon.id));
      this.data.unlockedWeapons = sanitizeIdArray(
        this.data.unlockedWeapons, weaponIds, defaults.unlockedWeapons, WEAPONS.length,
      );
      for (const cls of CLASSES) {
        if (!this.data.unlockedWeapons.includes(cls.starter)) this.data.unlockedWeapons.push(cls.starter);
      }

      const classIds = new Set<string>(CLASSES.map((cls) => cls.id));
      const starterClasses = CLASSES.filter((cls) => cls.unlock === 'starter').map((cls) => cls.id);
      const savedClasses = sanitizeIdArray(this.data.unlockedClasses, classIds, starterClasses, CLASSES.length);
      const classes = new Set<string>([...starterClasses, ...savedClasses]);
      this.data.unlockedClasses = CLASSES.filter((cls) => classes.has(cls.id)).map((cls) => cls.id);

      const skinIds = new Set(SKINS.map((skin) => skin.id));
      const moduleIds = new Set(MODULES.map((module) => module.id));
      this.data.skins = sanitizeIdArray(this.data.skins, skinIds, defaults.skins, SKINS.length);
      this.data.modules = sanitizeIdArray(this.data.modules, moduleIds, defaults.modules, MODULES.length);
      this.data.equippedModules = sanitizeIdArray(
        this.data.equippedModules, moduleIds, defaults.equippedModules, MAX_MODULES,
      ).filter((id) => this.data.modules.includes(id));
      this.data.equippedSkin = typeof this.data.equippedSkin === 'string' && skinIds.has(this.data.equippedSkin)
        ? this.data.equippedSkin
        : null;

      const classId = safeText(this.data.classId, defaults.classId, 64) as ClassId;
      this.data.classId = this.data.unlockedClasses.includes(classId) ? classId : (defaults.classId as ClassId);
      const weaponId = safeText(this.data.weaponId, defaults.weaponId, 128);
      const weapon = WEAPONS.find((item) => item.id === weaponId);
      this.data.weaponId = weapon && weapon.classId === this.data.classId
        && this.data.unlockedWeapons.includes(weaponId)
        ? weaponId
        : (CLASSES.find((cls) => cls.id === this.data.classId)?.starter ?? defaults.weaponId);

      const modeId = safeText(this.data.modeId, defaults.modeId, 64);
      const mode = GAME_MODES.find((item) => item.id === modeId);
      this.data.modeId = mode && (!mode.unlockLevel || this.data.level >= mode.unlockLevel)
        ? modeId
        : defaults.modeId;

      this.data.campaign = this.sanitizeCampaign(this.data.campaign);
      const storedUnlock = safeInteger(this.data.campaignUnlocked, 1, 1, MAX_PROFILE_LEVEL);
      this.data.campaignUnlocked = Math.min(storedUnlock, this.verifiedCampaignUnlock(this.data.campaign));
      this.data.selectedLevel = Math.min(
        this.data.campaignUnlocked,
        safeInteger(this.data.selectedLevel, 1, 1, MAX_PROFILE_LEVEL),
      );

      const upgrades: Record<string, number> = {};
      const rawUpgrades = isRecord(this.data.baseUpgrades) ? this.data.baseUpgrades : {};
      for (const def of BASE_UPGRADES) {
        upgrades[def.id] = safeInteger(rawUpgrades[def.id], 0, 0, def.max);
      }
      this.data.baseUpgrades = upgrades;
      this.data.mailbox = this.sanitizeMailbox(this.data.mailbox);
    } catch {
      // Приватный режим / заблокированный localStorage — игра работает без сохранения.
      // Частично повреждённое сохранение уже очищено значениями по умолчанию выше.
    }
  }

  private sanitizeCampaign(raw: unknown): Record<string, CampaignRecord> {
    const result: Record<string, CampaignRecord> = {};
    if (!isRecord(raw)) return result;
    for (let level = 1; level <= MAX_PROFILE_LEVEL; level += 1) {
      const entry = raw[String(level)];
      if (!isRecord(entry)) continue;
      const bestTime = safeInteger(entry.bestTime, 0, 0, MAX_SAVE_NUMBER);
      const kills = safeInteger(entry.kills, 0, 0, MAX_SAVE_NUMBER);
      const runs = safeInteger(entry.runs, 0, 0, MAX_SAVE_NUMBER);
      result[String(level)] = {
        bestTime,
        kills,
        runs,
        completed: entry.completed === true && bestTime >= CAMPAIGN_CLEAR_TIME,
      };
    }
    return result;
  }

  /** Уровень можно открыть только непрерывной цепочкой реально пройденных уровней. */
  private verifiedCampaignUnlock(campaign: Record<string, CampaignRecord>): number {
    let next = 1;
    while (next < MAX_PROFILE_LEVEL && campaign[String(next)]?.completed) next += 1;
    return next;
  }

  private sanitizeMailbox(raw: unknown): MailMessage[] {
    if (!Array.isArray(raw)) return [];
    const result: MailMessage[] = [];
    for (const entry of raw.slice(-40)) {
      if (!isRecord(entry) || typeof entry.title !== 'string' || typeof entry.body !== 'string') continue;
      result.push({
        id: safeInteger(entry.id, result.length + 1, 1, MAX_SAVE_NUMBER),
        title: entry.title.slice(0, MAX_TITLE_LENGTH),
        body: entry.body.slice(0, MAX_BODY_LENGTH),
        at: safeInteger(entry.at, Date.now(), 0, MAX_SAVE_NUMBER),
        read: entry.read === true,
      });
    }
    return result;
  }

  /** Saves a run to the level campaign. Only a 60+ second survival clears the level. */
  completeCampaignLevel(level: number, time: number, kills: number): { cleared: boolean; nextUnlocked: boolean } {
    const safe = safeInteger(level, 1, 1, MAX_PROFILE_LEVEL);
    const safeTime = safeInteger(time, 0, 0, MAX_SAVE_NUMBER);
    const safeKills = safeInteger(kills, 0, 0, MAX_SAVE_NUMBER);
    const key = String(safe);
    const previous = this.data.campaign[key] ?? { bestTime: 0, kills: 0, runs: 0, completed: false };
    const cleared = safeTime >= CAMPAIGN_CLEAR_TIME || previous.completed;
    this.data.campaign[key] = {
      bestTime: Math.max(previous.bestTime, safeTime),
      kills: Math.max(previous.kills, safeKills),
      runs: previous.runs + 1,
      completed: cleared,
    };
    const nextUnlocked = cleared && safe >= this.data.campaignUnlocked && safe < MAX_PROFILE_LEVEL;
    if (nextUnlocked) this.data.campaignUnlocked = safe + 1;
    this.flush();
    return { cleared, nextUnlocked };
  }

  campaignClearedCount(): number {
    return Object.values(this.data.campaign).filter((record) => record.completed).length;
  }

  /** Внутренняя почта игры. Это не email: реальная отправка потребует сервер. */
  addMail(title: string, body: string): void {
    this.data.mailSeq += 1;
    this.data.mailbox.push({
      id: this.data.mailSeq,
      title: safeText(title, '', MAX_TITLE_LENGTH),
      body: safeText(body, '', MAX_BODY_LENGTH),
      at: Date.now(),
      read: false,
    });
    if (this.data.mailbox.length > 40) this.data.mailbox = this.data.mailbox.slice(-40);
    this.flush();
  }

  readMail(id: number): void {
    const message = this.data.mailbox.find((item) => item.id === id);
    if (!message || message.read) return;
    message.read = true;
    this.flush();
  }

  readAllMail(): void {
    for (const message of this.data.mailbox) message.read = true;
    this.flush();
  }

  baseLevel(): number {
    return 1 + Object.values(this.data.baseUpgrades).reduce((sum, value) => sum + value, 0);
  }

  /** Покупает улучшение базы. Возвращает false, если монет не хватает или оно улучшено до максимума. */
  upgradeBase(id: string): boolean {
    const def = BASE_UPGRADES.find((item) => item.id === id);
    if (!def) return false;
    const current = this.data.baseUpgrades[id] ?? 0;
    if (current >= def.max) return false;
    const cost = baseUpgradeCost(def, current);
    if (this.data.coins < cost) return false;
    const next = { ...this.data.baseUpgrades, [id]: current + 1 };
    this.update({ coins: this.data.coins - cost, baseUpgrades: next });
    this.addMail('Стройка базы', `${def.name} улучшена до ${current + 1} уровня за ${cost} монет.`);
    return true;
  }

  /** Пока единственный способ получить алмазы: обмен за монеты. */
  exchangeCoinsForDiamonds(packageId: string): boolean {
    const pack = DIAMOND_PACKAGES.find((item) => item.id === packageId);
    if (!pack || this.data.coins < pack.coins) return false;
    this.update({
      coins: this.data.coins - pack.coins,
      diamonds: this.data.diamonds + pack.diamonds,
    });
    this.addMail('Обмен валюты', `${pack.coins} монет обменяны на ${pack.diamonds} алмазов. Обратный обмен недоступен.`);
    return true;
  }

  /** Тратит алмазы на премиальные предметы. */
  spendDiamonds(amount: number): boolean {
    const cost = safeInteger(amount, -1, 0, MAX_SAVE_NUMBER);
    if (cost < 0) return false;
    if (cost === 0) return true;
    if (this.data.diamonds < cost) return false;
    this.update({ diamonds: this.data.diamonds - cost });
    return true;
  }

  flush(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Игнорируем: прогресс просто не сохранится.
    }
  }

  /** Начисляет XP профиля. Возвращает число новых уровней и бонусные монеты. */
  addProfileXp(amount: number): { levels: number; coins: number } {
    let rest = safeInteger(amount, 0, 0, MAX_SAVE_NUMBER);
    let levels = 0;
    let coins = 0;
    while (rest > 0 && this.data.level < MAX_PROFILE_LEVEL) {
      const need = xpForLevel(this.data.level);
      const space = need - this.data.xp;
      if (rest < space) {
        this.data.xp += rest;
        rest = 0;
      } else {
        rest -= Math.max(0, space);
        this.data.xp = 0;
        this.data.level += 1;
        levels += 1;
        coins += 60 + this.data.level * 8;
      }
    }
    this.data.xp = safeInteger(this.data.xp, 0, 0, MAX_SAVE_NUMBER);
    this.data.coins = safeInteger(this.data.coins + coins, 0, 0, MAX_SAVE_NUMBER);
    if (this.data.level >= MAX_PROFILE_LEVEL) this.data.xp = 0;
    return { levels, coins };
  }

  update(patch: Partial<SaveData>): void {
    const entries = Object.entries(patch as Record<string, unknown>);
    for (const [key, value] of entries) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      (this.data as unknown as Record<string, unknown>)[key] = value;
    }
    this.flush();
  }
}
