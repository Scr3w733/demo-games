export type ClassId =
  | 'mage' | 'ninja' | 'soldier' | 'boxer' | 'bandit' | 'demolisher'
  | 'vampire' | 'vampire_prime' | 'executioner' | 'necromancer';

export type ClassUnlock = 'starter' | 'case';

export type WeaponKind =
  | 'bolt'
  | 'spread'
  | 'burst'
  | 'orb'
  | 'melee'
  | 'nova'
  | 'explosive'
  | 'flame'
  | 'mine';

/** Негативные состояния, которые накладывают враги и снимают противоядия. */
export type StatusId = 'poison' | 'burn' | 'infection';

export interface Stats {
  maxHp: number;
  damage: number;
  fireRate: number;
  moveSpeed: number;
  projectileSpeed: number;
  projectileCount: number;
  range: number;
  area: number;
  crit: number;
  armor: number;
  pickup: number;
  regen: number;
  lifesteal: number;
  burn: number;
  slow: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  glyph: string;
  description: string;
  accent: string;
  base: Stats;
  starter: string;
  rarity: RarityId;
  unlock: ClassUnlock;
  /** Отдельная метка для мега-легендарного класса из кейса. */
  elite?: boolean;
}

export interface WeaponSpecials {
  burn?: boolean;
  slow?: boolean;
  knockback?: boolean;
  homing?: boolean;
  bleed?: boolean;
}

export interface WeaponDef {
  id: string;
  name: string;
  classId: ClassId;
  kind: WeaponKind;
  description: string;
  damageMul: number;
  cooldownMul: number;
  speedMul: number;
  count: number;
  spread: number;
  range?: number;
  aoe?: number;
  radius?: number;
  arc?: number;
  pierce?: number;
  color: string;
  specials?: WeaponSpecials;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  size: number;
  color: string;
  ranged?: boolean;
  boss?: boolean;
  lifesteal?: number;
  ghost?: boolean;
  /** Чем враг бьёт: ядом, огнём или заразой. */
  status?: StatusId;
}

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  max: number;
  apply: (stats: Stats) => void;
}

export interface RunResult {
  time: number;
  kills: number;
  level: number;
  coins: number;
  wave: number;
  classId: ClassId;
  weaponId: string;
  modeId: string;
  campaignLevel: number;
  campaignName: string;
  /** true, если забег завершён успешным прохождением уровня кампании. */
  victory?: boolean;
}

export type AimMode = 'auto' | 'mouse';
export type FireMode = 'auto' | 'manual';
export type LocaleId = 'ru' | 'en';

export type AbilitySlot = 'a1' | 'a2' | 'ultimate';

export interface AbilityDef {
  id: string;
  slot: AbilitySlot;
  classId: ClassId;
  name: string;
  icon: string;
  description: string;
  cooldown: number;
}

export interface BaseUpgradeDef {
  id: string;
  name: string;
  glyph: string;
  description: string;
  max: number;
  baseCost: number;
  costMul: number;
}

/** Пакеты обмена монет на алмазы (временный источник до публикации и доната). */
export interface DiamondPackage {
  id: string;
  coins: number;
  diamonds: number;
}

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsSettings {
  quality: GraphicsQuality;
  blood: boolean;
  particles: boolean;
  lighting: boolean;
  vegetation: boolean;
  animals: boolean;
  shake: boolean;
  /** Временный новогодний декор: ёлки, снег, огни. */
  festive: boolean;
  /** Размытие движения при беге и быстрых атаках. */
  motionBlur: boolean;
}

export type CrosshairStyle = 'cross' | 'dot' | 'ring' | 'rune' | 'off';

export interface CrosshairSettings {
  enabled: boolean;
  style: CrosshairStyle;
}

export interface MusicSettings {
  enabled: boolean;
  /** 0..1, применяется к отдельной музыкальной шине. */
  volume: number;
}

export interface Bindings {
  up: string;
  down: string;
  left: string;
  right: string;
  dash: string;
  ability1: string;
  ability2: string;
  ultimate: string;
  heal: string;
  pause: string;
  minimap: string;
  interact: string;
  flashlight: string;
  fire: string;
  aimMode: AimMode;
  fireMode: FireMode;
}

export interface AbilitySlotState {
  id: string;
  slot?: AbilitySlot;
  name: string;
  icon: string;
  key: string;
  cd: number;
  max: number;
  charges?: number;
}

export interface BiomeDef {
  id: string;
  name: string;
  subtitle: string;
  ground: [string, string, string, string];
  accent: string;
  obstacle: 'walls' | 'maze' | 'ruins' | 'pillars' | 'trees' | 'throne';
  decor: 'grave' | 'stone' | 'rubble' | 'candle' | 'puddle' | 'bone';
  enemyBias?: string;
}

export type RarityId = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'ultra';

export interface RarityDef {
  id: RarityId;
  name: string;
  color: string;
  weight: number;
  priceMul: number;
}

export interface SkinDef {
  id: string;
  name: string;
  rarity: RarityId;
  color: string;
  accent: string;
  price: number;
  /** Состояние в духе CS: влияет только на описание и цену. */
  wear?: string;
}

export interface ModuleDef {
  id: string;
  name: string;
  rarity: RarityId;
  description: string;
  price: number;
  stats: Partial<Stats>;
}

export interface GameModeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  spawnMul: number;
  hpMul: number;
  damageMul: number;
  coinMul: number;
  bossEvery: number;
  biomeMul: number;
  /**Minimum profile level required to select this mode. */
  unlockLevel?: number;
  /**Hard time limit in seconds; the run ends when it expires. */
  timeLimit?: number;
  /**Open-world city cleanup with enterable buildings. */
  city?: boolean;
  /**Большой открытый мир с несколькими биомами на одной карте. */
  openWorld?: boolean;
}

export interface CaseReward {
  kind: 'weapon' | 'skin' | 'module' | 'coins' | 'class';
  id: string;
  name: string;
  rarity: RarityId;
  /** Фактическое количество монет для награды kind: 'coins'. */
  amount?: number;
}
