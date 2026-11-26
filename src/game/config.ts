import type {
  AbilityDef, BaseUpgradeDef, BiomeDef, Bindings, CaseReward, ClassDef, ClassId, DiamondPackage, EnemyDef, GameModeDef,
  ModuleDef, RarityDef, RarityId, SkinDef, Stats, UpgradeDef, WeaponDef, WeaponKind, WeaponSpecials,
} from './types';

const baseStats = (values: Partial<Stats> = {}): Stats => ({
  maxHp: 90,
  damage: 12,
  fireRate: 1.6,
  moveSpeed: 66,
  projectileSpeed: 170,
  projectileCount: 0,
  range: 150,
  area: 1,
  crit: 0.05,
  armor: 0,
  pickup: 34,
  regen: 0,
  lifesteal: 0,
  burn: 0,
  slow: 0,
  ...values,
});

const STARTER_CLASS_IDS: ClassId[] = ['mage', 'ninja', 'soldier', 'boxer', 'bandit', 'demolisher'];

const RAW_CLASSES: Array<Omit<ClassDef, 'rarity' | 'unlock'>> = [
  {
    id: 'mage',
    name: 'Маг',
    glyph: '✦',
    description: 'Дальний бой, стихии и проклятия. Держит дистанцию.',
    accent: '#8f7cc9',
    base: baseStats({ maxHp: 72, damage: 13, fireRate: 1.7, moveSpeed: 62, range: 160 }),
    starter: 'mage_spark',
  },
  {
    id: 'ninja',
    name: 'Ниндзя',
    glyph: '✕',
    description: 'Быстрый и юркий. Урон в упор и метальные клинки.',
    accent: '#7fa4b8',
    base: baseStats({ maxHp: 84, damage: 15, fireRate: 2.2, moveSpeed: 84, range: 118 }),
    starter: 'ninja_kunai',
  },
  {
    id: 'soldier',
    name: 'Военный',
    glyph: '▣',
    description: 'Огневая мощь и выносливость. Универсальный боец.',
    accent: '#87a06a',
    base: baseStats({ maxHp: 112, damage: 11, fireRate: 3.2, moveSpeed: 60, range: 178 }),
    starter: 'soldier_rifle',
  },
  {
    id: 'boxer',
    name: 'Боксёр',
    glyph: '✊',
    description: 'Мясорубка ближнего боя. Много здоровья и пробития.',
    accent: '#c98d55',
    base: baseStats({ maxHp: 152, damage: 27, fireRate: 1.8, moveSpeed: 66, range: 36 }),
    starter: 'boxer_fists',
  },
  {
    id: 'bandit',
    name: 'Бандит',
    glyph: '⌁',
    description: 'Точные выстрелы, нож и подручные средства.',
    accent: '#b56b5e',
    base: baseStats({ maxHp: 96, damage: 18, fireRate: 1.7, moveSpeed: 71, range: 145 }),
    starter: 'bandit_revolver',
  },
  {
    id: 'demolisher',
    name: 'Подрывник',
    glyph: '✹',
    description: 'Взрывы, мины и огонь. Контроль всей арены.',
    accent: '#c9a24b',
    base: baseStats({ maxHp: 126, damage: 30, fireRate: 0.95, moveSpeed: 56, range: 135 }),
    starter: 'demo_dynamite',
  },
  {
    id: 'vampire',
    name: 'Вампир',
    glyph: '☾',
    description: 'Легендарный класс. Лечится от урона и держится в самой гуще.',
    accent: '#b83848',
    base: baseStats({ maxHp: 108, damage: 17, fireRate: 2, moveSpeed: 72, range: 130, lifesteal: 0.08, regen: 0.4 }),
    starter: 'vampire_fang',
  },
  {
    id: 'vampire_prime',
    name: 'Вампир-Прайм',
    glyph: '♛',
    description: 'Мега-легендарный класс. Кровь врагов становится топливом, а урон — смертельным.',
    accent: '#e05a5a',
    base: baseStats({ maxHp: 138, damage: 23, fireRate: 2.1, moveSpeed: 76, range: 145, lifesteal: 0.14, regen: 0.9, crit: 0.12 }),
    starter: 'vampire_prime_scythe',
  },
  {
    id: 'executioner',
    name: 'Палач',
    glyph: '⚒',
    description: 'Мифический класс. Тяжёлый топор, пробитие и сильное отбрасывание.',
    accent: '#8c8f96',
    base: baseStats({ maxHp: 148, damage: 32, fireRate: 1.25, moveSpeed: 60, range: 52, armor: 2 }),
    starter: 'executioner_axe',
  },
  {
    id: 'necromancer',
    name: 'Некромант',
    glyph: '☠',
    description: 'Мифический класс. Проклятия, кости и яд на всей арене.',
    accent: '#7d9b6c',
    base: baseStats({ maxHp: 92, damage: 19, fireRate: 1.55, moveSpeed: 65, range: 155, area: 1.1 }),
    starter: 'necro_staff',
  },
];

export const CLASSES: ClassDef[] = RAW_CLASSES.map((cls) => ({
  ...cls,
  rarity: STARTER_CLASS_IDS.includes(cls.id) ? 'common' : cls.id === 'vampire' ? 'legendary' : cls.id === 'vampire_prime' ? 'ultra' : 'mythic',
  unlock: STARTER_CLASS_IDS.includes(cls.id) ? 'starter' : 'case',
  elite: cls.id === 'vampire_prime',
}));

export const isStarterClass = (id: ClassId): boolean => STARTER_CLASS_IDS.includes(id);

export const WEAPONS: WeaponDef[] = [
  // Маг
  { id: 'mage_spark', name: 'Искра', classId: 'mage', kind: 'bolt', description: 'Быстрый снаряд магии.', damageMul: 1, cooldownMul: 1, speedMul: 1, count: 1, spread: 0, color: '#c8a8ff' },
  { id: 'mage_frost', name: 'Ледяной шип', classId: 'mage', kind: 'bolt', description: 'Замедляет врагов.', damageMul: 0.85, cooldownMul: 1.1, speedMul: 1, count: 1, spread: 0, color: '#9fd8e8', specials: { slow: true } },
  { id: 'mage_flame', name: 'Пламя костра', classId: 'mage', kind: 'flame', description: 'Короткий конус огня, поджигает.', damageMul: 0.65, cooldownMul: 1, speedMul: 0.75, count: 4, spread: 0.9, range: 62, color: '#e08a3c', specials: { burn: true } },
  { id: 'mage_grimoire', name: 'Гримуар', classId: 'mage', kind: 'orb', description: 'Самонаводящиеся сферы, пробивают строй.', damageMul: 1.35, cooldownMul: 1.4, speedMul: 0.85, count: 2, spread: 0.35, pierce: 3, color: '#b47ce0' },

  // Ниндзя
  { id: 'ninja_kunai', name: 'Кунай', classId: 'ninja', kind: 'bolt', description: 'Быстрый и точный клинок.', damageMul: 1, cooldownMul: 1, speedMul: 1.25, count: 1, spread: 0, color: '#c6d6de' },
  { id: 'ninja_katana', name: 'Катана', classId: 'ninja', kind: 'melee', description: 'Широкий режущий размах.', damageMul: 1.9, cooldownMul: 1.1, speedMul: 1, count: 1, spread: 0, radius: 42, arc: 1.5, color: '#dce6eb' },
  { id: 'ninja_shuriken', name: 'Сюрикены', classId: 'ninja', kind: 'spread', description: 'Три звезды веером.', damageMul: 0.72, cooldownMul: 1.1, speedMul: 1.1, count: 3, spread: 0.34, color: '#b9ccd6' },
  { id: 'ninja_smoke', name: 'Дымка', classId: 'ninja', kind: 'nova', description: 'Ядовитое облако вокруг.', damageMul: 0.55, cooldownMul: 1.35, speedMul: 1, count: 1, spread: 0, radius: 58, color: '#7fac7c', specials: { burn: true } },

  // Военный
  { id: 'soldier_rifle', name: 'Автомат', classId: 'soldier', kind: 'burst', description: 'Скорострельная серия.', damageMul: 0.8, cooldownMul: 0.8, speedMul: 1.2, count: 1, spread: 0.06, color: '#e0d6a8' },
  { id: 'soldier_shotgun', name: 'Дробовик', classId: 'soldier', kind: 'spread', description: 'Пять картечин веером.', damageMul: 0.68, cooldownMul: 1.45, speedMul: 1.05, count: 5, spread: 0.52, color: '#e8c98a' },
  { id: 'soldier_grenade', name: 'Гранатомёт', classId: 'soldier', kind: 'explosive', description: 'Взрывная граната.', damageMul: 1.7, cooldownMul: 1.8, speedMul: 0.9, count: 1, spread: 0, aoe: 36, color: '#9aa873' },
  { id: 'soldier_sniper', name: 'Снайперка', classId: 'soldier', kind: 'bolt', description: 'Пробивает несколько врагов.', damageMul: 2.5, cooldownMul: 2.1, speedMul: 1.7, count: 1, spread: 0, pierce: 4, color: '#f0e2b0' },

  // Боксёр
  { id: 'boxer_fists', name: 'Кастеты', classId: 'boxer', kind: 'melee', description: 'Быстрые удары кулаками.', damageMul: 1, cooldownMul: 0.9, speedMul: 1, count: 1, spread: 0, radius: 34, arc: 1.1, color: '#d29a72' },
  { id: 'boxer_hammer', name: 'Кувалда', classId: 'boxer', kind: 'melee', description: 'Тяжёлый удар с отбрасыванием.', damageMul: 2.3, cooldownMul: 1.75, speedMul: 1, count: 1, spread: 0, radius: 44, arc: 1.3, color: '#b98a5c', specials: { knockback: true } },
  { id: 'boxer_chains', name: 'Цепи', classId: 'boxer', kind: 'melee', description: 'Дальний захват цепями.', damageMul: 1.25, cooldownMul: 1.15, speedMul: 1, count: 1, spread: 0, radius: 64, arc: 0.9, color: '#a9a29a' },
  { id: 'boxer_wave', name: 'Ударная волна', classId: 'boxer', kind: 'nova', description: 'Сбивает всех вокруг.', damageMul: 1.45, cooldownMul: 1.55, speedMul: 1, count: 1, spread: 0, radius: 62, color: '#d9b17a', specials: { knockback: true } },

  // Бандит
  { id: 'bandit_revolver', name: 'Револьвер', classId: 'bandit', kind: 'bolt', description: 'Точный и мощный выстрел.', damageMul: 1.55, cooldownMul: 1.3, speedMul: 1.3, count: 1, spread: 0, color: '#e5c58c' },
  { id: 'bandit_double', name: 'Двустволка', classId: 'bandit', kind: 'spread', description: 'Четыре дробины веером.', damageMul: 0.95, cooldownMul: 1.5, speedMul: 1.1, count: 4, spread: 0.32, color: '#d9ad74' },
  { id: 'bandit_knife', name: 'Нож', classId: 'bandit', kind: 'melee', description: 'Быстрый удар с кровотечением.', damageMul: 1.4, cooldownMul: 0.7, speedMul: 1, count: 1, spread: 0, radius: 32, arc: 0.9, color: '#d4d8d0', specials: { bleed: true } },
  { id: 'bandit_molotov', name: 'Коктейль', classId: 'bandit', kind: 'explosive', description: 'Горящая бутылка.', damageMul: 1.25, cooldownMul: 1.8, speedMul: 0.95, count: 1, spread: 0, aoe: 40, color: '#df843c', specials: { burn: true } },

  // Подрывник
  { id: 'demo_dynamite', name: 'Динамит', classId: 'demolisher', kind: 'explosive', description: 'Классический взрыв.', damageMul: 2.1, cooldownMul: 1.7, speedMul: 0.85, count: 1, spread: 0, aoe: 42, color: '#c85c48' },
  { id: 'demo_mines', name: 'Мины', classId: 'demolisher', kind: 'mine', description: 'Мина рвётся под врагом.', damageMul: 2.5, cooldownMul: 1.5, speedMul: 1, count: 1, spread: 0, aoe: 44, color: '#b6a05c' },
  { id: 'demo_flamer', name: 'Огнемёт', classId: 'demolisher', kind: 'flame', description: 'Поток огня, поджигает.', damageMul: 0.75, cooldownMul: 0.85, speedMul: 0.85, count: 5, spread: 0.75, range: 58, color: '#e8793a', specials: { burn: true } },
  { id: 'demo_rocket', name: 'Ракетница', classId: 'demolisher', kind: 'explosive', description: 'Самонаводящаяся ракета.', damageMul: 2.2, cooldownMul: 2, speedMul: 1, count: 1, spread: 0, aoe: 38, color: '#d97058', specials: { homing: true } },

  // Классы из кейса
  { id: 'vampire_fang', name: 'Клык', classId: 'vampire', kind: 'melee', description: 'Быстрый укус с кровотечением.', damageMul: 1.5, cooldownMul: 0.85, speedMul: 1, count: 1, spread: 0, radius: 36, arc: 1, color: '#b83848', specials: { bleed: true } },
  { id: 'vampire_prime_scythe', name: 'Коса прайма', classId: 'vampire_prime', kind: 'melee', description: 'Мега-легендарный размах, рвущий строй.', damageMul: 2.4, cooldownMul: 1.2, speedMul: 1, count: 1, spread: 0, radius: 62, arc: 1.8, color: '#e05a5a', specials: { bleed: true, knockback: true } },
  { id: 'executioner_axe', name: 'Топор палача', classId: 'executioner', kind: 'melee', description: 'Тяжёлый топор с широким замахом.', damageMul: 2.6, cooldownMul: 1.35, speedMul: 1, count: 1, spread: 0, radius: 48, arc: 1.5, color: '#8c8f96', specials: { knockback: true } },
  { id: 'necro_staff', name: 'Посох костей', classId: 'necromancer', kind: 'orb', description: 'Пробивающая сфера из костного праха.', damageMul: 1.3, cooldownMul: 1.25, speedMul: 0.9, count: 1, spread: 0, pierce: 4, color: '#8fbf63', specials: { bleed: true } },
];

/**
 * Архетипы оружия генерируются по фиксированным правилам: класс × тип снаряда × эффект.
 * Это не случайный мусор: у каждого тира есть своя роль, диапазон урона и темпа,
 * а идентификатор детерминирован и не ломает сохранения игроков.
 */
const GENERATED_WEAPON_NAMES: Record<ClassId, string[]> = {
  mage: ['Осколок льда', 'Пепельный вихрь', 'Молния в бутылке', 'Зеркало душ', 'Метеорит', 'Кольцо мороза', 'Книга скорби', 'Искры ада', 'Комета', 'Хрустальный посох'],
  ninja: ['Заряд клинков', 'Веер сюрикенов', 'Теневой выпад', 'Дымный клинок', 'Обоюдоострый', 'Тихий шаг', 'Взрывчатая звезда', 'Пламя фонаря', 'Ловушка', 'Лунная сталь'],
  soldier: ['Пистолет-пулемёт', 'Картечь', 'Трёхстрочка', 'Пуля-ракета', 'Штык', 'Осколочная', 'Дымовая шашка', 'Напалм', 'Мина-сюрприз', 'Снайперский дротик'],
  boxer: ['Железная перчатка', 'Пружинный удар', 'Разрывной удар', 'Кистень', 'Громовой кулак', 'Удар снизу', 'Молот', 'Раскалённые кастеты', 'Взрывной ринг', 'Титан-перчатка'],
  bandit: ['Дерринджер', 'Картечный залп', 'Быстрая очередь', 'Прицельная пуля', 'Нож с выемкой', 'Капкан', 'Фальшивая монета', 'Бутылка с бензином', 'Пороховая ловушка', 'Тяжёлый револьвер'],
  demolisher: ['Малая граната', 'Шрапнель', 'Пусковая установка', 'Осколочная мина', 'Пластик', 'Дымовая завеса', 'Фугас', 'Огнемётная струя', 'Минный сюрприз', 'Реактивный снаряд'],
  vampire: ['Кровавый клык', 'Вампирский нож', 'Проклятая пуля', 'Кровяная сфера', 'Укус', 'Кровавый круг', 'Ампула', 'Пламенный ковёр', 'Кровавая мина', 'Вечерняя тень'],
  vampire_prime: ['Коса прайма', 'Кровавый вихрь', 'Залп прайма', 'Сердце титана', 'Мега-укус', 'Кровавая луна', 'Прайм-граната', 'Пламя апокалипсиса', 'Чёрная мина', 'Тронная коса'],
  executioner: ['Маленький топор', 'Гильотина', 'Метательный топор', 'Палаческий нож', 'Секира', 'Судный круг', 'Тяжёлый молот', 'Костёр палача', 'Капкан палача', 'Казнь'],
  necromancer: ['Кость', 'Черепа веер', 'Проклятая очередь', 'Душа мертвеца', 'Костяной нож', 'Круг скверны', 'Гроб', 'Болотный огонь', 'Могильная мина', 'Посох жнеца'],
};

const GENERATED_PREFIXES = [
  'Зачарованный', 'Ржавый', 'Кровавый', 'Лунный', 'Пепельный',
  'Забытый', 'Титанский', 'Проклятый', 'Хрустальный', 'Последний',
];
const GENERATED_SUFFIXES = [
  'Света', 'Мора', 'Титана', 'Скверны', 'Зари',
  'Воина', 'Призрака', 'Кости', 'Пламени', 'Вечности',
];

const GENERATED_KINDS: WeaponKind[] = [
  'bolt', 'spread', 'burst', 'orb', 'melee', 'nova', 'explosive', 'flame', 'mine', 'orb',
];
const GENERATED_SPECIALS: Array<{ specials: WeaponSpecials; text: string }> = [
  { specials: {}, text: 'Точный и сбалансированный бой.' },
  { specials: { burn: true }, text: 'Поджигает цель.' },
  { specials: { slow: true }, text: 'Замедляет врагов.' },
  { specials: { knockback: true }, text: 'Отбрасывает назад.' },
  { specials: { bleed: true }, text: 'Вызывает кровотечение.' },
];
const GENERATED_COLORS = ['#c8a8ff', '#9fd8e8', '#e0d6a8', '#d9b17a', '#e5c58c', '#c85c48', '#8fbf63', '#e8793a', '#b6a05c', '#d97058'];

function generateWeapons(): WeaponDef[] {
  const result: WeaponDef[] = [];
  for (const cls of CLASSES) {
    for (let i = 0; i < 100; i += 1) {
      const baseName = GENERATED_WEAPON_NAMES[cls.id][i < 10 ? i : (i - 10) % 10];
      const name = i < 10
        ? baseName
        : `${GENERATED_PREFIXES[Math.floor((i - 10) / 10)]} ${baseName} ${GENERATED_SUFFIXES[(i - 10) % 10]}`;
      const tier = i % 4;
      const phase = Math.floor(i / 4);
      const rank = Math.min(9, phase);
      const kind = GENERATED_KINDS[i % GENERATED_KINDS.length];
      const effect = GENERATED_SPECIALS[(i + phase) % GENERATED_SPECIALS.length];
      const weapon: WeaponDef = {
        id: `${cls.id}_arc${i + 1}`,
        name,
        classId: cls.id,
        kind,
        description: effect.text,
        damageMul: Number((0.92 + tier * 0.16 + rank * 0.08).toFixed(2)),
        cooldownMul: Number((1.1 - tier * 0.05 + rank * 0.03).toFixed(2)),
        speedMul: Number((0.95 + ((i * 3) % 5) * 0.06).toFixed(2)),
        count: kind === 'spread' ? 3 + tier : kind === 'flame' ? 4 + tier : kind === 'orb' ? 1 + (i % 2) : 1,
        spread: kind === 'spread' ? 0.14 + tier * 0.05 : kind === 'burst' ? 0.05 : kind === 'flame' ? 0.55 + tier * 0.05 : 0,
        color: GENERATED_COLORS[(i + phase) % GENERATED_COLORS.length],
        specials: { ...effect.specials },
      };
      if (kind === 'melee') {
        weapon.radius = 36 + tier * 4;
        weapon.arc = 1 + tier * 0.12;
      }
      if (kind === 'nova') weapon.radius = 48 + tier * 7;
      if (kind === 'explosive' || kind === 'mine') weapon.aoe = 30 + tier * 5;
      if (kind === 'flame') weapon.range = 54 + tier * 5;
      if (kind === 'orb') weapon.pierce = 1 + tier;
      result.push(weapon);
    }
  }
  return result;
}

WEAPONS.push(...generateWeapons());

export const ENEMIES: Record<string, EnemyDef> = {
  skeleton: { id: 'skeleton', name: 'Скелет', hp: 20, speed: 24, damage: 8, xp: 1, size: 11, color: '#c9c4b4' },
  zombie: { id: 'zombie', name: 'Зомби', hp: 46, speed: 15, damage: 12, xp: 2, size: 13, color: '#6f7a62', status: 'poison' },
  vampire: { id: 'vampire', name: 'Вампир', hp: 28, speed: 36, damage: 10, xp: 2, size: 11, color: '#933b47', lifesteal: 2, status: 'infection' },
  ghost: { id: 'ghost', name: 'Призрак', hp: 22, speed: 30, damage: 7, xp: 2, size: 11, color: '#9fb6c4', ghost: true, status: 'infection' },
  cultist: { id: 'cultist', name: 'Культист', hp: 30, speed: 18, damage: 9, xp: 3, size: 11, color: '#8a69ad', ranged: true, status: 'burn' },
  boss: { id: 'boss', name: 'Костяной титан', hp: 520, speed: 17, damage: 22, xp: 40, size: 24, color: '#b8a98c', boss: true, status: 'burn' },
};

export const UPGRADES: UpgradeDef[] = [
  { id: 'damage', name: 'Острота', icon: '⚔', description: '+22% урона', max: 6, apply: (s) => { s.damage *= 1.22; } },
  { id: 'firerate', name: 'Скорострельность', icon: '⏩', description: '+16% темпа атаки', max: 5, apply: (s) => { s.fireRate *= 1.16; } },
  { id: 'speed', name: 'Лёгкие шаги', icon: '➤', description: '+12% скорости', max: 5, apply: (s) => { s.moveSpeed *= 1.12; } },
  { id: 'hp', name: 'Крепкая плоть', icon: '♥', description: '+25 к макс. здоровью, лечение', max: 6, apply: (s) => { s.maxHp += 25; } },
  { id: 'count', name: 'Двойной выстрел', icon: '✣', description: '+1 снаряд', max: 4, apply: (s) => { s.projectileCount += 1; } },
  { id: 'area', name: 'Ширь', icon: '◎', description: '+20% радиуса', max: 4, apply: (s) => { s.area *= 1.2; } },
  { id: 'crit', name: 'Точный глаз', icon: '✧', description: '+8% шанс крита', max: 5, apply: (s) => { s.crit += 0.08; } },
  { id: 'armor', name: 'Броня', icon: '▣', description: '-2 урона от попадания', max: 5, apply: (s) => { s.armor += 2; } },
  { id: 'pickup', name: 'Магнит', icon: '⊙', description: '+35% радиус сбора', max: 4, apply: (s) => { s.pickup *= 1.35; } },
  { id: 'projSpeed', name: 'Быстрый полёт', icon: '➶', description: '+20% скорости снарядов', max: 4, apply: (s) => { s.projectileSpeed *= 1.2; } },
  { id: 'regen', name: 'Регенерация', icon: '✚', description: '+0.8 HP/сек', max: 5, apply: (s) => { s.regen += 0.8; } },
  { id: 'lifesteal', name: 'Кровопийца', icon: '☾', description: '+4% от урона в здоровье', max: 4, apply: (s) => { s.lifesteal += 0.04; } },
  { id: 'burn', name: 'Горячее железо', icon: '♨', description: '+4 урона от поджога', max: 4, apply: (s) => { s.burn += 4; } },
  { id: 'slow', name: 'Холод', icon: '❄', description: '+10% замедления', max: 4, apply: (s) => { s.slow += 0.1; } },
];

export const getClass = (id: string): ClassDef => CLASSES.find((c) => c.id === id) ?? CLASSES[0];
export const getWeapon = (id: string): WeaponDef => WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
export const weaponsForClass = (id: string): WeaponDef[] => WEAPONS.filter((w) => w.classId === id);

export function rollUpgrades(taken: Record<string, number>, count = 3): UpgradeDef[] {
  const pool = UPGRADES.filter((u) => (taken[u.id] ?? 0) < u.max && u.id !== 'heal');
  const picked: UpgradeDef[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

export function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------------------------------------------------------------- способности

export const ABILITIES: AbilityDef[] = [
  { id: 'mage_nova', slot: 'a1', classId: 'mage', name: 'Морозный круг', icon: '❄', description: 'Замедляет и ранит всех вокруг', cooldown: 9 },
  { id: 'mage_blink', slot: 'a2', classId: 'mage', name: 'Мгновение', icon: '➶', description: 'Телепорт вперёд с неуязвимостью', cooldown: 6 },
  { id: 'mage_meteor', slot: 'ultimate', classId: 'mage', name: 'Метеор', icon: '☄', description: 'Огненный удар по врагу', cooldown: 30 },

  { id: 'ninja_smoke', slot: 'a1', classId: 'ninja', name: 'Дымовая бомба', icon: '☁', description: 'Яд и замедление вокруг', cooldown: 9 },
  { id: 'ninja_step', slot: 'a2', classId: 'ninja', name: 'Теневой шаг', icon: '»', description: 'Рывок сквозь врагов с уроном', cooldown: 5 },
  { id: 'ninja_storm', slot: 'ultimate', classId: 'ninja', name: 'Буря клинков', icon: '✺', description: 'Смерч из лезвий вокруг', cooldown: 24 },

  { id: 'soldier_grenade', slot: 'a1', classId: 'soldier', name: 'Граната', icon: '✹', description: 'Взрыв в стороне врага', cooldown: 7 },
  { id: 'soldier_suppress', slot: 'a2', classId: 'soldier', name: 'Подавление', icon: '⏩', description: 'Темп атаки ×2 на 5 секунд', cooldown: 13 },
  { id: 'soldier_airstrike', slot: 'ultimate', classId: 'soldier', name: 'Авиаудар', icon: '▼', description: 'Пять взрывов по толпе', cooldown: 30 },

  { id: 'boxer_rage', slot: 'a1', classId: 'boxer', name: 'Ярость', icon: '♨', description: 'Урон и скорость ×1.7 на 6 секунд', cooldown: 15 },
  { id: 'boxer_slam', slot: 'a2', classId: 'boxer', name: 'Землетрясение', icon: '▣', description: 'Удар с отбрасыванием', cooldown: 8 },
  { id: 'boxer_quake', slot: 'ultimate', classId: 'boxer', name: 'Обвал', icon: '⛰', description: 'Огромный удар по арене', cooldown: 26 },

  { id: 'bandit_fan', slot: 'a1', classId: 'bandit', name: 'Веер', icon: '✣', description: 'Восемь пуль веером', cooldown: 8 },
  { id: 'bandit_evade', slot: 'a2', classId: 'bandit', name: 'Уворот', icon: '⌁', description: 'Рывок с долгой неуязвимостью', cooldown: 6 },
  { id: 'bandit_bundle', slot: 'ultimate', classId: 'bandit', name: 'Связка динамита', icon: '✸', description: 'Цепные взрывы вокруг', cooldown: 26 },

  { id: 'demo_minefield', slot: 'a1', classId: 'demolisher', name: 'Минное поле', icon: '◎', description: 'Четыре мины вокруг тебя', cooldown: 10 },
  { id: 'demo_burst', slot: 'a2', classId: 'demolisher', name: 'Огненный выброс', icon: '♨', description: 'Конус огня с поджогом', cooldown: 7 },
  { id: 'demo_nuke', slot: 'ultimate', classId: 'demolisher', name: 'Большая бомба', icon: '☢', description: 'Гигантский взрыв и поджог', cooldown: 32 },

  { id: 'vampire_drain', slot: 'a1', classId: 'vampire', name: 'Кровный порыв', icon: '♥', description: 'Ранит круг врагов и восстанавливает HP', cooldown: 9 },
  { id: 'vampire_bite', slot: 'a2', classId: 'vampire', name: 'Зуб вампира', icon: '➶', description: 'Рывок с мощным укусом и лечением', cooldown: 7 },
  { id: 'vampire_moon', slot: 'ultimate', classId: 'vampire', name: 'Кровавая луна', icon: '☾', description: 'Огромный круг урона и готовность', cooldown: 28 },

  { id: 'vprime_vortex', slot: 'a1', classId: 'vampire_prime', name: 'Вихрь прайма', icon: '✺', description: 'Смертельный круг с кровотечением', cooldown: 8 },
  { id: 'vprime_bite', slot: 'a2', classId: 'vampire_prime', name: 'Инфернальный укус', icon: '♨', description: 'Рывок, поджог и восстановление', cooldown: 6 },
  { id: 'vprime_apocalypse', slot: 'ultimate', classId: 'vampire_prime', name: 'Апокалипсис прайма', icon: '☄', description: 'Мега-легендарный взрыв и лечение', cooldown: 26 },

  { id: 'executioner_guillotine', slot: 'a1', classId: 'executioner', name: 'Гильотина', icon: '⚒', description: 'Точный рубящий удар вперёд', cooldown: 8 },
  { id: 'executioner_sweep', slot: 'a2', classId: 'executioner', name: 'Круг палача', icon: '◎', description: 'Отбрасывающий удар вокруг', cooldown: 10 },
  { id: 'executioner_sentence', slot: 'ultimate', classId: 'executioner', name: 'Смертельный приговор', icon: '⚔', description: 'Массовый удар с пробитием', cooldown: 26 },

  { id: 'necro_souls', slot: 'a1', classId: 'necromancer', name: 'Души мертвых', icon: '☠', description: 'Круг скверны с кровотечением', cooldown: 9 },
  { id: 'necro_bolt', slot: 'a2', classId: 'necromancer', name: 'Костяная стрела', icon: '➶', description: 'Пробивающий залп костей', cooldown: 7 },
  { id: 'necro_blight', slot: 'ultimate', classId: 'necromancer', name: 'Скверна', icon: '✺', description: 'Огромная зона поражения с ядом', cooldown: 28 },
];

export const DEFAULT_BINDINGS: Bindings = {
  up: 'w',
  down: 's',
  left: 'a',
  right: 'd',
  dash: ' ',
  ability1: 'q',
  ability2: 'e',
  ultimate: 'r',
  heal: 'f',
  pause: 'escape',
  minimap: 'm',
  interact: 'g',
  flashlight: 't',
  fire: 'j',
  // Мышь — основной способ наведения: прицел следует за курсором, огонь по ЛКМ.
  aimMode: 'mouse',
  fireMode: 'manual',
};

export const DASH_COOLDOWN = 3.5;
export const HEAL_COOLDOWN = 0.6;
export const HEAL_CHARGES = 3;

/** Улучшения базы: постоянные бонусы и телепорт на уровни кампании. */
export const BASE_UPGRADES: BaseUpgradeDef[] = [
  { id: 'hearth', name: 'Очаг', glyph: '♨', description: '+8 макс. HP за уровень', max: 10, baseCost: 120, costMul: 1.55 },
  { id: 'forge', name: 'Кузна', glyph: '⚒', description: '+4% урона за уровень', max: 10, baseCost: 160, costMul: 1.6 },
  { id: 'greenhouse', name: 'Теплица', glyph: '✿', description: '+0.35 HP/сек за уровень', max: 8, baseCost: 140, costMul: 1.6 },
  { id: 'vault', name: 'Хранилище', glyph: '▣', description: '+8% монет за уровень', max: 8, baseCost: 180, costMul: 1.65 },
  { id: 'beacon', name: 'Маяк', glyph: '✦', description: '+6 радиуса подбора за уровень', max: 8, baseCost: 130, costMul: 1.55 },
  { id: 'gate', name: 'Врата города', glyph: '▦', description: '−4% силы врагов города и +5% шанс сундука', max: 8, baseCost: 220, costMul: 1.7 },
];

export function baseUpgradeCost(def: BaseUpgradeDef, currentLevel: number): number {
  return Math.round(def.baseCost * Math.pow(def.costMul, Math.max(0, currentLevel)));
}

/** Профиль игрока: 1000 уровней, каждый даёт монеты и открывает долгую цель. */
export const MAX_PROFILE_LEVEL = 1000;

export function xpForLevel(level: number): number {
  if (level >= MAX_PROFILE_LEVEL) return 0;
  return Math.round(60 * Math.pow(level, 1.4) + level * 20);
}

export const abilitiesForClass = (id: ClassId): AbilityDef[] => ABILITIES.filter((a) => a.classId === id);
export const abilityForSlot = (classId: ClassId, slot: AbilityDef['slot']): AbilityDef | undefined =>
  ABILITIES.find((a) => a.classId === classId && a.slot === slot);

export function keyLabel(key: string): string {
  if (key === ' ') return 'ПРОБЕЛ';
  if (key === 'escape') return 'ESC';
  if (key === 'arrowup') return '↑';
  if (key === 'arrowdown') return '↓';
  if (key === 'arrowleft') return '←';
  if (key === 'arrowright') return '→';
  if (key === 'shift') return 'SHIFT';
  if (key === 'control') return 'CTRL';
  return key.toUpperCase();
}

// ---------------------------------------------------------------- локации

export const BIOMES: BiomeDef[] = [
  { id: 'graveyard', name: 'Старое кладбище', subtitle: 'Здесь никто не уходит по своей воле', ground: ['#1a1d20', '#16191d', '#1d2024', '#14171a'], accent: '#8f8d7d', obstacle: 'walls', decor: 'grave' },
  { id: 'catacombs', name: 'Катакомбы', subtitle: 'Тесные коридоры и шепот в темноте', ground: ['#151a20', '#12161b', '#1a1f26', '#101418'], accent: '#7f94a8', obstacle: 'maze', decor: 'stone', enemyBias: 'skeleton' },
  { id: 'ruins', name: 'Развалины города', subtitle: 'Бочки, обломки и обгоревшие балки', ground: ['#1e1b18', '#191714', '#22201c', '#151311'], accent: '#b08a5c', obstacle: 'ruins', decor: 'rubble', enemyBias: 'cultist' },
  { id: 'crypt', name: 'Склеп', subtitle: 'Свечи горят, но тепла от них нет', ground: ['#1b1820', '#17141c', '#201c25', '#131118'], accent: '#a387c4', obstacle: 'pillars', decor: 'candle', enemyBias: 'vampire' },
  { id: 'swamp', name: 'Чёрное болото', subtitle: 'Вода шевелится даже без ветра', ground: ['#161d18', '#131a15', '#1a221b', '#111712'], accent: '#6f9c62', obstacle: 'trees', decor: 'puddle', enemyBias: 'zombie' },
  { id: 'throne', name: 'Трон титана', subtitle: 'Костры стражей освещают трон', ground: ['#201a17', '#1b1613', '#241d19', '#161210'], accent: '#c9a24b', obstacle: 'throne', decor: 'bone', enemyBias: 'boss' },
];

export const BIOME_DURATION = 45;

export function lockedWeapons(unlocked: string[]): WeaponDef[] {
  const owned = new Set(unlocked);
  return WEAPONS.filter((weapon) => !owned.has(weapon.id));
}

export function isWeaponUnlocked(id: string, unlocked: string[]): boolean {
  return unlocked.includes(id);
}

// ---------------------------------------------------------------- редкости и магазин

export const RARITIES: Record<RarityId, RarityDef> = {
  common: { id: 'common', name: 'Обычный', color: '#b8b8b8', weight: 60, priceMul: 1 },
  rare: { id: 'rare', name: 'Редкий', color: '#5b9bd5', weight: 25, priceMul: 2 },
  epic: { id: 'epic', name: 'Эпический', color: '#b06bd8', weight: 10, priceMul: 4 },
  legendary: { id: 'legendary', name: 'Легендарный', color: '#d9a441', weight: 4, priceMul: 8 },
  mythic: { id: 'mythic', name: 'Мифический', color: '#e05a5a', weight: 0.99, priceMul: 16 },
  ultra: { id: 'ultra', name: 'Ультрамифический', color: '#7ce0d0', weight: 0.01, priceMul: 32 },
};

export const RARITY_LIST = Object.values(RARITIES);

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function rarityOfWeapon(id: string): RarityId {
  const roll = hashString(id) * 100;
  if (roll < 0.01) return 'ultra';
  if (roll < 1) return 'mythic';
  if (roll < 5) return 'legendary';
  if (roll < 15) return 'epic';
  if (roll < 40) return 'rare';
  return 'common';
}

export function weaponPrice(id: string): number {
  return Math.round(120 * RARITIES[rarityOfWeapon(id)].priceMul);
}

export function rollRarity(): RarityId {
  const roll = Math.random() * 100;
  let edge = 0;
  for (const rarity of RARITY_LIST) {
    edge += rarity.weight;
    if (roll < edge) return rarity.id;
  }
  return 'common';
}

export const SKINS: SkinDef[] = [
  { id: 'skin_ash', name: 'Пепел', rarity: 'common', color: '#9a9a94', accent: '#c9c4b4', price: 100 },
  { id: 'skin_soil', name: 'Земля', rarity: 'common', color: '#8a7c63', accent: '#b6a988', price: 100 },
  { id: 'skin_bone', name: 'Кость', rarity: 'rare', color: '#d8d2bd', accent: '#f0e8d0', price: 220 },
  { id: 'skin_ember', name: 'Уголь', rarity: 'rare', color: '#d0703c', accent: '#f0b06a', price: 240 },
  { id: 'skin_frost', name: 'Иней', rarity: 'epic', color: '#9fd8e8', accent: '#e0f4fa', price: 450 },
  { id: 'skin_toxin', name: 'Яд', rarity: 'epic', color: '#8fbf63', accent: '#cdea9a', price: 480 },
  { id: 'skin_void', name: 'Пустота', rarity: 'legendary', color: '#8a6bc0', accent: '#d6b8ff', price: 900 },
  { id: 'skin_blood', name: 'Кровь', rarity: 'legendary', color: '#b83848', accent: '#f07080', price: 950 },
  { id: 'skin_gold', name: 'Золото титана', rarity: 'mythic', color: '#d9a441', accent: '#ffe6a0', price: 1800 },
  { id: 'skin_wraith', name: 'Призрак скелета', rarity: 'mythic', color: '#9fb6c4', accent: '#eaf6ff', price: 1900 },
  { id: 'skin_starfall', name: 'Падающая звезда', rarity: 'ultra', color: '#7ce0d0', accent: '#e6fffb', price: 3600 },
  { id: 'skin_apocalypse', name: 'Апокалипсис', rarity: 'ultra', color: '#f0d68a', accent: '#ff7a5a', price: 4000 },
];

const SKIN_WEARS = [
  'Заводское состояние', 'Почти новое', 'Немного поношенное',
  'После полевых испытаний', 'Потёртое',
];
const SKIN_NAMES = [
  'Акациевый лес', 'Неоновый зомби', 'Ржавый клинок', 'Пепел Венеции', 'Кровавый закат',
  'Янтарный склеп', 'Голубая плесень', 'Костяная пыль', 'Затмение', 'Болотная тина',
  'Медный дождь', 'Вулканический пепел', 'Хрустальный гроб', 'Змеиная кожа', 'Лунный свет',
  'Тёплый труп', 'Радиационный туман', 'Чёрная кость', 'Серебряный шип', 'Королевский некроз',
  'Огненный крест', 'Глубокий океан', 'Звёздная пыль', 'Последний свет',
];
const SKIN_RARITY_ORDER: RarityId[] = [
  'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common',
  'rare', 'rare', 'rare', 'rare', 'rare', 'rare',
  'epic', 'epic', 'epic', 'epic',
  'legendary', 'legendary', 'legendary',
  'mythic', 'mythic', 'ultra',
];
const SKIN_COLORS = ['#8a9a7a', '#9f6bb8', '#a3714a', '#8a8f9e', '#b83848', '#d9a441', '#6f9c62', '#7fa4b8', '#c9a24b', '#9a6b52'];

SKINS.push(...SKIN_NAMES.map((name, i) => {
  const rarity = SKIN_RARITY_ORDER[i];
  const color = SKIN_COLORS[i % SKIN_COLORS.length];
  return {
    id: `skin_gen_${i + 1}`,
    name,
    rarity,
    color,
    accent: SKIN_COLORS[(i + 3) % SKIN_COLORS.length],
    price: Math.round((100 + i * 8) * RARITIES[rarity].priceMul),
    wear: SKIN_WEARS[i % SKIN_WEARS.length],
  };
}));

export const MODULES: ModuleDef[] = [
  { id: 'mod_edge', name: 'Заточка', rarity: 'common', description: '+12% урона', price: 120, stats: { damage: 1.12 } },
  { id: 'mod_plating', name: 'Пластина', rarity: 'common', description: '+2 брони', price: 120, stats: { armor: 2 } },
  { id: 'mod_spring', name: 'Пружины', rarity: 'rare', description: '+10% скорости', price: 260, stats: { moveSpeed: 1.1 } },
  { id: 'mod_magnet', name: 'Магнит', rarity: 'rare', description: '+40% радиуса сбора', price: 260, stats: { pickup: 1.4 } },
  { id: 'mod_coolant', name: 'Охлаждение', rarity: 'epic', description: '+14% темпа атаки', price: 500, stats: { fireRate: 1.14 } },
  { id: 'mod_heart', name: 'Второе сердце', rarity: 'epic', description: '+30 HP', price: 520, stats: { maxHp: 30 } },
  { id: 'mod_scope', name: 'Прицел', rarity: 'legendary', description: '+12% крита и дальности', price: 1000, stats: { crit: 0.12, range: 1.12 } },
  { id: 'mod_reactor', name: 'Реактор', rarity: 'mythic', description: '+25% урона, +10% темпа', price: 2000, stats: { damage: 1.25, fireRate: 1.1 } },
  { id: 'mod_singularity', name: 'Сингулярность', rarity: 'ultra', description: '+30% урона, +25% радиуса, +2 HP/сек', price: 4200, stats: { damage: 1.3, area: 1.25, regen: 2 } },

  { id: 'mod_grind', name: 'Наждачка', rarity: 'common', description: '+7% урона', price: 110, stats: { damage: 1.07 } },
  { id: 'mod_belt', name: 'Ремень', rarity: 'common', description: '+6% скорости', price: 110, stats: { moveSpeed: 1.06 } },
  { id: 'mod_patch', name: 'Заплатка', rarity: 'common', description: '+1 брони', price: 100, stats: { armor: 1 } },
  { id: 'mod_reflex', name: 'Рефлексы', rarity: 'rare', description: '+6% крита', price: 280, stats: { crit: 0.06 } },
  { id: 'mod_spring2', name: 'Пружинный привод', rarity: 'rare', description: '+9% темпа атаки', price: 290, stats: { fireRate: 1.09 } },
  { id: 'mod_vial', name: 'Флакон', rarity: 'rare', description: '+0.5 HP/сек', price: 300, stats: { regen: 0.5 } },
  { id: 'mod_ember', name: 'Уголь', rarity: 'epic', description: '+3 урона от поджога', price: 520, stats: { burn: 3 } },
  { id: 'mod_frost', name: 'Иней', rarity: 'epic', description: '+8% замедления', price: 520, stats: { slow: 0.08 } },
  { id: 'mod_razor', name: 'Лезвие', rarity: 'epic', description: '+16% урона', price: 560, stats: { damage: 1.16 } },
  { id: 'mod_fang', name: 'Клык', rarity: 'legendary', description: '+6% вампиризма и +10 HP', price: 1100, stats: { lifesteal: 0.06, maxHp: 10 } },
  { id: 'mod_telescope', name: 'Телескоп', rarity: 'legendary', description: '+18% дальности', price: 1050, stats: { range: 1.18 } },
  { id: 'mod_hammer', name: 'Молот', rarity: 'legendary', description: '+18% урона, +6% крита', price: 1200, stats: { damage: 1.18, crit: 0.06 } },
  { id: 'mod_vortex', name: 'Вортекс', rarity: 'mythic', description: '+15% радиуса, +15% темпа', price: 2100, stats: { area: 1.15, fireRate: 1.15 } },
  { id: 'mod_immortal', name: 'Бессмертие', rarity: 'mythic', description: '+1.5 HP/сек, +20 HP', price: 2300, stats: { regen: 1.5, maxHp: 20 } },
  { id: 'mod_omega', name: 'Омега-ядро', rarity: 'ultra', description: '+35% урона, +20% крита, +1% вампиризма', price: 4500, stats: { damage: 1.35, crit: 0.2, lifesteal: 0.01 } },
];

export const GAME_MODES: GameModeDef[] = [
  { id: 'classic', name: 'Обычный', description: 'Стандартный забег. Волны каждые 30 секунд.', icon: '◈', spawnMul: 1, hpMul: 1, damageMul: 1, coinMul: 1, bossEvery: 5, biomeMul: 1 },
  { id: 'blitz', name: 'Блиц', description: 'Врагов в 1.6 раза больше, локации сменяются быстрее.', icon: '⏩', spawnMul: 1.6, hpMul: 0.9, damageMul: 1, coinMul: 1.3, bossEvery: 4, biomeMul: 0.7 },
  { id: 'nightmare', name: 'Кошмар', description: 'Враги живучее и больнее. Монеты ×2.', icon: '☠', spawnMul: 1.25, hpMul: 1.8, damageMul: 1.5, coinMul: 2, bossEvery: 5, biomeMul: 1 },
  { id: 'bossrush', name: 'Босс-раш', description: 'Титан каждые 2 волны. Монеты ×1.8.', icon: '♛', spawnMul: 0.8, hpMul: 1.3, damageMul: 1.2, coinMul: 1.8, bossEvery: 2, biomeMul: 1.4 },
  { id: 'pacifist', name: 'Тишина', description: 'Мало врагов, но локации меняются часто. Для спокойной игры.', icon: '☾', spawnMul: 0.6, hpMul: 0.8, damageMul: 0.7, coinMul: 0.8, bossEvery: 8, biomeMul: 0.55 },
  {
    id: 'city', name: 'Город: зачистка',
    description: 'Огромный открытый город. Входи в любое здание, разбивай хлам, ищи сундуки и противоядия.',
    icon: '▦', spawnMul: 1.15, hpMul: 1.1, damageMul: 1.05, coinMul: 1.7,
    bossEvery: 6, biomeMul: 3, timeLimit: 1800, city: true,
  },
  {
    id: 'openworld', name: 'Открытый мир',
    description: 'Огромная карта с лесами, болотами, руинами, снегом и дорогами. Биомы сменяются по мере пути, а не по таймеру.',
    icon: '✦', spawnMul: 1.1, hpMul: 1.15, damageMul: 1.1, coinMul: 1.6,
    bossEvery: 6, biomeMul: 6, timeLimit: 3600, openWorld: true,
  },
];

export const getSkin = (id: string | null): SkinDef | null => SKINS.find((s) => s.id === id) ?? null;
export const getModule = (id: string): ModuleDef | undefined => MODULES.find((m) => m.id === id);
export const getMode = (id: string): GameModeDef => GAME_MODES.find((m) => m.id === id) ?? GAME_MODES[0];

export function rollCase(
  unlockedWeapons: string[],
  ownedSkins: string[],
  ownedModules: string[],
  forcedRarity?: RarityId,
): CaseReward {
  const rarity = forcedRarity ?? rollRarity();
  const pool: CaseReward[] = [];
  for (const weapon of lockedWeapons(unlockedWeapons)) {
    if (rarityOfWeapon(weapon.id) === rarity) {
      pool.push({ kind: 'weapon', id: weapon.id, name: weapon.name, rarity });
    }
  }
  for (const skin of SKINS) {
    if (skin.rarity === rarity && !ownedSkins.includes(skin.id)) {
      pool.push({ kind: 'skin', id: skin.id, name: skin.name, rarity });
    }
  }
  for (const module of MODULES) {
    if (module.rarity === rarity && !ownedModules.includes(module.id)) {
      pool.push({ kind: 'module', id: module.id, name: module.name, rarity });
    }
  }
  if (pool.length === 0) {
    const coins = Math.max(60, Math.round(120 * RARITIES[rarity].priceMul));
    return { kind: 'coins', id: 'coins', amount: coins, name: `${coins} монет`, rarity };
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Кейс классов: шанс редкого персонажа, ультрамифический вампир — 0,01%. */
export function rollClassCase(unlockedClasses: ClassId[]): CaseReward {
  const pool = CLASSES.filter((cls) => cls.unlock === 'case' && !unlockedClasses.includes(cls.id));
  if (pool.length === 0) {
    return { kind: 'coins', id: 'coins', amount: CLASS_CASE_PRICE, name: `${CLASS_CASE_PRICE} монет`, rarity: 'legendary' };
  }
  const rarity = rollRarity();
  const exact = pool.filter((cls) => cls.rarity === rarity);
  const candidates = exact.length > 0 ? exact : pool;
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    kind: 'class',
    id: chosen.id,
    name: chosen.elite ? `${chosen.name} • МЕГА-ЛЕГЕНДА` : chosen.name,
    rarity: chosen.rarity,
  };
}

export const CASE_PRICE = 150;
export const CLASS_CASE_PRICE = 600;
export const MAX_MODULES = 3;

/**
 * Алмазы — премиальная валюта. Пока их можно получить только обменом монет;
 * после публикации в Яндекс Играх будет добавлен донат. Обратный обмен отключён.
 */
export const DIAMOND_PACKAGES: DiamondPackage[] = [
  { id: 'd1', coins: 150, diamonds: 1 },
  { id: 'd5', coins: 700, diamonds: 5 },
  { id: 'd12', coins: 1500, diamonds: 12 },
  { id: 'd30', coins: 3500, diamonds: 30 },
];
export const DIAMOND_CASE_PRICE = 1;
export const DIAMOND_CLASS_CASE_PRICE = 3;
export const PREMIUM_CASE_PRICE = 6;

/** Премиальный кейс гарантирует эпический предмет или лучше; ультра остаётся 0,01%. */
export function rollPremiumCase(
  unlockedWeapons: string[],
  ownedSkins: string[],
  ownedModules: string[],
): CaseReward {
  const roll = Math.random() * 100;
  const rarity: RarityId = roll < 0.01 ? 'ultra' : roll < 1 ? 'mythic' : roll < 5 ? 'legendary' : 'epic';
  return rollCase(unlockedWeapons, ownedSkins, ownedModules, rarity);
}
