import { GENERATED_COMPOSER_EMOJI_GROUPS } from "./composer-emoji-data.generated";

export interface ComposerEmojiEntry {
  emoji: string;
  name: string;
  groupId: string;
  groupLabel: string;
  subgroupId: string;
  subgroupLabel: string;
  searchText: string;
}

export interface ComposerEmojiSubgroup {
  id: string;
  label: string;
  items: readonly ComposerEmojiEntry[];
}

export interface ComposerEmojiGroup {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  subgroups: readonly ComposerEmojiSubgroup[];
}

export const COMPOSER_RECENT_EMOJI_STORAGE_KEY = "seclettr.composer.recent-emoji.v1";
const COMPOSER_RECENT_EMOJI_LIMIT = 12;
export const COMPOSER_EMOJI_TOGGLE_GLYPH = "\u{1F60A}";

const SEARCH_TOKEN_ALIASES: Record<string, readonly string[]> = {
  activities: ["активности", "занятия"],
  activity: ["активность", "занятие"],
  animal: ["животное"],
  animals: ["животные"],
  arrow: ["стрелка"],
  arrows: ["стрелки"],
  baby: ["ребенок", "малыш"],
  bird: ["птица"],
  black: ["черный"],
  blue: ["синий", "голубой"],
  body: ["тело", "жесты"],
  book: ["книга"],
  books: ["книги"],
  boy: ["мальчик"],
  brown: ["коричневый"],
  camera: ["камера"],
  car: ["машина", "авто"],
  cat: ["кот", "кошка"],
  city: ["город"],
  clock: ["часы", "время"],
  cloud: ["облако"],
  computer: ["компьютер"],
  cry: ["плач", "слезы"],
  crying: ["плачет", "слезы"],
  dark: ["темный"],
  dog: ["собака", "пес"],
  drink: ["напиток"],
  face: ["лицо", "смайл", "эмодзи"],
  family: ["семья"],
  fire: ["огонь"],
  flag: ["флаг"],
  flags: ["флаги"],
  flower: ["цветок"],
  food: ["еда"],
  fruit: ["фрукт"],
  game: ["игра"],
  games: ["игры"],
  gesture: ["жест"],
  girl: ["девочка"],
  gray: ["серый"],
  green: ["зеленый"],
  grey: ["серый"],
  grin: ["улыбка", "смайл"],
  grinning: ["улыбка", "смайл"],
  hand: ["рука", "ладонь"],
  hands: ["руки", "ладони"],
  happy: ["радость", "счастье"],
  heart: ["сердце"],
  hearts: ["сердца", "сердце"],
  home: ["дом"],
  house: ["дом"],
  hug: ["объятие"],
  hugging: ["объятие"],
  kiss: ["поцелуй"],
  kissing: ["поцелуй"],
  laugh: ["смех"],
  laughing: ["смех"],
  light: ["светлый"],
  love: ["любовь"],
  man: ["мужчина", "парень"],
  men: ["мужчины"],
  money: ["деньги"],
  moon: ["луна"],
  music: ["музыка"],
  nature: ["природа"],
  object: ["предмет", "объект"],
  objects: ["предметы", "объекты"],
  orange: ["оранжевый"],
  people: ["люди"],
  person: ["человек", "персона"],
  phone: ["телефон"],
  pink: ["розовый"],
  place: ["место"],
  places: ["места"],
  plant: ["растение"],
  prayer: ["молитва"],
  purple: ["фиолетовый"],
  red: ["красный"],
  road: ["дорога"],
  sad: ["грусть", "грустный"],
  screen: ["экран"],
  sign: ["знак"],
  signs: ["знаки"],
  sky: ["небо"],
  skin: ["кожа"],
  smile: ["улыбка", "смайл"],
  smiling: ["улыбка", "улыбается"],
  sport: ["спорт"],
  sports: ["спорт"],
  star: ["звезда"],
  sun: ["солнце"],
  symbol: ["символ"],
  symbols: ["символы"],
  tone: ["тон"],
  travel: ["путешествие"],
  tree: ["дерево"],
  vehicle: ["транспорт"],
  video: ["видео"],
  warning: ["предупреждение"],
  water: ["вода"],
  weather: ["погода"],
  white: ["белый"],
  woman: ["женщина", "девушка"],
  women: ["женщины"],
  yellow: ["желтый"],
};

const GROUP_SEARCH_ALIASES: Record<string, readonly string[]> = {
  "smileys-and-emotion": ["эмодзи", "смайлы", "улыбки", "эмоции", "лица"],
  "people-and-body": ["люди", "персоны", "жесты", "тело", "руки"],
  "animals-and-nature": ["животные", "природа", "растения"],
  "food-and-drink": ["еда", "напитки", "кухня"],
  "travel-and-places": ["путешествия", "транспорт", "места"],
  activities: ["активности", "игры", "спорт", "праздники"],
  objects: ["предметы", "объекты", "вещи"],
  symbols: ["символы", "знаки"],
  flags: ["флаги", "страны", "регионы"],
};

const SUBGROUP_SEARCH_ALIASES: Record<string, readonly string[]> = {
  "face-smiling": ["улыбки", "смех", "радость"],
  "face-affection": ["любовь", "романтика", "сердца"],
  "face-tongue": ["язык", "кривляется"],
  "face-hand": ["жесты", "лицо"],
  "face-neutral-skeptical": ["нейтральное лицо", "скепсис"],
  "face-sleepy": ["сон", "усталость"],
  "face-unwell": ["болезнь", "нездоровье"],
  "face-hat": ["шляпа", "маска"],
  "face-glasses": ["очки"],
  "face-concerned": ["тревога", "грусть"],
  "face-negative": ["злость", "негатив"],
  "face-costume": ["костюм", "праздник"],
  "cat-face": ["кот", "кошка"],
  emotion: ["эмоции", "чувства"],
  "hand-fingers-open": ["ладонь", "пальцы", "рука"],
  "hand-fingers-partial": ["пальцы", "жесты"],
  "hand-single-finger": ["палец", "жест"],
  "hand-fingers-closed": ["кулак", "пальцы"],
  hands: ["руки", "жесты"],
  "hand-prop": ["рука", "предмет"],
  "body-parts": ["части тела"],
  person: ["люди", "персонажи"],
  "person-gesture": ["жесты", "люди"],
  "person-role": ["профессии", "работа"],
  "person-fantasy": ["фэнтези", "персонажи"],
  "person-activity": ["активности", "занятия"],
  "person-sport": ["спорт"],
  "person-resting": ["отдых"],
  family: ["семья"],
  "person-symbol": ["человек", "символ"],
  "animal-mammal": ["млекопитающие", "животные"],
  "animal-bird": ["птицы"],
  "animal-amphibian": ["амфибии"],
  "animal-reptile": ["рептилии"],
  "animal-marine": ["морские животные", "океан"],
  "animal-bug": ["насекомые"],
  "plant-flower": ["цветы", "растения"],
  "plant-other": ["растения", "природа"],
  "food-fruit": ["фрукты"],
  "food-vegetable": ["овощи"],
  "food-prepared": ["готовая еда", "блюда"],
  "food-asian": ["азиатская еда"],
  "food-marine": ["морепродукты"],
  "food-sweet": ["сладости", "десерт"],
  drink: ["напитки"],
  dishware: ["посуда"],
  "place-map": ["карта", "место"],
  "place-geographic": ["география", "природа"],
  "place-building": ["здания", "дом"],
  "place-religious": ["религия", "храм"],
  "place-other": ["места"],
  "transport-ground": ["наземный транспорт", "машины"],
  "transport-water": ["водный транспорт"],
  "transport-air": ["воздушный транспорт", "самолет"],
  hotel: ["отель"],
  time: ["время", "часы"],
  "sky-weather": ["погода", "небо"],
  event: ["события", "праздник"],
  "award-medal": ["награды", "медали"],
  sport: ["спорт"],
  game: ["игры"],
  "arts-crafts": ["искусство", "творчество"],
  clothing: ["одежда"],
  sound: ["звук"],
  music: ["музыка"],
  "musical-instrument": ["музыкальные инструменты"],
  phone: ["телефон", "связь"],
  computer: ["компьютер", "техника"],
  "light-video": ["свет", "видео"],
  "book-paper": ["книги", "бумага"],
  money: ["деньги"],
  mail: ["почта"],
  office: ["офис", "работа"],
  lock: ["замок", "безопасность"],
  tool: ["инструменты"],
  science: ["наука"],
  medical: ["медицина"],
  household: ["дом", "быт"],
  "other-object": ["предметы"],
  "transport-sign": ["транспортные знаки"],
  warning: ["предупреждение"],
  arrow: ["стрелки"],
  religion: ["религия"],
  zodiac: ["зодиак"],
  "av-symbol": ["аудио", "видео", "символы"],
  gender: ["пол"],
  math: ["математика"],
  punctuation: ["пунктуация"],
  currency: ["валюта", "деньги"],
  "other-symbol": ["символы"],
  keycap: ["кнопки", "цифры"],
  alphanum: ["буквы", "цифры"],
  geometric: ["геометрия", "фигуры"],
  flag: ["флаги"],
  "country-flag": ["страны", "флаги"],
  "subdivision-flag": ["регионы", "флаги"],
};

const GROUP_LABEL_KEYS: Record<string, string> = {
  "smileys-and-emotion": "composer.emojiGroup.smileysEmotion",
  "people-and-body": "composer.emojiGroup.peopleBody",
  "animals-and-nature": "composer.emojiGroup.animalsNature",
  "food-and-drink": "composer.emojiGroup.foodDrink",
  "travel-and-places": "composer.emojiGroup.travelPlaces",
  activities: "composer.emojiGroup.activities",
  objects: "composer.emojiGroup.objects",
  symbols: "composer.emojiGroup.symbols",
  flags: "composer.emojiGroup.flags",
};

export const COMPOSER_EMOJI_GROUPS: readonly ComposerEmojiGroup[] = GENERATED_COMPOSER_EMOJI_GROUPS.map((group) => ({
  id: group.id,
  labelKey: GROUP_LABEL_KEYS[group.id] ?? "composer.emojiGroup.unknown",
  fallbackLabel: group.label,
  subgroups: group.subgroups.map((subgroup) => ({
    id: subgroup.id,
    label: subgroup.label,
    items: subgroup.items.map(([emoji, name]) => ({
      emoji,
      name,
      groupId: group.id,
      groupLabel: group.label,
      subgroupId: subgroup.id,
      subgroupLabel: subgroup.label,
      searchText: buildComposerEmojiSearchText({
        name,
        groupId: group.id,
        groupLabel: group.label,
        subgroupId: subgroup.id,
        subgroupLabel: subgroup.label,
      }),
    })),
  })),
}));

export const DEFAULT_COMPOSER_EMOJI_GROUP_ID = COMPOSER_EMOJI_GROUPS[0]?.id ?? "";

const COMPOSER_ALL_EMOJIS = COMPOSER_EMOJI_GROUPS.flatMap((group) => (
  group.subgroups.flatMap((subgroup) => subgroup.items)
));

const COMPOSER_EMOJI_LOOKUP = new Map(
  COMPOSER_ALL_EMOJIS.map((item) => [item.emoji, item] as const)
);

function normalizeComposerEmojiSearch(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll("ё", "е")
    .replaceAll("&", " ")
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function addNormalizedAliases(target: Set<string>, aliases: readonly string[] | undefined) {
  if (!aliases) return;
  for (const alias of aliases) {
    const normalizedAlias = normalizeComposerEmojiSearch(alias);
    if (normalizedAlias) {
      target.add(normalizedAlias);
    }
  }
}

function addTokenAliases(target: Set<string>, source: string) {
  const tokens = source.match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    addNormalizedAliases(target, SEARCH_TOKEN_ALIASES[token]);
  }
}

function buildComposerEmojiSearchText(input: {
  name: string;
  groupId: string;
  groupLabel: string;
  subgroupId: string;
  subgroupLabel: string;
}): string {
  const searchTerms = new Set<string>();
  const englishSources = [input.name, input.groupLabel, input.subgroupLabel];

  for (const source of englishSources) {
    const normalizedSource = normalizeComposerEmojiSearch(source);
    if (!normalizedSource) continue;
    searchTerms.add(normalizedSource);
    addTokenAliases(searchTerms, normalizedSource);
  }

  addNormalizedAliases(searchTerms, GROUP_SEARCH_ALIASES[input.groupId]);
  addNormalizedAliases(searchTerms, SUBGROUP_SEARCH_ALIASES[input.subgroupId]);

  return Array.from(searchTerms).join(" ");
}

export function getComposerEmojiEntry(emojiValue: string): ComposerEmojiEntry | null {
  return COMPOSER_EMOJI_LOOKUP.get(emojiValue) ?? null;
}

export function filterComposerEmojiEntries(query: string): ComposerEmojiEntry[] {
  const normalizedQuery = normalizeComposerEmojiSearch(query);
  if (!normalizedQuery) return [];

  return COMPOSER_ALL_EMOJIS.filter((item) => {
    if (item.emoji.includes(normalizedQuery)) return true;
    return item.searchText.includes(normalizedQuery);
  });
}

export function loadRecentComposerEmojis(rawValue: string | null): string[] {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    const uniqueItems: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      if (!COMPOSER_EMOJI_LOOKUP.has(item)) continue;
      if (uniqueItems.includes(item)) continue;
      uniqueItems.push(item);
      if (uniqueItems.length >= COMPOSER_RECENT_EMOJI_LIMIT) {
        break;
      }
    }

    return uniqueItems;
  } catch {
    return [];
  }
}

export function recordRecentComposerEmoji(currentItems: readonly string[], emojiValue: string): string[] {
  if (!COMPOSER_EMOJI_LOOKUP.has(emojiValue)) {
    return [...currentItems];
  }

  return [emojiValue, ...currentItems.filter((item) => item !== emojiValue)]
    .slice(0, COMPOSER_RECENT_EMOJI_LIMIT);
}
