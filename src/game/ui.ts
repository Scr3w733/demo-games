import { CAMPAIGN_CLEAR_TIME, campaignLevel } from './campaign';
import {
  BASE_UPGRADES,
  CASE_PRICE,
  CLASS_CASE_PRICE,
  CLASSES,
  DEFAULT_BINDINGS,
  DIAMOND_CASE_PRICE,
  DIAMOND_CLASS_CASE_PRICE,
  DIAMOND_PACKAGES,
  GAME_MODES,
  MAX_MODULES,
  MAX_PROFILE_LEVEL,
  MODULES,
  PREMIUM_CASE_PRICE,
  RARITIES,
  SKINS,
  WEAPONS,
  abilitiesForClass,
  baseUpgradeCost,
  formatTime,
  getClass,
  getModule,
  getSkin,
  getWeapon,
  isWeaponUnlocked,
  keyLabel,
  rarityOfWeapon,
  rollCase,
  rollClassCase,
  rollPremiumCase,
  weaponPrice,
  weaponsForClass,
  xpForLevel,
} from './config';
import type { Game, HudState } from './engine';
import type { Sound } from './audio';
import { keyFromEvent } from './input';
import { MenuBackground } from './menuBackground';
import type { Storage } from './storage';
import { LOCALES, translate } from './i18n';
import { AD, Yandex } from './yandex';
import type { AbilitySlotState, Bindings, CaseReward, ClassId, LocaleId, MusicSettings, RarityId, RunResult, UpgradeDef } from './types';

function must<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Элемент не найден: ${selector}`);
  return element;
}

/** Экранирует строку перед вставкой в HTML-шаблон (в том числе в атрибут). */
function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

type MenuPage = 'home' | 'base' | 'heroes' | 'armory' | 'shop' | 'levels' | 'mail' | 'settings';
type KeyBindField = Exclude<keyof Bindings, 'aimMode' | 'fireMode'>;
type HudStatus = { id: 'poison' | 'burn' | 'infection'; label: string; remaining: number };
// statuses может отсутствовать в старых вызовах HUD — поэтому поле необязательное.
type HudStateWithStatuses = HudState & { statuses?: HudStatus[] };
type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
type GraphicsToggle = 'blood' | 'particles' | 'lighting' | 'vegetation' | 'animals' | 'shake' | 'festive' | 'motionBlur';
type GraphicsSettings = { quality: GraphicsQuality } & Record<GraphicsToggle, boolean>;
type CrosshairStyle = 'cross' | 'dot' | 'ring' | 'rune' | 'off';
type CrosshairSettings = { enabled: boolean; style: CrosshairStyle };
// graphics может отсутствовать в старых сохранениях — используем локальные значения по умолчанию.
type StorageWithGraphics = Storage & { data: Storage['data'] & { graphics?: Partial<GraphicsSettings> } };
const DEFAULT_MUSIC: MusicSettings = { enabled: true, volume: 0.7 };

const MENU_PAGES: MenuPage[] = ['home', 'base', 'heroes', 'armory', 'shop', 'levels', 'mail', 'settings'];
const GRAPHICS_QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];
const GRAPHICS_TOGGLES: GraphicsToggle[] = ['blood', 'particles', 'lighting', 'vegetation', 'animals', 'shake', 'motionBlur', 'festive'];
const DEFAULT_GRAPHICS: GraphicsSettings = {
  quality: 'high',
  blood: true,
  particles: true,
  lighting: true,
  vegetation: true,
  animals: true,
  shake: true,
  motionBlur: true,
  festive: new Date().getMonth() === 11,
};
const DEFAULT_CROSSHAIR: CrosshairSettings = { enabled: true, style: 'cross' };
const CROSSHAIR_STYLES: Array<[CrosshairStyle, string, string]> = [
  ['cross', 'КРЕСТ', 'CROSS'],
  ['dot', 'ТОЧКА', 'DOT'],
  ['ring', 'КОЛЬЦО', 'RING'],
  ['rune', 'РУНА', 'RUNE'],
  ['off', 'ВЫКЛ', 'OFF'],
];
const GRAPHICS_QUALITY_LABELS: Record<GraphicsQuality, [string, string]> = {
  low: ['НИЗКОЕ', 'LOW'],
  medium: ['СРЕДНЕЕ', 'MEDIUM'],
  high: ['ВЫСОКОЕ', 'HIGH'],
  ultra: ['УЛЬТРА', 'ULTRA'],
};
const GRAPHICS_TOGGLE_LABELS: Record<GraphicsToggle, [string, string]> = {
  blood: ['Кровь', 'Blood'],
  particles: ['Частицы', 'Particles'],
  lighting: ['Освещение', 'Lighting'],
  vegetation: ['Растительность', 'Vegetation'],
  animals: ['Животные', 'Animals'],
  shake: ['Тряска экрана', 'Screen shake'],
  motionBlur: ['Размытие движения', 'Motion blur'],
  festive: ['Новогодний декор', 'Holiday decor'],
};

export class UI {
  private readonly stage: HTMLElement;
  private readonly menuBackground: MenuBackground;
  private readonly overlay: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly joystick: HTMLElement;
  private readonly abilities: HTMLElement;
  private game: Game | null = null;
  private enterBase: (() => void) | null = null;
  private toastTimer = 0;
  private selectedClass: ClassId = 'soldier';
  private selectedWeapon = 'soldier_rifle';
  private selectedMode = 'classic';
  private menuPage: MenuPage = 'home';
  private shopTab: 'weapons' | 'cases' | 'diamonds' | 'skins' | 'modules' = 'weapons';
  private shopClass: ClassId | 'all' = 'all';
  private weaponPage = 0;
  private selectWeaponPage = 0;
  private classPage = 0;
  private selectedLevel = 1;
  private levelPage = 0;
  private selectedMail: number | null = null;
  private abilityStates: AbilitySlotState[] = [];
  private cancelBind: (() => void) | null = null;
  private menuDirection: 1 | -1 | null = null;
  private transitionToken = 0;
  private statusSignature = '';

  constructor(
    private readonly storage: Storage,
    private readonly sound: Sound,
    private readonly yandex: Yandex,
  ) {
    this.stage = must<HTMLElement>('#stage');
    this.menuBackground = new MenuBackground(must<HTMLCanvasElement>('#menu-bg'));
    this.overlay = must<HTMLElement>('#overlay');
    this.hud = must<HTMLElement>('#hud');
    this.toastEl = must<HTMLElement>('#toast');
    this.joystick = must<HTMLElement>('#joystick');
    this.abilities = must<HTMLElement>('#abilities');
    this.selectedClass = (CLASSES.find((c) => c.id === storage.data.classId)?.id ?? 'soldier') as ClassId;
    if (!storage.data.unlockedClasses.includes(this.selectedClass)) this.selectedClass = 'soldier';
    this.selectedWeapon = storage.data.weaponId;
    this.selectedMode = storage.data.modeId || 'classic';
    const initialMode = GAME_MODES.find((mode) => mode.id === this.selectedMode);
    if (!initialMode || (initialMode.unlockLevel && storage.data.level < initialMode.unlockLevel)) this.selectedMode = 'classic';
    this.selectedLevel = Math.min(storage.data.campaignUnlocked, Math.max(1, storage.data.selectedLevel || 1));
    if (
      getWeapon(this.selectedWeapon).classId !== this.selectedClass ||
      !isWeaponUnlocked(this.selectedWeapon, storage.data.unlockedWeapons)
    ) {
      this.selectedWeapon = getClass(this.selectedClass).starter;
    }
    must<HTMLButtonElement>('#hud-pause').addEventListener('click', () => this.showPause());
    must<HTMLButtonElement>('#hud-interact').addEventListener('click', () => this.game?.interact());
    this.abilities.addEventListener('click', (event) => this.onAbilityClick(event));
  }

  attachGame(game: Game): void {
    this.game = game;
  }

  attachBase(onEnter: () => void): void {
    this.enterBase = onEnter;
  }

  private onAbilityClick(event: MouseEvent): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-ability-index]');
    if (!button || !this.game || this.game.state !== 'playing') return;
    const state = this.abilityStates[Number(button.dataset.abilityIndex)];
    if (!state) return;
    if (state.id === 'fire') this.game.requestFire();
    else if (state.id === 'dash') this.game.useDash();
    else if (state.id === 'heal') this.game.useHeal();
    else if (state.slot) this.game.useAbility(state.slot);
  }

  private setScreen(html: string, wide = false): void {
    this.cancelBind?.();
    this.cancelBind = null;
    const isMenu = html.includes('data-menu-page');
    this.stage.classList.toggle('menu-bg-active', isMenu);
    this.overlay.classList.toggle('menu-overlay', isMenu);
    this.menuBackground.setActive(isMenu);
    this.overlay.innerHTML = `<div class="screen${wide ? ' screen--wide' : ''}">${html}</div>`;
    this.overlay.classList.add('active');
    this.syncCursor();
    if (isMenu && this.menuDirection) {
      const stage = this.overlay.querySelector<HTMLElement>('.menu-stage');
      stage?.classList.add(this.menuDirection > 0 ? 'screen-in-right' : 'screen-in-left');
      this.menuDirection = null;
    }
  }

  private menuShell(content: string): string {
    return `
      <div class="menu-stage" data-menu-stage>${content}</div>
      <div class="menu-nav">
        <div class="menu-tabs">
          ${MENU_PAGES.map((id) => `
            <button class="btn btn-small ${id === this.menuPage ? 'active' : ''}" data-menu-page="${id}">${this.t(id)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  private switchMenuPage(page: MenuPage, direction?: 1 | -1): void {
    const index = MENU_PAGES.indexOf(this.menuPage);
    const target = MENU_PAGES.indexOf(page);
    const dir: 1 | -1 = direction ?? (target >= index ? 1 : -1);
    const stage = this.overlay.querySelector<HTMLElement>('.menu-stage');
    if (!stage || !this.overlay.classList.contains('menu-overlay')) {
      this.menuDirection = dir;
      this.showMenu(page);
      return;
    }
    const token = ++this.transitionToken;
    let done = false;
    const finish = (): void => {
      if (done || token !== this.transitionToken) return;
      done = true;
      this.menuDirection = dir;
      this.showMenu(page);
    };
    this.sound.click();
    stage.classList.add(dir > 0 ? 'screen-out-right' : 'screen-out-left');
    stage.addEventListener('animationend', finish, { once: true });
    window.setTimeout(finish, 260);
  }

  private bindMenuNav(): void {
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-menu-page]')) {
      button.addEventListener('click', () => this.switchMenuPage(button.dataset.menuPage as MenuPage));
    }
  }

  /** Обычные пронумерованные страницы вместо мобильных стрелочек. */
  private pageNav(attribute: string, current: number, pages: number): string {
    if (pages <= 1) return '';
    const buttons = Array.from({ length: pages }, (_, index) => `
      <button class="btn btn-small ${index === current ? 'active' : ''}" data-${attribute}="${index}">${index + 1}</button>
    `).join('');
    return `<div class="btn-row page-nav">${buttons}</div>`;
  }

  hideOverlay(): void {
    this.transitionToken += 1;
    this.menuDirection = null;
    this.stage.classList.remove('menu-bg-active');
    this.overlay.classList.remove('active', 'menu-overlay');
    this.menuBackground.setActive(false);
    this.overlay.innerHTML = '';
    this.syncCursor();
  }

  setHudVisible(visible: boolean): void {
    this.hud.classList.toggle('hidden', !visible);
    const coarse = window.matchMedia('(pointer: coarse)').matches || this.yandex.isMobile();
    this.joystick.classList.toggle('hidden', !visible || !coarse);
    this.syncCursor();
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }

  updateHud(state: HudState): void {
    const timeEl = must<HTMLElement>('#hud-time');
    timeEl.textContent = state.remaining === null ? state.time : formatTime(Math.ceil(state.remaining));
    timeEl.classList.toggle('urgent', state.remaining !== null && state.remaining < 60);
    const hintEl = must<HTMLElement>('#hud-hint');
    hintEl.textContent = state.hint;
    hintEl.classList.toggle('active', Boolean(state.hint));
    this.renderStatuses(state);
    must<HTMLElement>('#hud-wave').textContent = String(state.wave);
    must<HTMLElement>('#hud-kills').textContent = String(state.kills);
    must<HTMLElement>('#hud-coins').textContent = String(state.coins);
    must<HTMLElement>('#hud-diamonds').textContent = String(state.diamonds);
    must<HTMLElement>('#hp-fill').style.width = `${Math.max(0, (state.hp / state.maxHp) * 100)}%`;
    must<HTMLElement>('#hp-text').textContent = `${state.hp}/${state.maxHp}`;
    must<HTMLElement>('#armor-fill').style.width = `${Math.min(100, (state.armor / 6) * 100)}%`;
    must<HTMLElement>('#hud-armor').textContent = String(state.armor);
    const english = this.storage.data.locale === 'en';
    must<HTMLElement>('#hud-state-label').textContent = english ? 'STATUS' : 'СОСТОЯНИЕ';
    must<HTMLElement>('#hud-hp-label').textContent = english ? 'HP · HEALTH' : 'HP · ЗДОРОВЬЕ';
    must<HTMLElement>('#hud-armor-label').textContent = english ? 'ARMOR' : 'БРОНЯ · ARMOR';
    must<HTMLElement>('#hud-abilities-label').textContent = english ? 'ABILITIES' : 'БЫСТРЫЕ СПОСОБНОСТИ';
    must<HTMLElement>('#hud-fire-mode').textContent = this.storage.data.bindings.fireMode === 'manual'
      ? (english ? 'LMB / CLICK FIRE' : 'ЛКМ / КНОПКА ОГНЯ')
      : (english ? 'AUTO FIRE' : 'АВТООГОНЬ');
    must<HTMLElement>('#hud-crit').textContent = `${Math.round(state.crit * 100)}%`;
    const setChip = must<HTMLElement>('#hud-armor-set');
    setChip.classList.toggle('active', state.armorSet);
    setChip.textContent = state.armorSet ? this.ruEn('КОМПЛЕКТ ✦', 'SET ✦') : this.ruEn('КОМПЛЕКТ', 'SET');
    must<HTMLElement>('#xp-fill').style.width = `${Math.min(100, (state.xp / state.xpNext) * 100)}%`;
    must<HTMLElement>('#xp-text').textContent = `LVL ${state.level}`;
    must<HTMLElement>('#weapon-name').textContent = state.weaponName;
    must<HTMLElement>('#hud-biome').textContent = state.biomeName;
    must<HTMLElement>('#hud-arena').textContent = `L${state.arena}`;
    must<HTMLElement>('#hud-mode').textContent = state.modeName.toUpperCase();
    const lightEl = must<HTMLElement>('#hud-light');
    lightEl.textContent = `${Math.ceil(state.light)}%`;
    lightEl.classList.toggle('off', !state.flashlightOn || state.light <= 0);
    must<HTMLElement>('#hud-light-label').textContent = this.t('light');
    this.updateAbilities(state.abilities);
  }

  private renderStatuses(state: HudState): void {
    const host = this.hud.querySelector<HTMLElement>('#hud-statuses');
    if (!host) return;
    const statuses = (state as HudStateWithStatuses).statuses ?? [];
    const signature = statuses.map((status) => `${status.id}:${status.label}:${Math.ceil(status.remaining)}`).join('|');
    if (signature === this.statusSignature) return;
    this.statusSignature = signature;
    host.textContent = '';
    for (const status of statuses) {
      const chip = document.createElement('span');
      chip.className = `status-chip status-chip--${status.id}`;
      const label = document.createElement('span');
      label.className = 'status-chip__label';
      label.textContent = status.label;
      const time = document.createElement('b');
      time.className = 'status-chip__time';
      time.textContent = `${Math.max(0, Math.ceil(status.remaining))}s`;
      chip.appendChild(label);
      chip.appendChild(time);
      host.appendChild(chip);
    }
  }

  private updateAbilities(states: AbilitySlotState[]): void {
    this.abilityStates = states;
    if (this.abilities.children.length !== states.length) {
      this.abilities.innerHTML = states.map((_, index) => `
        <button class="ability-btn" type="button" data-ability-index="${index}" title="Нажми или используй бинд">
          <span class="ability-icon"></span>
          <span class="ability-key"></span>
          <span class="ability-charges"></span>
          <i class="ability-cd"></i>
        </button>
      `).join('');
    }
    states.forEach((state, index) => {
      const button = this.abilities.children[index] as HTMLElement;
      button.dataset.id = state.id;
      button.classList.toggle('ability-btn--fire', state.id === 'fire');
      button.classList.toggle('ready', state.id === 'fire' && state.cd <= 0);
      must<HTMLElement>('.ability-icon', button).textContent = state.icon;
      must<HTMLElement>('.ability-key', button).textContent = state.key;
      must<HTMLElement>('.ability-charges', button).textContent = state.charges !== undefined ? `x${state.charges}` : '';
      const ratio = Math.max(0, Math.min(1, state.cd / Math.max(0.01, state.max)));
      must<HTMLElement>('.ability-cd', button).style.height = `${ratio * 100}%`;
      button.classList.toggle('cooling', state.cd > 0);
      button.classList.toggle('empty', state.charges === 0);
      button.title = `${state.name} [${state.key}]`;
    });
  }

  private t(key: string, values: Record<string, string | number> = {}): string {
    return translate(this.storage.data.locale, key, values);
  }

  private ruEn(ru: string, en: string): string {
    return this.storage.data.locale === 'en' ? en : ru;
  }

  private graphicsSettings(): GraphicsSettings {
    const saved = (this.storage as StorageWithGraphics).data.graphics;
    return { ...DEFAULT_GRAPHICS, ...(saved ?? {}) };
  }

  private updateGraphics(patch: Partial<GraphicsSettings>): void {
    const graphics = { ...this.graphicsSettings(), ...patch };
    this.storage.update({ graphics } as unknown as Parameters<Storage['update']>[0]);
    this.sound.click();
    this.showSettingsPage();
  }

  private musicSettings(): MusicSettings {
    const saved = (this.storage as Storage & { data: { music?: Partial<MusicSettings> } }).data.music;
    return { ...DEFAULT_MUSIC, ...(saved ?? {}) };
  }

  private updateMusic(patch: Partial<MusicSettings>): void {
    const music = { ...this.musicSettings(), ...patch };
    music.volume = Math.min(1, Math.max(0, music.volume));
    this.storage.update({ music } as unknown as Parameters<Storage['update']>[0]);
    this.sound.setMusicSettings(music.enabled, music.volume);
    this.sound.click();
    this.showSettingsPage();
  }

  private crosshairSettings(): CrosshairSettings {
    const saved = (this.storage as Storage & { data: { crosshair?: Partial<CrosshairSettings> } }).data.crosshair;
    return { ...DEFAULT_CROSSHAIR, ...(saved ?? {}) };
  }

  private updateCrosshair(patch: Partial<CrosshairSettings>): void {
    const crosshair = { ...this.crosshairSettings(), ...patch };
    this.storage.update({ crosshair } as unknown as Parameters<Storage['update']>[0]);
    this.syncCursor();
    this.sound.click();
    this.showSettingsPage();
  }

  private syncCursor(): void {
    const visible = !this.hud.classList.contains('hidden');
    const inGame = visible && !this.overlay.classList.contains('active');
    // В забеге системный курсор заменяется рисуемым прицелом при любом режиме наведения.
    const crosshair = this.crosshairSettings();
    document.body.classList.toggle('game-aiming', inGame && crosshair.enabled && crosshair.style !== 'off');
  }

  private modeUnlocked(mode: { unlockLevel?: number }): boolean {
    return !mode.unlockLevel || this.storage.data.level >= mode.unlockLevel;
  }

  private bind(selector: string, handler: () => void): void {
    const element = this.overlay.querySelector<HTMLElement>(selector);
    if (element) element.addEventListener('click', () => {
      this.sound.click();
      if (selector.includes('data-act="play"') || selector.includes('data-act="start"')) this.sound.confirm();
      handler();
    });
  }

  private bindingsForSlot(slot: 'a1' | 'a2' | 'ultimate'): string {
    const b = this.storage.data.bindings;
    return slot === 'a1' ? b.ability1 : slot === 'a2' ? b.ability2 : b.ultimate;
  }

  // ---------------------------------------------------------------- экраны

  showMenu(page: MenuPage = this.menuPage): void {
    this.menuPage = page;
    this.setHudVisible(false);
    this.sound.setMusic('menu');
    this.yandex.showBanner();
    if (page === 'base') return this.showBasePage();
    if (page === 'heroes') return this.showHeroesPage();
    if (page === 'armory') return this.showArmoryPage();
    if (page === 'shop') return this.showShopPage();
    if (page === 'levels') return this.showLevelsPage();
    if (page === 'mail') return this.showMailPage();
    if (page === 'settings') return this.showSettingsPage();

    const name = this.yandex.playerName ? `, ${escapeHtml(this.yandex.playerName)}` : '';
    const level = this.storage.data.level;
    const need = xpForLevel(level);
    const progress = need > 0 ? Math.min(100, (this.storage.data.xp / need) * 100) : 100;
    this.setScreen(this.menuShell(`
      <p class="subtitle">PIXEL SURVIVAL • DARK FANTASY</p>
      <h1>НЕКРОПОЛЬ</h1>
      <h2>ПОСЛЕДНИЙ СВЕТ</h2>
      <p class="lede">Мёртвые идут. Выбери класс, возьми оружие и продержись как можно дольше${name}.</p>
      <div class="profile-row"><span>${this.t('profileLevel')}</span><b>${escapeHtml(level)} / ${MAX_PROFILE_LEVEL}</b></div>
      <div class="bar bar-xp"><i style="width:${progress}%"></i><span>${escapeHtml(this.storage.data.xp)} / ${need} XP</span></div>
      <div class="profile-row"><span>${this.t('campaign')}</span><b>${this.storage.campaignClearedCount()} / ${MAX_PROFILE_LEVEL}</b></div>
      <div class="stat-list">
        <span>${this.t('bestResult')}</span><span>${escapeHtml(formatTime(this.storage.data.best))}</span>
        <span>${this.t('runs')}</span><span>${escapeHtml(this.storage.data.runs)}</span>
        <span>${this.t('coins')}</span><span>${escapeHtml(this.storage.data.coins)}</span>
        <span>${this.t('diamonds')}</span><span>${escapeHtml(this.storage.data.diamonds)}</span>
        <span>${this.t('classes')}</span><span>${this.storage.data.unlockedClasses.length} / ${CLASSES.length}</span>
        <span>${this.t('weapons')}</span><span>${this.storage.data.unlockedWeapons.length} / ${WEAPONS.length}</span>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="play">${this.t('startGame')}</button>
        <button class="btn btn-accent" data-act="openworld">✦ ОТКРЫТЫЙ МИР · 14400×10200</button>
        <button class="btn" data-act="base">${this.t('base')}</button>
        <button class="btn" data-act="help">${this.t('howToPlay')}</button>
      </div>
    `));
    this.bind('[data-act="play"]', () => this.showClassSelect());
    this.bind('[data-act="openworld"]', () => {
      this.selectedMode = 'openworld';
      this.storage.update({ modeId: 'openworld' });
      this.showClassSelect();
    });
    this.bind('[data-act="base"]', () => this.showMenu('base'));
    this.bind('[data-act="help"]', () => this.showHelp());
    this.bindMenuNav();
  }

  private showBasePage(): void {
    const upgrades = BASE_UPGRADES.map((def) => {
      const level = this.storage.data.baseUpgrades[def.id] ?? 0;
      const cost = baseUpgradeCost(def, level);
      const maxed = level >= def.max;
      return `
        <div class="base-card ${maxed ? 'maxed' : ''}">
          <span class="base-glyph">${def.glyph}</span>
          <b>${def.name}</b>
          <small>${def.description}</small>
          <span class="base-tier">${level} / ${def.max}</span>
          <button class="btn btn-small" data-upgrade-base="${def.id}" ${maxed || this.storage.data.coins < cost ? 'disabled' : ''}>
            ${maxed ? this.t('maxed') : `${cost} ${this.t('coins').toLowerCase()}`}
          </button>
        </div>
      `;
    }).join('');
    const unlocked = this.storage.data.campaignUnlocked;
    const selected = Math.min(unlocked, Math.max(1, this.selectedLevel));
    const unread = this.storage.data.mailbox.filter((message) => !message.read).length;
    this.setScreen(this.menuShell(`
      <h2>${this.t('base')}</h2>
      <p class="lede">${this.t('baseHint')}</p>
      <div class="btn-row"><button class="btn btn-primary" data-act="enterBase">${this.t('baseEnter')}</button></div>
      <div class="base-status">
        <span>${this.t('baseLevel')}: <b>${this.storage.baseLevel()}</b></span>
        <span>${this.t('campaign')}: <b>${this.storage.campaignClearedCount()} / ${MAX_PROFILE_LEVEL}</b></span>
        <span>${this.t('coins')}: <b>${escapeHtml(this.storage.data.coins)}</b></span>
        <span>${this.t('diamonds')}: <b>${escapeHtml(this.storage.data.diamonds)}</b></span>
        <span>${this.t('mail')}: <b>${unread}</b></span>
      </div>
      <p class="subtitle">${this.t('baseUpgrades')}</p>
      <div class="base-grid">${upgrades}</div>
      <p class="subtitle">${this.t('teleport')}</p>
      <div class="teleport-panel">
        <label>
          <span>${this.t('campaignLevelLabel')}</span>
          <input type="number" min="1" max="${unlocked}" value="${selected}" data-teleport-level />
        </label>
        <button class="btn btn-primary" data-act="teleport">${this.t('teleport')} → ${campaignLevel(selected).name}</button>
        <div class="btn-row">
          <button class="btn btn-small" data-teleport-to="${selected}">${this.t('selected')} ${selected}</button>
          <button class="btn btn-small" data-teleport-to="${unlocked}">${this.t('latest')} ${unlocked}</button>
          <button class="btn btn-small" data-act="city">${this.t('cityMode')}</button>
        </div>
      </div>
      <p class="hint">${this.t('baseBonusHint')}</p>
    `), true);
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-upgrade-base]')) {
      button.addEventListener('click', () => {
        if (this.storage.upgradeBase(button.dataset.upgradeBase ?? '')) {
          this.sound.levelUp();
          this.toast(this.t('baseUpgraded'));
        } else this.sound.hurt();
        this.showBasePage();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-teleport-to]')) {
      button.addEventListener('click', () => {
        this.selectedLevel = Math.min(unlocked, Math.max(1, Number(button.dataset.teleportTo) || 1));
        this.storage.update({ selectedLevel: this.selectedLevel });
        this.sound.click();
        this.showClassSelect();
      });
    }
    this.bind('[data-act="teleport"]', () => {
      const input = this.overlay.querySelector<HTMLInputElement>('[data-teleport-level]');
      const level = Math.min(unlocked, Math.max(1, Math.floor(Number(input?.value) || selected)));
      this.selectedLevel = level;
      this.storage.update({ selectedLevel: level });
      this.sound.click();
      this.showClassSelect();
    });
    this.bind('[data-act="city"]', () => {
      if (!this.modeUnlocked({ unlockLevel: 5 })) return;
      this.selectedMode = 'city';
      this.storage.update({ modeId: 'city' });
      this.sound.click();
      this.showClassSelect();
    });
    this.bind('[data-act="enterBase"]', () => {
      this.sound.click();
      this.enterBase?.();
    });
    this.bindMenuNav();
  }

  private showMailPage(): void {
    const messages = [...this.storage.data.mailbox].reverse();
    const selected = messages.find((message) => message.id === this.selectedMail) ?? messages[0] ?? null;
    if (selected && !selected.read) {
      this.storage.readMail(selected.id);
      selected.read = true;
    }
    this.setScreen(this.menuShell(`
      <h2>${this.t('mail')}</h2>
      <p class="lede">${this.t('mailHint')}</p>
      <div class="mail-layout">
        <div class="mail-list">
          ${messages.length ? messages.map((message) => `
            <button class="mail-row ${selected?.id === message.id ? 'selected' : ''} ${message.read ? '' : 'unread'}" data-mail-id="${escapeHtml(message.id)}">
              <b>${escapeHtml(message.title)}</b><small>${new Date(message.at).toLocaleString()}</small>
            </button>
          `).join('') : `<p class="hint">${this.t('mailEmpty')}</p>`}
        </div>
        <div class="mail-body">
          ${selected ? `<h3>${escapeHtml(selected.title)}</h3><p>${escapeHtml(selected.body)}</p><small>${new Date(selected.at).toLocaleString()}</small>` : ''}
        </div>
      </div>
      <div class="btn-row"><button class="btn" data-act="read-all">${this.t('readAll')}</button></div>
    `), true);
    for (const row of this.overlay.querySelectorAll<HTMLElement>('[data-mail-id]')) {
      row.addEventListener('click', () => {
        this.selectedMail = Number(row.dataset.mailId) || null;
        this.sound.click();
        this.showMailPage();
      });
    }
    this.bind('[data-act="read-all"]', () => {
      this.storage.readAllMail();
      this.sound.click();
      this.showMailPage();
    });
    this.bindMenuNav();
  }

  private showHeroesPage(): void {
    const modeCards = GAME_MODES.map((mode) => {
      const unlocked = this.modeUnlocked(mode);
      return `
        <button class="mode-card ${mode.id === this.selectedMode ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-mode="${mode.id}" ${unlocked ? '' : 'disabled'}>
          <span class="mode-icon">${mode.icon}</span><b>${mode.name}</b>
          <small>${unlocked ? mode.description : this.t('modeLocked', { n: mode.unlockLevel ?? 1 })}</small>
        </button>
      `;
    }).join('');
    const available = CLASSES.filter((cls) => this.storage.data.unlockedClasses.includes(cls.id));
    const pages = Math.max(1, Math.ceil(available.length / 6));
    this.classPage = Math.min(this.classPage, pages - 1);
    const page = available.slice(this.classPage * 6, this.classPage * 6 + 6);
    const classCards = page.map((cls) => `
      <button class="class-card ${cls.id === this.selectedClass ? 'selected' : ''} ${cls.unlock === 'case' ? 'rare' : ''}"
        data-class="${cls.id}" style="--card-accent:${cls.accent}">
        <span class="glyph">${cls.glyph}</span>
        <span class="cname">${cls.name}</span>
        <span class="cdesc">${cls.description}</span>
        <span class="cstats">HP ${cls.base.maxHp} • УРОН ${cls.base.damage} • СКОР. ${cls.base.moveSpeed}</span>
      </button>
    `).join('');
    const locked = CLASSES.length - available.length;
    this.setScreen(this.menuShell(`
      <h2>${this.t('heroes')}</h2>
      <p class="subtitle" style="margin-bottom:0.4em">${this.t('modes')}</p>
      <div class="mode-grid">${modeCards}</div>
      <p class="subtitle" style="margin-bottom:0.4em">${this.t('availableClasses')}</p>
      <div class="card-grid">${classCards}</div>
      ${this.pageNav('class-page', this.classPage, pages)}
      <p class="page-note">${locked > 0 ? this.t('rareClassesHint', { n: locked }) : this.t('allClassesOpen')}</p>
      <div class="btn-row"><button class="btn btn-primary" data-act="start">${this.t('configureRun')}</button></div>
    `), true);
    for (const card of this.overlay.querySelectorAll<HTMLElement>('[data-mode]')) {
      card.addEventListener('click', () => {
        this.selectedMode = card.dataset.mode ?? 'classic';
        this.sound.click();
        this.showHeroesPage();
      });
    }
    for (const card of this.overlay.querySelectorAll<HTMLElement>('[data-class]')) {
      card.addEventListener('click', () => {
        this.selectedClass = card.dataset.class as ClassId;
        this.selectedWeapon = getClass(this.selectedClass).starter;
        this.sound.click();
        this.showHeroesPage();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-class-page]')) {
      button.addEventListener('click', () => {
        this.classPage = Math.max(0, Number(button.dataset.classPage) || 0);
        this.sound.click();
        this.showHeroesPage();
      });
    }
    this.bind('[data-act="start"]', () => this.showClassSelect());
    this.bindMenuNav();
  }

  private showLevelsPage(): void {
    const unlocked = this.storage.data.campaignUnlocked;
    const perPage = 24;
    const pages = Math.ceil(MAX_PROFILE_LEVEL / perPage);
    this.levelPage = Math.min(this.levelPage, pages - 1);
    const first = this.levelPage * perPage + 1;
    const cards = [];
    for (let level = first; level < first + perPage && level <= MAX_PROFILE_LEVEL; level += 1) {
      const loc = campaignLevel(level);
      const record = this.storage.data.campaign[String(level)];
      const locked = level > unlocked;
      const cleared = Boolean(record?.completed);
      const stars = cleared ? '★★★' : locked ? '🔒' : '☆☆☆';
      cards.push(`
        <button class="level-card ${level === this.selectedLevel ? 'selected' : ''} ${cleared ? 'cleared' : ''} ${locked ? 'locked' : ''}"
          data-level="${level}" ${locked ? 'disabled' : ''}>
          <b>${level}. ${loc.name}</b>
          <small>${loc.biome.name} · ${this.t('difficulty')} ×${loc.difficulty}</small>
          <small>${record ? `${this.t('bestTime')} ${escapeHtml(formatTime(record.bestTime))} · ${escapeHtml(record.runs)} ${this.t('runsShort')}` : '—'}</small>
          <span class="level-stars">${stars}</span>
        </button>
      `);
    }
    this.setScreen(this.menuShell(`
      <h2>${this.t('levels')}</h2>
      <p class="lede">${this.t('campaignHint', { n: CAMPAIGN_CLEAR_TIME })} ${this.t('campaignProgress', { a: this.storage.campaignClearedCount(), b: MAX_PROFILE_LEVEL, c: unlocked })}</p>
      <p class="subtitle">${this.t('currentLevel')}: ${this.selectedLevel} · ${campaignLevel(this.selectedLevel).name}</p>
      <div class="level-grid">${cards.join('')}</div>
      ${this.pageNav('level-page', this.levelPage, pages)}
      <div class="btn-row"><button class="btn btn-primary" data-act="start">${this.t('configureRun')}</button></div>
    `), true);
    for (const card of this.overlay.querySelectorAll<HTMLElement>('[data-level]')) {
      card.addEventListener('click', () => {
        this.selectedLevel = Number(card.dataset.level) || 1;
        this.storage.update({ selectedLevel: this.selectedLevel });
        this.sound.click();
        this.showLevelsPage();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-level-page]')) {
      button.addEventListener('click', () => {
        this.levelPage = Math.max(0, Number(button.dataset.levelPage) || 0);
        this.sound.click();
        this.showLevelsPage();
      });
    }
    this.bind('[data-act="start"]', () => this.showClassSelect());
    this.bindMenuNav();
  }

  private showArmoryPage(): void {
    this.setScreen(this.menuShell(`
      <h2>${this.t('armory')}</h2>
      <p class="lede">Оружие покупается за монеты или выпадает в кейсах и сундуках подземелий.</p>
      ${this.weaponShopContent()}
    `), true);
    this.bindWeaponShop();
    this.bindMenuNav();
  }

  private showShopPage(): void {
    this.renderShop();
  }

  showHelp(): void {
    this.setScreen(`
      <h2>КАК ИГРАТЬ</h2>
      <p class="lede">Ты автоматически атакуешь ближайшего врага. Твоя задача — двигаться, собирать осколки опыта и не дасть орде сомкнуть круг.</p>
      <div class="stat-list">
        <span>Движение (ПК)</span><span>WASD / стрелки</span>
        <span>Движение (тач)</span><span>виртуальный джойстик</span>
        <span>Пауза</span><span>кнопка II или Esc</span>
        <span>Уровень</span><span>выбор одного из 3 усилителей</span>
        <span>Босс</span><span>каждые 5 волн</span>
        <span>Миникарта</span><span>в правом верхнем углу, клавиша M</span>
        <span>Прицел / атака</span><span>мышь и ЛКМ или бинды в настройках</span>
        <span>Взаимодействие</span><span>клавиша G или кнопка HUD: вход в здание, лестница, сундук</span>
        <span>Фонарик</span><span>клавиша T: свет в темноте, заряд восстанавливается от свеч, фонарей и факелов</span>
        <span>База</span><span>улучшения за монеты и телепорт на уровни</span>
        <span>Алмазы</span><span>пока обмениваются за монеты в магазине; донат появится после публикации</span>
      </div>
      <p>Враги: скелеты, зомби, вампиры, призраки и культисты. На волнах с боссом падает больше опыта и монет.</p>
      <p>Локации сменяются каждые 45 секунд: кладбище, катакомбы, развалины, склеп, болото и трон титана. У каждой свои стены, препятствия и враги.</p>
      <p>Фиолетовые порталы ведут в подземелье. Зачисти его, чтобы получить сундук с новым оружием или монетами.</p>
      <p>«Город: зачистка» открывается с 5 уровня профиля: 30 минут на ограниченный открытый город, 54 здания до 5 этажей, бочки и коробки с опытом, монетами и шансом сундука. У входа видны звёзды здания и сила врагов внутри.</p>
      <h2 style="margin-top:0.9em">СПОСОБНОСТИ — ${getClass(this.selectedClass).name.toUpperCase()}</h2>
      <div class="ability-hint">
        ${abilitiesForClass(this.selectedClass).map((a) => `
          <b>${a.icon} ${a.name} [${escapeHtml(keyLabel(this.bindingsForSlot(a.slot)))}]</b><span>${a.description} · КД ${a.cooldown}с</span>
        `).join('')}
        <b>➤ Рывок [${escapeHtml(keyLabel(this.storage.data.bindings.dash))}]</b><span>Короткий рывок с неуязвимостью</span>
        <b>✚ Аптечка [${escapeHtml(keyLabel(this.storage.data.bindings.heal))}]</b><span>3 заряда, восстанавливают 35% HP</span>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="back">ПОНЯТНО</button>
        <button class="btn" data-act="binds">НАСТРОИТЬ БИНДЫ</button>
      </div>
    `);
    this.bind('[data-act="back"]', () => this.showMenu());
    this.bind('[data-act="binds"]', () => this.showBindings());
  }

  private bindRow(field: KeyBindField, label: string): string {
    const value = this.storage.data.bindings[field];
    return `
      <div class="bind-row">
        <span>${label}</span>
        <button class="bind-key" type="button" data-bind="${field}">${escapeHtml(keyLabel(value))}</button>
      </div>
    `;
  }

  showBindings(): void {
    this.showMenu('settings');
  }

  private showSettingsPage(): void {
    const b = this.storage.data.bindings;
    const keyFields: Array<[KeyBindField, string]> = [
      ['up', this.t('up')], ['down', this.t('down')],
      ['left', this.t('left')], ['right', this.t('right')],
      ['dash', this.t('dash')], ['fire', this.t('fire')],
      ['ability1', this.t('ability1')], ['ability2', this.t('ability2')],
      ['ultimate', this.t('ultimate')], ['heal', this.t('heal')],
      ['pause', this.t('pause')], ['minimap', this.t('minimap')],
      ['interact', this.t('interact')], ['flashlight', this.t('flashlight')],
    ];
    const graphics = this.graphicsSettings();
    const music = this.musicSettings();
    const crosshair = this.crosshairSettings();
    const qualityButtons = GRAPHICS_QUALITIES.map((quality) => {
      const [ru, en] = GRAPHICS_QUALITY_LABELS[quality];
      return `<button class="filter-chip ${quality === graphics.quality ? 'selected' : ''}" type="button"
        data-graphics-quality="${quality}" aria-pressed="${quality === graphics.quality}">${ru} / ${en}</button>`;
    }).join('');
    const toggleRows = GRAPHICS_TOGGLES.map((key) => {
      const [ru, en] = GRAPHICS_TOGGLE_LABELS[key];
      const on = graphics[key];
      const state = this.ruEn(on ? 'ВКЛ' : 'ВЫКЛ', on ? 'ON' : 'OFF');
      return `
        <div class="bind-row">
          <span>${this.ruEn(ru, en)}</span>
          <button class="bind-key ${on ? 'bind-key--on' : 'bind-key--off'}" type="button"
            data-graphics-toggle="${key}" aria-pressed="${on}">${state}</button>
        </div>
      `;
    }).join('');
    const crosshairButtons = CROSSHAIR_STYLES.map(([style, ru, en]) => `
      <button class="filter-chip ${style === crosshair.style ? 'selected' : ''}" type="button"
        data-crosshair-style="${style}" aria-pressed="${style === crosshair.style}">${ru} / ${en}</button>
    `).join('');
    this.setScreen(this.menuShell(`
      <h2>${this.t('controlsTitle')}</h2>
      <p class="lede">Нажми на клавишу, затем нажми новую. Нажатие почти любой клавиши можно переназначить. На тач-экране способности дублируются кнопками HUD.</p>
      <div class="bind-group">
        <p class="subtitle">${this.t('movement')}</p>
        <div class="bind-list">${keyFields.slice(0, 4).map(([f, l]) => this.bindRow(f, l)).join('')}</div>
      </div>
      <div class="bind-group">
        <p class="subtitle">${this.t('combat')}</p>
        <div class="bind-list">${keyFields.slice(4, 10).map(([f, l]) => this.bindRow(f, l)).join('')}</div>
      </div>
      <div class="bind-group">
        <p class="subtitle">${this.t('interface')}</p>
        <div class="bind-list">
          ${keyFields.slice(10).map(([f, l]) => this.bindRow(f, l)).join('')}
          <div class="bind-row">
            <span>${this.t('language')}</span>
            <button class="bind-key" type="button" data-locale-toggle>${LOCALES.find((l) => l.id === this.storage.data.locale)?.name ?? 'РУССКИЙ'}</button>
          </div>
          <div class="bind-row">
            <span>${this.t('aim')}</span>
            <button class="bind-key" type="button" data-toggle="aimMode">${b.aimMode === 'mouse' ? 'МЫШЬ' : 'АВТО'}</button>
          </div>
          <div class="bind-row">
            <span>${this.t('attack')}</span>
            <button class="bind-key" type="button" data-toggle="fireMode">${b.fireMode === 'manual' ? 'ПО КЛИКУ' : 'АВТО'}</button>
          </div>
        </div>
      </div>
      <p class="hint">Прицел мышью: поворот к курсору. Ручная атака: выстрел по ЛКМ или по клавише «Ручной выстрел».</p>
      <div class="bind-group graphics-group">
        <p class="subtitle">ГРАФИКА / GRAPHICS</p>
        <p class="hint">${this.ruEn('Качество и эффекты применяются к следующему забегу.', 'Quality and effects apply to the next run.')}</p>
        <p class="subtitle subtitle--minor">${this.ruEn('КАЧЕСТВО', 'QUALITY')}</p>
        <div class="filter-row graphics-quality">${qualityButtons}</div>
        <div class="bind-list graphics-toggles">${toggleRows}</div>
      </div>
      <div class="bind-group graphics-group">
        <p class="subtitle">ПРИЦЕЛ / CROSSHAIR</p>
        <p class="hint">${this.ruEn(
          'В бою вместо системного курсора рисуется прицел. В меню остаётся наш курсор в стиле Некрополя.',
          'In combat the system cursor is replaced by the reticle. The menu keeps our Necropolis cursor.',
        )}</p>
        <div class="filter-row crosshair-styles">${crosshairButtons}</div>
        <div class="bind-list">
          <div class="bind-row">
            <span>${this.ruEn('Показывать прицел', 'Show reticle')}</span>
            <button class="bind-key ${crosshair.enabled ? 'bind-key--on' : 'bind-key--off'}" type="button"
              data-crosshair-toggle aria-pressed="${crosshair.enabled}">${this.ruEn(crosshair.enabled ? 'ВКЛ' : 'ВЫКЛ', crosshair.enabled ? 'ON' : 'OFF')}</button>
          </div>
        </div>
      </div>
      <div class="bind-group graphics-group">
        <p class="subtitle">МУЗЫКА / MUSIC</p>
        <p class="hint">${this.ruEn(
          'Темы генерируются игрой: меню, город и босс звучат по-разному. Без внешних файлов и авторских прав.',
          'Themes are generated in-game: menu, city and boss each have their own score. No external files or royalties.',
        )}</p>
        <div class="bind-list">
          <div class="bind-row">
            <span>${this.ruEn('Фоновая музыка', 'Background music')}</span>
            <button class="bind-key ${music.enabled ? 'bind-key--on' : 'bind-key--off'}" type="button"
              data-music-toggle aria-pressed="${music.enabled}">${this.ruEn(music.enabled ? 'ВКЛ' : 'ВЫКЛ', music.enabled ? 'ON' : 'OFF')}</button>
          </div>
          <div class="bind-row">
            <span>${this.ruEn('Громкость музыки', 'Music volume')}</span>
            <input class="volume-slider" type="range" min="0" max="100" step="1"
              value="${Math.round(music.volume * 100)}" data-music-volume
              aria-label="${this.ruEn('Громкость музыки', 'Music volume')}" />
          </div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="back">${this.t('done')}</button>
        <button class="btn" data-act="reset">${this.t('resetAll')}</button>
      </div>
    `), true);

    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-bind]')) {
      button.addEventListener('click', () => {
        const field = button.dataset.bind as KeyBindField;
        button.classList.add('listening');
        button.textContent = 'НАЖМИ...';
        this.sound.click();

        const onKey = (event: KeyboardEvent): void => {
          if (keyFromEvent(event) === 'tab') return;
          event.preventDefault();
          event.stopPropagation();
          window.removeEventListener('keydown', onKey, true);
          this.cancelBind = null;
          const key = keyFromEvent(event);
          const next: Bindings = { ...this.storage.data.bindings, [field]: key };
          for (const [other] of keyFields) {
            if (other !== field && next[other] === key) next[other] = DEFAULT_BINDINGS[other];
          }
          this.storage.update({ bindings: next });
          this.sound.click();
          this.showBindings();
        };
        this.cancelBind = () => window.removeEventListener('keydown', onKey, true);
        window.addEventListener('keydown', onKey, true);
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-toggle]')) {
      button.addEventListener('click', () => {
        const field = button.dataset.toggle as 'aimMode' | 'fireMode';
        const next = { ...this.storage.data.bindings };
        if (field === 'aimMode') next.aimMode = next.aimMode === 'auto' ? 'mouse' : 'auto';
        else next.fireMode = next.fireMode === 'auto' ? 'manual' : 'auto';
        this.storage.update({ bindings: next });
        this.syncCursor();
        this.sound.click();
        this.showBindings();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-graphics-quality]')) {
      button.addEventListener('click', () => {
        const quality = button.dataset.graphicsQuality as GraphicsQuality;
        if (!GRAPHICS_QUALITIES.includes(quality)) return;
        this.updateGraphics({ quality });
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-graphics-toggle]')) {
      button.addEventListener('click', () => {
        const key = button.dataset.graphicsToggle as GraphicsToggle;
        if (!GRAPHICS_TOGGLES.includes(key)) return;
        const current = this.graphicsSettings();
        const patch: Partial<GraphicsSettings> = {};
        patch[key] = !current[key];
        this.updateGraphics(patch);
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-crosshair-style]')) {
      button.addEventListener('click', () => {
        const style = button.dataset.crosshairStyle as CrosshairStyle;
        if (!CROSSHAIR_STYLES.some(([id]) => id === style)) return;
        this.updateCrosshair({ style, enabled: style !== 'off' });
      });
    }
    const crosshairToggle = this.overlay.querySelector<HTMLElement>('[data-crosshair-toggle]');
    crosshairToggle?.addEventListener('click', () => {
      this.updateCrosshair({ enabled: !this.crosshairSettings().enabled });
    });
    const musicToggle = this.overlay.querySelector<HTMLElement>('[data-music-toggle]');
    musicToggle?.addEventListener('click', () => {
      this.updateMusic({ enabled: !this.musicSettings().enabled });
    });
    const musicVolume = this.overlay.querySelector<HTMLInputElement>('[data-music-volume]');
    musicVolume?.addEventListener('input', () => {
      const music = { ...this.musicSettings(), volume: Number(musicVolume.value) / 100 };
      this.storage.update({ music } as unknown as Parameters<Storage['update']>[0]);
      this.sound.setMusicSettings(music.enabled, music.volume);
    });
    musicVolume?.addEventListener('change', () => this.showSettingsPage());
    const localeButton = this.overlay.querySelector<HTMLElement>('[data-locale-toggle]');
    localeButton?.addEventListener('click', () => {
      const next: LocaleId = this.storage.data.locale === 'ru' ? 'en' : 'ru';
      this.storage.update({ locale: next });
      this.sound.click();
      this.showMenu('settings');
    });
    this.bind('[data-act="back"]', () => this.showMenu('home'));
    this.bind('[data-act="reset"]', () => {
      this.storage.update({ bindings: { ...DEFAULT_BINDINGS } });
      this.showMenu('settings');
    });
    this.bindMenuNav();
  }

  showClassSelect(): void {
    this.menuPage = 'heroes';
    const available = CLASSES.filter((cls) => this.storage.data.unlockedClasses.includes(cls.id));
    const classPages = Math.max(1, Math.ceil(available.length / 6));
    this.classPage = Math.min(this.classPage, classPages - 1);
    const classCards = available.slice(this.classPage * 6, this.classPage * 6 + 6).map((cls) => `
      <button class="class-card ${cls.id === this.selectedClass ? 'selected' : ''} ${cls.unlock === 'case' ? 'rare' : ''}"
        data-class="${cls.id}" style="--card-accent:${cls.accent}">
        <span class="glyph">${cls.glyph}</span>
        <span class="cname">${cls.name}</span>
        <span class="cdesc">${cls.description}</span>
        <span class="cstats">HP ${cls.base.maxHp} • УРОН ${cls.base.damage} • СКОР. ${cls.base.moveSpeed}</span>
      </button>
    `).join('');

    const classWeapons = weaponsForClass(this.selectedClass);
    const weaponPages = Math.max(1, Math.ceil(classWeapons.length / 12));
    this.selectWeaponPage = Math.min(this.selectWeaponPage, weaponPages - 1);
    const weaponCards = classWeapons.slice(this.selectWeaponPage * 12, this.selectWeaponPage * 12 + 12).map((weapon) => {
      const unlocked = isWeaponUnlocked(weapon.id, this.storage.data.unlockedWeapons);
      const rarity = rarityOfWeapon(weapon.id);
      return `
        <button class="weapon-card rarity-${rarity} ${weapon.id === this.selectedWeapon ? 'selected' : ''} ${unlocked ? '' : 'disabled'}"
          data-weapon="${weapon.id}" ${unlocked ? '' : 'disabled'}>
          <b>${unlocked ? weapon.name : '🔒 ' + weapon.name}</b>
          <small>${unlocked ? weapon.description : 'Купи в магазине или найди в кейсе'}</small>
        </button>
      `;
    }).join('');

    const modeCards = GAME_MODES.map((mode) => {
      const unlocked = this.modeUnlocked(mode);
      return `
        <button class="mode-card ${mode.id === this.selectedMode ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-mode="${mode.id}" ${unlocked ? '' : 'disabled'}>
          <span class="mode-icon">${mode.icon}</span>
          <b>${mode.name}</b>
          <small>${unlocked ? mode.description : this.t('modeLocked', { n: mode.unlockLevel ?? 1 })}</small>
        </button>
      `;
    }).join('');

    this.setScreen(this.menuShell(`
      <h2>${this.t('chooseClass')}</h2>
      <p class="subtitle" style="margin-bottom:0.4em">${this.t('mode')}</p>
      <div class="mode-grid">${modeCards}</div>
      <p class="subtitle" style="margin-bottom:0.4em">${this.t('className')}</p>
      <div class="card-grid">${classCards}</div>
      ${this.pageNav('class-page', this.classPage, classPages)}
      <p class="subtitle" style="margin-bottom:0.4em">${this.t('weapon')} — ${getClass(this.selectedClass).name.toUpperCase()}</p>
      <div class="weapon-grid">${weaponCards}</div>
      ${this.pageNav('select-weapon-page', this.selectWeaponPage, weaponPages)}
      <p class="hint">${this.t('open', { a: this.storage.data.unlockedWeapons.length, b: WEAPONS.length })}</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="start">${this.t('toBattle')}</button>
        <button class="btn" data-act="binds">${this.t('binds')}</button>
        <button class="btn" data-act="back">${this.t('back')}</button>
      </div>
    `), true);

    for (const card of this.overlay.querySelectorAll<HTMLElement>('[data-mode]')) {
      card.addEventListener('click', () => {
        this.sound.click();
        this.selectedMode = card.dataset.mode ?? 'classic';
        this.showClassSelect();
      });
    }
    for (const card of this.overlay.querySelectorAll<HTMLElement>('[data-class]')) {
      card.addEventListener('click', () => {
        this.sound.click();
        this.selectedClass = card.dataset.class as ClassId;
        this.selectedWeapon = getClass(this.selectedClass).starter;
        this.selectWeaponPage = 0;
        this.showClassSelect();
      });
    }
    for (const card of this.overlay.querySelectorAll<HTMLElement>('[data-weapon]')) {
      card.addEventListener('click', () => {
        this.sound.click();
        this.selectedWeapon = card.dataset.weapon ?? '';
        this.showClassSelect();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-class-page]')) {
      button.addEventListener('click', () => {
        this.classPage = Math.max(0, Number(button.dataset.classPage) || 0);
        this.sound.click();
        this.showClassSelect();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-select-weapon-page]')) {
      button.addEventListener('click', () => {
        this.selectWeaponPage = Math.max(0, Number(button.dataset.selectWeaponPage) || 0);
        this.sound.click();
        this.showClassSelect();
      });
    }
    this.bind('[data-act="start"]', () => {
      if (!this.game) return;
      const mode = GAME_MODES.find((m) => m.id === this.selectedMode);
      if (mode?.unlockLevel && this.storage.data.level < mode.unlockLevel) return;
      this.storage.update({ classId: this.selectedClass, weaponId: this.selectedWeapon, modeId: this.selectedMode });
      this.yandex.hideBanner();
      this.hideOverlay();
      this.setHudVisible(true);
      this.game.start(this.selectedClass, this.selectedWeapon, this.selectedMode, this.selectedLevel);
    });
    this.bind('[data-act="binds"]', () => this.showBindings());
    this.bind('[data-act="back"]', () => this.showMenu('heroes'));
    this.bindMenuNav();
  }

  // ---------------------------------------------------------------- магазин

  private rarityBadge(rarity: RarityId): string {
    const def = RARITIES[rarity];
    return `<span class="rarity" style="--rarity:${def.color}">${def.name}</span>`;
  }

  showShop(): void {
    this.renderShop();
  }

  private renderShop(): void {
    const coins = this.storage.data.coins;
    const tabs: Array<[typeof this.shopTab, string]> = [
      ['weapons', this.t('weapon')], ['cases', this.t('cases')], ['diamonds', this.t('diamonds')],
      ['skins', this.t('skins')], ['modules', this.t('modules')],
    ];
    let content = '';

    if (this.shopTab === 'weapons') {
      content = this.weaponShopContent();
    } else if (this.shopTab === 'diamonds') {
      content = this.diamondShopContent();
    } else if (this.shopTab === 'cases') {
      content = `
        <div class="shop-grid shop-grid--cases">
          <div class="shop-card">
            <b>Кейс снаряжения</b>
            <small>Оружие, скин или модуль. Шанс ультрамифического — 0,01%.</small>
            ${this.rarityBadge('rare')}
            <p class="hint">В инвентаре: ${escapeHtml(this.storage.data.cases)} шт.</p>
            <button class="btn btn-small" data-buy-case ${coins < CASE_PRICE ? 'disabled' : ''}>КУПИТЬ · ${CASE_PRICE}</button>
            <button class="btn btn-small" data-buy-diamond-case ${this.storage.data.diamonds < DIAMOND_CASE_PRICE ? 'disabled' : ''}>ЗА ${DIAMOND_CASE_PRICE} ◆</button>
            <button class="btn btn-small btn-primary" data-open-case ${this.storage.data.cases < 1 ? 'disabled' : ''}>ОТКРЫТЬ</button>
          </div>
          <div class="shop-card">
            <b>Кейс классов</b>
            <small>Шанс выбить редкого персонажа: вампира, палача, некроманта или другого.</small>
            ${this.rarityBadge('mythic')}
            <button class="btn btn-small btn-primary" data-open-class-case ${coins < CLASS_CASE_PRICE ? 'disabled' : ''}>ОТКРЫТЬ · ${CLASS_CASE_PRICE}</button>
            <button class="btn btn-small" data-buy-diamond-class-case ${this.storage.data.diamonds < DIAMOND_CLASS_CASE_PRICE ? 'disabled' : ''}>ЗА ${DIAMOND_CLASS_CASE_PRICE} ◆</button>
          </div>
          <div class="shop-card" style="--rarity:#7ce0d0">
            <b>Премиальный кейс</b>
            <small>Гарантированно эпический предмет или лучше. Шанс ультрамифического остаётся 0,01%.</small>
            ${this.rarityBadge('epic')}
            <button class="btn btn-small btn-primary" data-buy-premium-case ${this.storage.data.diamonds < PREMIUM_CASE_PRICE ? 'disabled' : ''}>ОТКРЫТЬ · ${PREMIUM_CASE_PRICE} ◆</button>
          </div>
        </div>
      `;
    } else if (this.shopTab === 'skins') {
      const owned = new Set(this.storage.data.skins);
      content = `
        <div class="shop-grid">
          ${SKINS.map((skin) => {
            const have = owned.has(skin.id);
            const equipped = this.storage.data.equippedSkin === skin.id;
            return `
              <div class="shop-card" style="--rarity:${RARITIES[skin.rarity].color}">
                <b>${skin.name}</b>
                <small>Цвет снарядов и прицела${skin.wear ? ` · ${skin.wear}` : ''}</small>
                ${this.rarityBadge(skin.rarity)}
                ${equipped
                  ? '<button class="btn btn-small" disabled>НАДЕТ</button>'
                  : have
                    ? `<button class="btn btn-small" data-equip-skin="${skin.id}">НАДЕТЬ</button>`
                    : `<button class="btn btn-small" data-buy-skin="${skin.id}" ${coins < skin.price ? 'disabled' : ''}>${skin.price} МОНЕТ</button>`}
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      const owned = new Set(this.storage.data.modules);
      const equipped = this.storage.data.equippedModules;
      content = `
        <p class="hint">Экипировано модулей: ${equipped.length} / ${MAX_MODULES}. Бонусы применяются в начале забега.</p>
        <div class="shop-grid">
          ${MODULES.map((module) => {
            const have = owned.has(module.id);
            const isOn = equipped.includes(module.id);
            return `
              <div class="shop-card" style="--rarity:${RARITIES[module.rarity].color}">
                <b>${module.name}</b>
                <small>${module.description}</small>
                ${this.rarityBadge(module.rarity)}
                ${isOn
                  ? `<button class="btn btn-small" data-unequip-module="${module.id}">СНЯТЬ</button>`
                  : have
                    ? `<button class="btn btn-small" data-equip-module="${module.id}" ${equipped.length >= MAX_MODULES ? 'disabled' : ''}>ЭКИПИРОВАТЬ</button>`
                    : `<button class="btn btn-small" data-buy-module="${module.id}" ${coins < module.price ? 'disabled' : ''}>${module.price} МОНЕТ</button>`}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    this.setScreen(this.menuShell(`
      <h2>МАГАЗИН</h2>
      <p class="lede">Монеты: <b>${escapeHtml(coins)}</b> · Алмазы: <b style="color:#7ce0d0">${escapeHtml(this.storage.data.diamonds)} ◆</b>. Алмазы пока получаются обменом монет; реальные платежи появятся после публикации в Яндекс Играх.</p>
      <div class="shop-tabs">
        ${tabs.map(([id, label]) => `<button class="btn btn-small ${id === this.shopTab ? 'btn-primary' : ''}" data-shop-tab="${id}">${label}</button>`).join('')}
      </div>
      ${content}
    `), true);
    this.bindMenuNav();

    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-shop-tab]')) {
      button.addEventListener('click', () => {
        this.shopTab = button.dataset.shopTab as typeof this.shopTab;
        this.sound.click();
        this.renderShop();
      });
    }
    this.bindWeaponShop();
    this.bind('[data-buy-case]', () => {
      if (this.storage.data.coins < CASE_PRICE) return;
      this.storage.update({ coins: this.storage.data.coins - CASE_PRICE, cases: this.storage.data.cases + 1 });
      this.sound.click();
      this.renderShop();
    });
    this.bind('[data-open-case]', () => {
      if (this.storage.data.cases < 1) return;
      this.storage.update({ cases: this.storage.data.cases - 1 });
      this.showCaseReward(rollCase(
        this.storage.data.unlockedWeapons,
        this.storage.data.skins,
        this.storage.data.modules,
      ));
    });
    this.bind('[data-open-class-case]', () => this.openClassCase());
    this.bind('[data-buy-diamond-case]', () => {
      if (!this.storage.spendDiamonds(DIAMOND_CASE_PRICE)) return;
      this.storage.update({ cases: this.storage.data.cases + 1 });
      this.sound.click();
      this.toast('КЕЙС КУПЛЕН ЗА 1 ◆');
      this.renderShop();
    });
    this.bind('[data-buy-diamond-class-case]', () => {
      if (!this.storage.spendDiamonds(DIAMOND_CLASS_CASE_PRICE)) return;
      this.showCaseReward(rollClassCase(this.storage.data.unlockedClasses));
    });
    this.bind('[data-buy-premium-case]', () => {
      if (!this.storage.spendDiamonds(PREMIUM_CASE_PRICE)) return;
      this.showCaseReward(rollPremiumCase(
        this.storage.data.unlockedWeapons,
        this.storage.data.skins,
        this.storage.data.modules,
      ));
    });
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-exchange]')) {
      button.addEventListener('click', () => {
        if (!this.storage.exchangeCoinsForDiamonds(button.dataset.exchange ?? '')) return;
        this.sound.levelUp();
        this.toast('АЛМАЗЫ ПОЛУЧЕНЫ');
        this.renderShop();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-buy-skin]')) {
      button.addEventListener('click', () => {
        const id = button.dataset.buySkin ?? '';
        const skin = getSkin(id);
        if (!skin || this.storage.data.coins < skin.price) return;
        this.storage.update({ coins: this.storage.data.coins - skin.price, skins: [...this.storage.data.skins, id] });
        this.sound.levelUp();
        this.renderShop();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-equip-skin]')) {
      button.addEventListener('click', () => {
        this.storage.update({ equippedSkin: button.dataset.equipSkin ?? null });
        this.sound.click();
        this.renderShop();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-buy-module]')) {
      button.addEventListener('click', () => {
        const id = button.dataset.buyModule ?? '';
        const module = getModule(id);
        if (!module || this.storage.data.coins < module.price) return;
        this.storage.update({ coins: this.storage.data.coins - module.price, modules: [...this.storage.data.modules, id] });
        this.sound.levelUp();
        this.renderShop();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-equip-module]')) {
      button.addEventListener('click', () => {
        const id = button.dataset.equipModule ?? '';
        if (this.storage.data.equippedModules.length >= MAX_MODULES) return;
        this.storage.update({ equippedModules: [...this.storage.data.equippedModules, id] });
        this.sound.click();
        this.renderShop();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-unequip-module]')) {
      button.addEventListener('click', () => {
        const id = button.dataset.unequipModule ?? '';
        this.storage.update({ equippedModules: this.storage.data.equippedModules.filter((m) => m !== id) });
        this.sound.click();
        this.renderShop();
      });
    }
  }

  private diamondShopContent(): string {
    const packages = DIAMOND_PACKAGES.map((pack) => {
      const rate = Math.round(pack.coins / pack.diamonds);
      return `
        <div class="shop-card" style="--rarity:#7ce0d0">
          <b class="shop-icon">◆ ${pack.diamonds}</b>
          <small>Обмен за ${pack.coins} монет · ${rate} монет за алмаз</small>
          <span class="price">${pack.coins} МОНЕТ → ${pack.diamonds} ◆</span>
          <button class="btn btn-small btn-primary" data-exchange="${pack.id}" ${this.storage.data.coins < pack.coins ? 'disabled' : ''}>ОБМЕНЯТЬ</button>
        </div>
      `;
    }).join('');
    return `
      <p class="hint">Алмазы — премиальная валюта. Пока единственный источник — обмен монет; обратный обмен недоступен. После публикации в Яндекс Играх добавим донат, а этот обмен можно будет оставить как стартовый.</p>
      <div class="shop-grid shop-grid--cases">${packages}</div>
      <p class="subtitle">ПОКУПКИ ЗА АЛМАЗЫ</p>
      <div class="shop-grid shop-grid--cases">
        <div class="shop-card" style="--rarity:#7ce0d0">
          <b>Кейс снаряжения · ${DIAMOND_CASE_PRICE} ◆</b>
          <small>Оружие, скин или модуль с обычными шансами редкости.</small>
          <button class="btn btn-small" data-buy-diamond-case ${this.storage.data.diamonds < DIAMOND_CASE_PRICE ? 'disabled' : ''}>КУПИТЬ КЕЙС</button>
        </div>
        <div class="shop-card" style="--rarity:#7ce0d0">
          <b>Кейс классов · ${DIAMOND_CLASS_CASE_PRICE} ◆</b>
          <small>Шанс открыть редкого персонажа, включая вампира.</small>
          <button class="btn btn-small" data-buy-diamond-class-case ${this.storage.data.diamonds < DIAMOND_CLASS_CASE_PRICE ? 'disabled' : ''}>ОТКРЫТЬ</button>
        </div>
        <div class="shop-card" style="--rarity:#7ce0d0">
          <b>Премиальный кейс · ${PREMIUM_CASE_PRICE} ◆</b>
          <small>Гарантированно эпический предмет или лучше. Ультрамифический — 0,01%.</small>
          <button class="btn btn-small btn-primary" data-buy-premium-case ${this.storage.data.diamonds < PREMIUM_CASE_PRICE ? 'disabled' : ''}>ОТКРЫТЬ</button>
        </div>
      </div>
    `;
  }

  private weaponShopContent(): string {
    const coins = this.storage.data.coins;
    const classChips = `
      <button class="filter-chip ${this.shopClass === 'all' ? 'selected' : ''}" data-shop-class="all">ВСЕ</button>
      ${CLASSES.map((cls) => `
        <button class="filter-chip ${this.shopClass === cls.id ? 'selected' : ''}" data-shop-class="${cls.id}">${cls.glyph} ${cls.name}</button>
      `).join('')}
    `;
    const filtered = WEAPONS.filter((w) => this.shopClass === 'all' || w.classId === this.shopClass);
    const perPage = 12;
    const pages = Math.max(1, Math.ceil(filtered.length / perPage));
    this.weaponPage = Math.min(this.weaponPage, pages - 1);
    const page = filtered.slice(this.weaponPage * perPage, (this.weaponPage + 1) * perPage);
    const owned = new Set(this.storage.data.unlockedWeapons);
    return `
      <p class="page-note">Предметов в игре: ${WEAPONS.length}. В фильтре: ${filtered.length}. Открыто: ${owned.size}.</p>
      <div class="filter-row">${classChips}</div>
      <div class="shop-grid">
        ${page.map((weapon) => {
          const rarity = rarityOfWeapon(weapon.id);
          const price = weaponPrice(weapon.id);
          const have = owned.has(weapon.id);
          return `
            <div class="shop-card" style="--rarity:${RARITIES[rarity].color}">
              <b>${weapon.name}</b>
              <small>${getClass(weapon.classId).name} · ${weapon.description}</small>
              <div class="btn-row">${this.rarityBadge(rarity)}</div>
              <button class="btn btn-small" data-buy-weapon="${weapon.id}" ${have || coins < price ? 'disabled' : ''}>
                ${have ? 'ЕСТЬ' : `${price} МОНЕТ`}
              </button>
            </div>
          `;
        }).join('')}
      </div>
      ${this.pageNav('page', this.weaponPage, pages)}
    `;
  }

  private bindWeaponShop(): void {
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-shop-class]')) {
      button.addEventListener('click', () => {
        this.shopClass = button.dataset.shopClass as ClassId | 'all';
        this.weaponPage = 0;
        this.sound.click();
        if (this.menuPage === 'armory') this.showArmoryPage();
        else this.renderShop();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-page]')) {
      button.addEventListener('click', () => {
        this.weaponPage = Math.max(0, Number(button.dataset.page) || 0);
        this.sound.click();
        if (this.menuPage === 'armory') this.showArmoryPage();
        else this.renderShop();
      });
    }
    for (const button of this.overlay.querySelectorAll<HTMLElement>('[data-buy-weapon]')) {
      button.addEventListener('click', () => {
        const id = button.dataset.buyWeapon ?? '';
        const price = weaponPrice(id);
        if (this.storage.data.coins < price || isWeaponUnlocked(id, this.storage.data.unlockedWeapons)) return;
        this.storage.update({
          coins: this.storage.data.coins - price,
          unlockedWeapons: [...this.storage.data.unlockedWeapons, id],
        });
        this.sound.levelUp();
        if (this.menuPage === 'armory') this.showArmoryPage();
        else this.renderShop();
      });
    }
  }

  private showCaseReward(reward: CaseReward): void {
    if (reward.kind === 'weapon') {
      this.storage.update({ unlockedWeapons: [...this.storage.data.unlockedWeapons, reward.id] });
    } else if (reward.kind === 'skin') {
      this.storage.update({ skins: [...this.storage.data.skins, reward.id] });
    } else if (reward.kind === 'module') {
      this.storage.update({ modules: [...this.storage.data.modules, reward.id] });
    } else if (reward.kind === 'class') {
      this.storage.update({ unlockedClasses: [...this.storage.data.unlockedClasses, reward.id as ClassId] });
    } else {
      const amount = reward.amount ?? 0;
      this.storage.update({ coins: this.storage.data.coins + amount });
    }
    this.sound.levelUp();
    this.setScreen(this.menuShell(`
      <p class="subtitle">${this.t('caseReward')}</p>
      <div class="case-reward" style="--rarity:${RARITIES[reward.rarity].color}">
        <h2>${reward.name.toUpperCase()}</h2>
        ${this.rarityBadge(reward.rarity)}
        <p class="lede">${reward.kind === 'class' ? 'Класс открыт и доступен в меню героев.' : 'Предмет добавлен в инвентарь.'}</p>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="shop">${this.t('moreCases')}</button>
        <button class="btn" data-act="heroes">${this.t('toHeroes')}</button>
      </div>
    `), true);
    this.bind('[data-act="shop"]', () => this.showMenu('shop'));
    this.bind('[data-act="heroes"]', () => this.showMenu('heroes'));
    this.bindMenuNav();
  }

  private openClassCase(): void {
    if (this.storage.data.coins < CLASS_CASE_PRICE) return;
    this.storage.update({ coins: this.storage.data.coins - CLASS_CASE_PRICE });
    this.showCaseReward(rollClassCase(this.storage.data.unlockedClasses));
  }

  showPause(): void {
    if (!this.game || (this.game.state !== 'playing' && this.game.state !== 'paused')) return;
    if (this.game.state === 'playing') this.game.togglePause();
    this.setScreen(`
      <h2>ПАУЗА</h2>
      <p class="lede">Передышка. Мёртвые подождут.</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="resume">${this.t('resume')}</button>
        <button class="btn" data-act="menu">${this.t('toMenu')}</button>
      </div>
    `);
    this.bind('[data-act="resume"]', () => {
      this.game?.resume();
      this.hideOverlay();
    });
    this.bind('[data-act="menu"]', () => {
      this.game?.toMenu();
      this.showMenu();
    });
  }

  showLevelUp(choices: UpgradeDef[]): void {
    const cards = choices.map((upgrade) => `
      <button class="upgrade-card" data-upgrade="${upgrade.id}">
        <span class="uicon">${upgrade.icon}</span>
        <span class="uname">${upgrade.name}</span>
        <span class="udesc">${upgrade.description}</span>
      </button>
    `).join('');
    this.setScreen(`
      <p class="subtitle">НОВЫЙ УРОВЕНЬ</p>
      <h2>ВЫБЕРИ УСИЛЕНИЕ</h2>
      <div class="upgrade-grid">${cards}</div>
    `);
    for (const card of this.overlay.querySelectorAll<HTMLElement>('[data-upgrade]')) {
      card.addEventListener('click', () => {
        this.game?.chooseUpgrade(card.dataset.upgrade ?? '');
        this.hideOverlay();
      });
    }
  }

  showGameOver(result: RunResult): void {
    this.setHudVisible(false);
    if (this.storage.data.runs % 2 === 0) void this.yandex.interstitial(AD.interstitial);
    const cls = getClass(result.classId);
    const weapon = getWeapon(result.weaponId);
    const reviveLabel = !result.victory && this.game?.canRevive()
      ? (this.yandex.ready ? 'ВОСКРЕСНУТЬ ЗА РЕКЛАМУ' : 'ВОСКРЕСНУТЬ (ДЕМО)')
      : '';
    this.setScreen(`
      <p class="subtitle">${result.victory ? this.t('levelCleared') : this.t('youFell')}</p>
      <h1>${formatTime(result.time)}</h1>
      <div class="stat-list">
        <span>${this.t('wave')}</span><span>${result.wave}</span>
        <span>${this.t('kills')}</span><span>${result.kills}</span>
        <span>${this.t('level')}</span><span>${result.level}</span>
        <span>${this.t('coins')}</span><span>+${result.coins}</span>
        <span>${this.t('className')}</span><span>${cls.name}</span>
        <span>${this.t('weapon')}</span><span>${weapon.name}</span>
        <span>${this.t('record')}</span><span>${escapeHtml(formatTime(this.storage.data.best))}</span>
        <span>${this.t('campaignLevelLabel')}</span><span>${escapeHtml(result.campaignLevel)} · ${escapeHtml(result.campaignName)}</span>
      </div>
      <div class="btn-row">
        ${reviveLabel ? `<button class="btn btn-primary" data-act="revive">${reviveLabel}</button>` : ''}
        <button class="btn" data-act="retry">ЕЩЁ РАЗ</button>
        <button class="btn" data-act="menu">В МЕНЮ</button>
      </div>
    `);
    this.bind('[data-act="revive"]', () => void this.tryRevive());
    this.bind('[data-act="retry"]', () => {
      if (!this.game) return;
      this.hideOverlay();
      this.setHudVisible(true);
      this.game.start(result.classId, result.weaponId, result.modeId, result.campaignLevel);
    });
    this.bind('[data-act="menu"]', () => this.showMenu());
  }

  private async tryRevive(): Promise<void> {
    if (!this.game?.canRevive()) return;
    if (this.yandex.ready) {
      const watched = await this.yandex.rewarded(AD.revive);
      if (!watched) {
        this.toast('Реклама не была просмотрена');
        return;
      }
    }
    this.game.revive();
    this.hideOverlay();
    this.setHudVisible(true);
  }
}
