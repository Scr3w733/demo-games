import { CAMPAIGN_CLEAR_TIME } from './campaign';
import type { CampaignRecord } from './campaign';
import { BASE_UPGRADES, CLASSES, DEFAULT_BINDINGS, DIAMOND_PACKAGES, MAX_MODULES, MAX_PROFILE_LEVEL, baseUpgradeCost, xpForLevel } from './config';
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
      if (raw) Object.assign(this.data, JSON.parse(raw) as Partial<SaveData>);
      this.data.bindings = { ...DEFAULT_BINDINGS, ...(this.data.bindings ?? {}) };
      if ((this.data.inputRevision ?? 0) < 3) {
        // Раньше стояло автонаведение и автоматическая стрельба — из-за этого
        // курсор казался бесполезным. Миграция включает мышь, огонь по ЛКМ и прицел.
        this.data.bindings.aimMode = 'mouse';
        this.data.bindings.fireMode = 'manual';
        this.data.crosshair = { ...defaults.crosshair };
        this.data.inputRevision = 3;
      }
      this.data.graphics = { ...defaults.graphics, ...(this.data.graphics ?? {}) };
      if (!['low', 'medium', 'high', 'ultra'].includes(this.data.graphics.quality)) this.data.graphics.quality = 'high';
      this.data.music = { ...defaults.music, ...(this.data.music ?? {}) };
      this.data.music.enabled = Boolean(this.data.music.enabled);
      this.data.music.volume = Math.min(1, Math.max(0, Number(this.data.music.volume ?? defaults.music.volume) || 0));
      this.data.crosshair = { ...defaults.crosshair, ...(this.data.crosshair ?? {}) };
      this.data.crosshair.enabled = Boolean(this.data.crosshair.enabled);
      if (!['cross', 'dot', 'ring', 'rune', 'off'].includes(this.data.crosshair.style)) {
        this.data.crosshair.style = defaults.crosshair.style;
      }
      const unlocked = new Set([...CLASSES.map((cls) => cls.starter), ...(this.data.unlockedWeapons ?? [])]);
      this.data.unlockedWeapons = [...unlocked];
      const classes = new Set<ClassId>([
        ...CLASSES.filter((cls) => cls.unlock === 'starter').map((cls) => cls.id),
        ...(Array.isArray(this.data.unlockedClasses) ? this.data.unlockedClasses : []),
      ]);
      this.data.unlockedClasses = CLASSES.filter((cls) => classes.has(cls.id)).map((cls) => cls.id);
      this.data.skins = Array.isArray(this.data.skins) ? this.data.skins : [];
      this.data.modules = Array.isArray(this.data.modules) ? this.data.modules : [];
      this.data.equippedModules = (Array.isArray(this.data.equippedModules) ? this.data.equippedModules : []).slice(0, MAX_MODULES);
      this.data.cases = Math.max(0, Number(this.data.cases) || 0);
      this.data.diamonds = Math.max(0, Math.floor(Number(this.data.diamonds) || 0));
      this.data.modeId = this.data.modeId || 'classic';
      this.data.level = Math.min(MAX_PROFILE_LEVEL, Math.max(1, Math.floor(Number(this.data.level) || 1)));
      this.data.xp = Math.max(0, Math.floor(Number(this.data.xp) || 0));
      this.data.locale = this.data.locale === 'en' ? 'en' : 'ru';
      this.data.campaign = this.sanitizeCampaign(this.data.campaign);
      this.data.campaignUnlocked = Math.min(
        MAX_PROFILE_LEVEL,
        Math.max(1, Math.floor(Number(this.data.campaignUnlocked) || 1)),
      );
      this.data.selectedLevel = Math.min(
        this.data.campaignUnlocked,
        Math.max(1, Math.floor(Number(this.data.selectedLevel) || 1)),
      );
      const upgrades: Record<string, number> = {};
      for (const def of BASE_UPGRADES) {
        upgrades[def.id] = Math.min(def.max, Math.max(0, Math.floor(Number(this.data.baseUpgrades?.[def.id]) || 0)));
      }
      this.data.baseUpgrades = upgrades;
      this.data.mailbox = (Array.isArray(this.data.mailbox) ? this.data.mailbox : [])
        .filter((message) => message && typeof message.title === 'string')
        .slice(-40);
      this.data.mailSeq = Math.max(1, Math.floor(Number(this.data.mailSeq) || 1));
    } catch {
      // Приватный режим / заблокированный localStorage — игра работает без сохранения.
    }
  }

  private sanitizeCampaign(raw: unknown): Record<string, CampaignRecord> {
    const result: Record<string, CampaignRecord> = {};
    if (!raw || typeof raw !== 'object') return result;
    for (const [key, value] of Object.entries(raw as Record<string, Partial<CampaignRecord>>)) {
      const level = Math.floor(Number(key));
      if (!Number.isFinite(level) || level < 1 || level > MAX_PROFILE_LEVEL || !value) continue;
      result[String(level)] = {
        bestTime: Math.max(0, Math.floor(Number(value.bestTime) || 0)),
        kills: Math.max(0, Math.floor(Number(value.kills) || 0)),
        runs: Math.max(0, Math.floor(Number(value.runs) || 0)),
        completed: Boolean(value.completed),
      };
    }
    return result;
  }

  /** Saves a run to the level campaign. Only a 60+ second survival clears the level. */
  completeCampaignLevel(level: number, time: number, kills: number): { cleared: boolean; nextUnlocked: boolean } {
    const safe = Math.min(MAX_PROFILE_LEVEL, Math.max(1, Math.floor(level) || 1));
    const key = String(safe);
    const previous = this.data.campaign[key] ?? { bestTime: 0, kills: 0, runs: 0, completed: false };
    const cleared = time >= CAMPAIGN_CLEAR_TIME || previous.completed;
    this.data.campaign[key] = {
      bestTime: Math.max(previous.bestTime, Math.floor(time)),
      kills: Math.max(previous.kills, Math.floor(kills)),
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
    this.data.mailbox.push({ id: this.data.mailSeq, title, body, at: Date.now(), read: false });
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
    const cost = Math.max(0, Math.floor(amount));
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
    let rest = Math.max(0, Math.floor(amount));
    let levels = 0;
    let coins = 0;
    while (rest > 0 && this.data.level < MAX_PROFILE_LEVEL) {
      const need = xpForLevel(this.data.level);
      const space = need - this.data.xp;
      if (rest < space) {
        this.data.xp += rest;
        rest = 0;
      } else {
        rest -= space;
        this.data.xp = 0;
        this.data.level += 1;
        levels += 1;
        coins += 60 + this.data.level * 8;
      }
    }
    if (this.data.level >= MAX_PROFILE_LEVEL) this.data.xp = 0;
    return { levels, coins };
  }

  update(patch: Partial<SaveData>): void {
    Object.assign(this.data, patch);
    this.flush();
  }
}
