<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import aeroIcon from '../assets/kuro/attributes/aero.png';
import electroIcon from '../assets/kuro/attributes/electro.png';
import fusionIcon from '../assets/kuro/attributes/fusion.png';
import glacioIcon from '../assets/kuro/attributes/glacio.png';
import havocIcon from '../assets/kuro/attributes/havoc.png';
import spectroIcon from '../assets/kuro/attributes/spectro.png';
import shellCreditIcon from '../assets/resource-briefing/shell-credit.png';
import HighQualityImage from './HighQualityImage.vue';
import ThemedSelect from './ThemedSelect.vue';
import AppDialog from './AppDialog.vue';

type RecordValue = Record<string, unknown>;
type Kind = 'role' | 'weapon' | 'echo';
type Item = {
  id: number;
  name: string;
  icon: string;
  rarity: number;
  rarities: number[];
  ownedRarities: number[];
  element: string;
  type: string;
  owned: boolean;
  level: number;
  cost: number;
  set: string;
  sets: string[];
  raw: RecordValue;
};
type Config = {
  start: number;
  end: number;
  skills: Array<{ start: number; end: number; enabled: boolean }>;
  advanced: boolean[];
  weaponId: number;
  weaponStart: number;
  weaponEnd: number;
  tune: boolean;
  rarity: number;
};
type Material = { key: string; name: string; icon: string; count: number };
type RoleArtwork = {
  fullBody: string;
  team: string;
  thumbnail?: string;
  cardThumbnail?: string;
  cardResolution?: number;
  order: number;
  wikiEntryId: string;
};

const props = defineProps<{
  accountId: string;
  gameRoleId: string;
  data: RecordValue | null;
  roleData?: RecordValue | null;
  error?: string | null | undefined;
  useCardThumbnail: boolean;
  cardResolution: number;
}>();
const emit = defineEmits<{ notice: [ok: boolean, text: string] }>();

const kind = ref<Kind>('role');
const mode = ref<'catalog' | 'plan'>('catalog');
const selected = reactive<Record<Kind, number[]>>({ role: [], weapon: [], echo: [] });
const configs = reactive<Record<string, Config>>({});
const activeId = ref(0);
const resultTarget = ref('all');
const results = reactive<Record<string, Material[]>>({});
const requiredResults = reactive<Record<string, Material[]>>({});
const syntheticResults = reactive<Record<string, Material[]>>({});
const calculating = ref(false);
const weaponPicker = ref(false);
const echoLoading = ref(false);
const echoItems = ref<Item[]>([]);
const ownership = ref<'all' | 'owned'>('all');
const rarity = ref(0);
const element = ref('');
const itemType = ref('');
const echoSet = ref('');
const echoCost = ref(0);
const search = ref('');
const avatarSize = ref<'small' | 'large'>(
  localStorage.getItem('wwbox.kuroCalculatorAvatarSize') === 'large' ? 'large' : 'small',
);
const ownedDetails = ref<Record<number, RecordValue>>({});
const ownedStatuses = ref<Record<number, RecordValue>>({});
const portraitCache = ref<Record<number, RoleArtwork>>(readPortraitCache());

const roleSource = computed(() => catalogArray(props.data?.roles, ['roleList', 'list']));
const weaponSource = computed(() => catalogArray(props.data?.weapons, ['weaponList', 'list']));
const echoSource = computed(() => catalogArray(props.data?.echoes, ['echoList', 'list']));
const ownedRoleIds = computed(() => {
  const set = new Set<number>();
  for (const value of findArray(props.data?.ownedRoles, 'list')) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) set.add(id);
  }
  walk(
    props.data,
    (record) => {
      const id = numberOf(record, ['roleId', 'roleID']);
      if (id) set.add(id);
    },
    ['ownedRoles'],
  );
  walk(props.roleData, (record) => {
    const id = numberOf(record, ['roleId', 'roleID']);
    if (id) set.add(id);
  });
  return set;
});
const ownedRoleStatus = computed(() => {
  const map = new Map<number, RecordValue>();
  walk(props.data?.ownedRoles, (record) => {
    const id = numberOf(record, ['roleId', 'roleID']);
    if (id && (record.roleLevel !== undefined || Array.isArray(record.skillLevelList)))
      map.set(id, record);
  });
  return map;
});
const ownedWeaponIds = computed(() => {
  const set = new Set<number>();
  const collect = (source: unknown): void =>
    walk(source, (record) => {
      const id = numberOf(record, ['weaponId', 'weaponID']);
      if (id) set.add(id);
    });
  collect(props.data?.ownedRoles);
  collect(props.roleData);
  collect(ownedDetails.value);
  return set;
});
const roles = computed(() => normalize(roleSource.value, 'role', ownedRoleIds.value));
const weaponTypeNames = computed(() => {
  const map = new Map<string, string>();
  for (const raw of roleSource.value) {
    const id = textOf(raw, ['weaponTypeId', 'weaponType'], '');
    const name = textOf(raw, ['weaponTypeName'], '');
    if (id && name) map.set(id, name);
  }
  return map;
});
const weapons = computed(() => normalize(weaponSource.value, 'weapon', ownedWeaponIds.value));
const echoCatalog = computed(() => normalizeEchoCatalog(echoSource.value));
const catalog = computed(() =>
  kind.value === 'role' ? roles.value : kind.value === 'weapon' ? weapons.value : echoItems.value,
);
const filtered = computed(() =>
  catalog.value.filter((item) => {
    if (ownership.value === 'owned' && !item.owned) return false;
    if (
      rarity.value &&
      !(ownership.value === 'owned' ? item.ownedRarities : item.rarities).includes(rarity.value)
    )
      return false;
    if (element.value && item.element !== element.value) return false;
    if (itemType.value && item.type !== itemType.value) return false;
    if (echoSet.value && !item.sets.includes(echoSet.value)) return false;
    if (echoCost.value && item.cost !== echoCost.value) return false;
    return !search.value || item.name.toLowerCase().includes(search.value.toLowerCase());
  }),
);
const displayRarity = (item: Item): number =>
  rarity.value && item.rarities.includes(rarity.value) ? rarity.value : item.rarity;
const configuredRarity = (item: Item): number =>
  kind.value === 'echo'
    ? (configs[keyFor('echo', item.id)]?.rarity ?? displayRarity(item))
    : item.rarity;
const currentItems = computed(
  () =>
    selected[kind.value]
      .map((id) => catalog.value.find((item) => item.id === id))
      .filter(Boolean) as Item[],
);
const activeItem = computed(
  () =>
    currentItems.value.find((item) => item.id === activeId.value) ?? currentItems.value[0] ?? null,
);
const activeConfig = computed(() =>
  activeItem.value ? configFor(kind.value, activeItem.value) : null,
);
const compatibleWeapons = computed(() => {
  const type = activeItem.value?.type;
  return type ? weapons.value.filter((item) => item.type === type) : weapons.value;
});
const levelOptions = computed(() => {
  if (!activeItem.value || !activeConfig.value) return [];
  const max = maxLevel(activeItem.value, activeConfig.value);
  const start = kind.value === 'echo' ? 0 : 1;
  return Array.from({ length: max - start + 1 }, (_, index) => index + start);
});
const optionValues = (
  field: keyof Pick<Item, 'rarity' | 'element' | 'type' | 'set' | 'cost' | 'level'>,
) => [
  ...new Set(
    catalog.value.map((item) => item[field]).filter((value) => value !== '' && value !== 0),
  ),
];
const rarityOptions = computed(() =>
  [...new Set(catalog.value.flatMap((item) => item.rarities))].sort((a, b) => a - b),
);
const echoSetOptions = computed(() => [
  ...new Set(catalog.value.flatMap((item) => item.sets).filter(Boolean)),
]);
const shownMaterials = computed(() => {
  return combinedMaterials(results);
});
const shownRequiredMaterials = computed(() => {
  return combinedMaterials(requiredResults);
});
const shownSyntheticMaterials = computed(() => combinedMaterials(syntheticResults));
function combinedMaterials(source: Record<string, Material[]>): Material[] {
  if (resultTarget.value !== 'all') return source[resultTarget.value] ?? [];
  const map = new Map<string, Material>();
  for (const item of currentItems.value)
    for (const material of source[keyFor(kind.value, item.id)] ?? []) {
      const old = map.get(material.key);
      map.set(material.key, old ? { ...old, count: old.count + material.count } : { ...material });
    }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

watch(kind, async (value) => {
  resetFilters();
  mode.value = 'catalog';
  if (value === 'echo' && !echoItems.value.length) await loadEchoes();
});
watch(avatarSize, (value) => localStorage.setItem('wwbox.kuroCalculatorAvatarSize', value));
onMounted(loadOwnedDetails);
watch(() => [props.useCardThumbnail, props.cardResolution], loadOwnedDetails);
watch(rarity, (value) => {
  if (kind.value !== 'echo' || !value) return;
  for (const id of selected.echo) {
    const item = echoItems.value.find((entry) => entry.id === id);
    if (!item?.rarities.includes(value)) continue;
    const config = configFor('echo', item);
    config.rarity = value;
    clampConfigLevels(item, config);
  }
});

const ATTRIBUTE_NAMES: Record<number, string> = {
  1: '冷凝',
  2: '热熔',
  3: '导电',
  4: '气动',
  5: '衍射',
  6: '湮灭',
};
const WEAPON_TYPE_NAMES: Record<number, string> = {
  1: '长刃',
  2: '迅刀',
  3: '佩枪',
  4: '臂铠',
  5: '音感仪',
};

function normalize(list: RecordValue[], itemKind: Kind, owned: Set<number>): Item[] {
  const map = new Map<number, Item>();
  for (const raw of list) {
    const id = numberOf(raw, itemKind === 'role' ? ['roleId', 'id'] : ['weaponId', 'id']);
    if (!id || map.has(id)) continue;
    map.set(id, {
      id,
      name: textOf(
        raw,
        itemKind === 'role' ? ['roleName', 'name'] : ['weaponName', 'name'],
        `${itemKind === 'role' ? '角色' : '武器'} ${id}`,
      ),
      icon: imageOf(raw),
      rarity: numberOf(raw, ['quality', 'rarity', 'starLevel', 'weaponStarLevel', 'star']) || 5,
      rarities: [numberOf(raw, ['quality', 'rarity', 'starLevel', 'weaponStarLevel', 'star']) || 5],
      ownedRarities: owned.has(id)
        ? [numberOf(raw, ['quality', 'rarity', 'starLevel', 'weaponStarLevel', 'star']) || 5]
        : [],
      element: attributeNameOf(raw),
      type:
        itemKind === 'weapon'
          ? (weaponTypeNames.value.get(textOf(raw, ['weaponType'], '')) ??
              textOf(raw, ['weaponTypeName', 'typeName'], '')) ||
            WEAPON_TYPE_NAMES[numberOf(raw, ['weaponType', 'weaponTypeId'])] ||
            ''
          : textOf(raw, ['weaponTypeName'], ''),
      owned: owned.has(id),
      level: numberOf(raw, ['level', 'roleLevel', 'weaponLevel']),
      cost: 0,
      set: '',
      sets: [],
      raw,
    });
  }
  return [...map.values()].sort((left, right) => {
    const leftOrder = numberOf(left.raw, ['priority', 'sort', 'order', 'onlineTime', 'createTime']);
    const rightOrder = numberOf(right.raw, [
      'priority',
      'sort',
      'order',
      'onlineTime',
      'createTime',
    ]);
    return rightOrder - leftOrder || right.id - left.id;
  });
}

function normalizeEchoCatalog(list: RecordValue[]): Item[] {
  return list.flatMap((raw) => {
    const id = numberOf(raw, ['id', 'phantomPropId']);
    if (!id) return [];
    const rarities = arrayNumbers(raw.rarities);
    const sets = arrayStrings(raw.setNames);
    return [
      {
        id,
        name: textOf(raw, ['name', 'phantomName'], `声骸 ${id}`),
        icon: imageOf(raw),
        rarity: rarities.length ? Math.max(...rarities) : 0,
        rarities,
        ownedRarities: [],
        element: '',
        type: textOf(raw, ['levelName', 'typeName'], ''),
        owned: false,
        level: 0,
        cost: numberOf(raw, ['cost']),
        set: sets[0] ?? '',
        sets,
        raw,
      },
    ];
  });
}

async function toggle(item: Item): Promise<void> {
  const ids = selected[kind.value];
  const index = ids.indexOf(item.id);
  if (index >= 0) ids.splice(index, 1);
  else ids.push(item.id);
  prepareConfig(kind.value, item);
  if (item.owned && kind.value === 'role') await ensureOwnedDetail(item);
}
async function direct(item: Item): Promise<void> {
  selected[kind.value] = [item.id];
  prepareConfig(kind.value, item);
  if (item.owned && kind.value === 'role') await ensureOwnedDetail(item);
  openPlan(item.id);
}
function openPlan(id = selected[kind.value][0] ?? 0): void {
  if (!id) return;
  activeId.value = id;
  resultTarget.value = 'all';
  mode.value = 'plan';
}
function remove(id: number): void {
  const ids = selected[kind.value];
  ids.splice(ids.indexOf(id), 1);
  if (activeId.value === id) activeId.value = ids[0] ?? 0;
  if (!ids.length) mode.value = 'catalog';
}
function configFor(itemKind: Kind, item: Item): Config {
  const key = keyFor(itemKind, item.id);
  const initialRarity =
    itemKind === 'echo' && rarity.value && item.rarities.includes(rarity.value)
      ? rarity.value
      : item.rarity || 5;
  const initialMax =
    itemKind === 'weapon'
      ? item.rarity <= 2
        ? 70
        : 90
      : itemKind === 'echo'
        ? echoMaxLevel(initialRarity)
        : 90;
  const ownedDetail = itemKind === 'role' ? ownedDetails.value[item.id] : undefined;
  const ownedStatus =
    itemKind === 'role'
      ? (ownedStatuses.value[item.id] ?? ownedRoleStatus.value.get(item.id))
      : undefined;
  const ownedRole = ownedDetail ? nestedRecord(ownedDetail, 'role') : {};
  const ownedLevel =
    numberOf(ownedStatus ?? {}, ['roleLevel', 'level']) ||
    (ownedDetail
      ? numberOf(ownedDetail, ['level', 'roleLevel']) || numberOf(ownedRole, ['level', 'roleLevel'])
      : item.level);
  const learnedSkills = ownedStatus
    ? calculatorSkillList(ownedStatus)
    : ownedDetail
      ? ownedSkillList(ownedDetail)
      : [];
  const equipped = ownedDetail ? nestedRecord(ownedDetail, 'weaponData') : {};
  const equippedWeapon = nestedRecord(equipped, 'weapon');
  const equippedWeaponId =
    numberOf(equippedWeapon, ['weaponId', 'id']) || numberOf(equipped, ['weaponId']);
  const equippedWeaponLevel = numberOf(equipped, ['level', 'weaponLevel']) || 1;
  return (configs[key] ??= {
    start:
      itemKind === 'echo'
        ? Math.max(0, item.level)
        : Math.max(1, itemKind === 'role' && item.owned ? ownedLevel : item.level || 1),
    end: initialMax,
    skills: Array.from({ length: 5 }, (_, index) => {
      const skill = learnedSkills[index] ?? {};
      const current =
        numberOf(skill, ['level', 'skillLevel']) ||
        numberOf(nestedRecord(skill, 'skill'), ['level', 'skillLevel']) ||
        1;
      return { start: current, end: 10, enabled: current < 10 };
    }),
    advanced: Array.from({ length: 10 }, (_, index) => {
      if (!item.owned) return true;
      const learned = arrayStrings(ownedStatus?.skillBreakList);
      const location = advanceLocations(item.raw)[index];
      return location ? !learned.includes(location) : false;
    }),
    weaponId: equippedWeaponId,
    weaponStart: equippedWeaponLevel,
    weaponEnd: equippedWeaponId
      ? (weapons.value.find((entry) => entry.id === equippedWeaponId)?.rarity ?? 5) <= 2
        ? 70
        : 90
      : 90,
    tune: true,
    rarity: initialRarity,
  });
}
async function loadOwnedDetails(): Promise<void> {
  const wikiRoles = roles.value
    .map((item) => ({ id: item.id, name: item.name, icon: item.icon, element: item.element }))
    .slice(0, 100);
  try {
    portraitCache.value = {
      ...portraitCache.value,
      ...(await window.wwbox.kuro.roleArtworks(wikiRoles, {
        useCardThumbnail: props.useCardThumbnail,
        cardResolution: props.cardResolution,
      })),
    };
  } catch {
    // Cached and account-provided portraits remain available offline.
  }
  localStorage.setItem('wwbox.kuroCalculatorArtworks', JSON.stringify(portraitCache.value));
}

const ownedDetailRequests = new Map<number, Promise<RecordValue | null>>();
async function ensureOwnedDetail(item: Item): Promise<RecordValue | null> {
  if (!item.owned) return null;
  const cached = ownedDetails.value[item.id];
  const cachedStatus = ownedStatuses.value[item.id] ?? ownedRoleStatus.value.get(item.id);
  if (cached && cachedStatus) {
    applyOwnedDefaults(configFor('role', item), item, cached, cachedStatus);
    return cached;
  }
  const pending = ownedDetailRequests.get(item.id);
  if (pending) return pending;
  const request = Promise.allSettled([
    window.wwbox.kuro.roleCultivateStatus(props.accountId, props.gameRoleId, item.id),
    cached
      ? Promise.resolve(cached)
      : window.wwbox.kuro.roleDetail(props.accountId, props.gameRoleId, item.id),
  ])
    .then(([statusResult, detailResult]) => {
      const status = statusResult.status === 'fulfilled' ? statusResult.value : undefined;
      const detail = detailResult.status === 'fulfilled' ? detailResult.value : {};
      if (status) ownedStatuses.value = { ...ownedStatuses.value, [item.id]: status };
      if (detailResult.status === 'fulfilled')
        ownedDetails.value = { ...ownedDetails.value, [item.id]: detail };
      applyOwnedDefaults(configFor('role', item), item, detail, status);
      if (statusResult.status === 'rejected') {
        const message =
          statusResult.reason instanceof Error
            ? statusResult.reason.message
            : String(statusResult.reason);
        emit(
          'notice',
          false,
          /验证|captcha|安全校验|人机/.test(message)
            ? '角色养成状态需要安全验证，请打开“手机视图”的“养成计算”完成验证后再试'
            : `${item.name} 的等级与装备已读取，但技能与其他技能状态读取失败：${message}`,
        );
      }
      if (detailResult.status === 'rejected') {
        emit(
          'notice',
          false,
          `已读取 ${item.name} 的等级与技能，但装备武器读取失败：${
            detailResult.reason instanceof Error
              ? detailResult.reason.message
              : String(detailResult.reason)
          }`,
        );
      }
      return detailResult.status === 'fulfilled' ? detail : null;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      emit(
        'notice',
        false,
        /验证|captcha|安全校验|人机/.test(message)
          ? '角色数据需要安全验证，请打开“手机视图”的“数据终端”手动完成验证后再试'
          : `无法读取 ${item.name} 的角色详情：${message}`,
      );
      return null;
    })
    .finally(() => ownedDetailRequests.delete(item.id));
  ownedDetailRequests.set(item.id, request);
  return request;
}

function ownedSkillList(detail: RecordValue): RecordValue[] {
  const direct = arrayFrom(detail, ['skillList', 'skills']);
  if (direct.length >= 5) return direct.slice(0, 5);
  let found: RecordValue[] = [];
  walk(detail, (record) => {
    if (found.length) return;
    for (const key of ['skillList', 'skills']) {
      const value = record[key];
      if (Array.isArray(value) && value.length >= 5 && value.every(isRecord)) {
        found = value.slice(0, 5) as RecordValue[];
        return;
      }
    }
  });
  return found;
}

function calculatorSkillList(status: RecordValue): RecordValue[] {
  const source = arrayFrom(status, ['skillLevelList']);
  const order = [0, 1, 4, 2, 3];
  return order.map((index) => source[index] ?? {});
}

function applyOwnedDefaults(
  config: Config,
  item: Item,
  detail: RecordValue,
  status?: RecordValue,
): void {
  const ownedRole = nestedRecord(detail, 'role');
  config.start = Math.max(
    1,
    numberOf(status ?? {}, ['roleLevel', 'level']) ||
      numberOf(detail, ['level', 'roleLevel']) ||
      numberOf(ownedRole, ['level', 'roleLevel']) ||
      item.level ||
      1,
  );
  const learnedSkills = status ? calculatorSkillList(status) : ownedSkillList(detail);
  config.skills.forEach((skill, index) => {
    const source = learnedSkills[index] ?? {};
    const current =
      numberOf(source, ['level', 'skillLevel']) ||
      numberOf(nestedRecord(source, 'skill'), ['level', 'skillLevel']) ||
      1;
    skill.start = current;
    skill.enabled = current < skill.end;
  });
  if (status) {
    const learned = arrayStrings(status.skillBreakList);
    const locations = advanceLocations(item.raw);
    config.advanced = config.advanced.map((_, index) => {
      const location = locations[index];
      return Boolean(location && !learned.includes(location));
    });
  }
  const equipped = nestedRecord(detail, 'weaponData');
  const equippedWeapon = nestedRecord(equipped, 'weapon');
  const weaponId = numberOf(equippedWeapon, ['weaponId', 'id']) || numberOf(equipped, ['weaponId']);
  if (weaponId) {
    config.weaponId = weaponId;
    config.weaponStart = numberOf(equipped, ['level', 'weaponLevel']) || 1;
    const weapon = weapons.value.find((entry) => entry.id === weaponId);
    config.weaponEnd = (weapon?.rarity ?? 5) <= 2 ? 70 : 90;
  }
}
function prepareConfig(itemKind: Kind, item: Item): Config {
  const config = configFor(itemKind, item);
  if (itemKind === 'echo' && rarity.value && item.rarities.includes(rarity.value)) {
    config.rarity = rarity.value;
    clampConfigLevels(item, config);
  }
  return config;
}
function keyFor(itemKind: Kind, id: number): string {
  return `${itemKind}:${id}`;
}
function selectWeapon(item: Item): void {
  if (!activeConfig.value) return;
  activeConfig.value.weaponId = item.id;
  const max = item.rarity <= 2 ? 70 : 90;
  activeConfig.value.weaponStart = Math.min(activeConfig.value.weaponStart || 1, max);
  activeConfig.value.weaponEnd = Math.min(activeConfig.value.weaponEnd || max, max);
  weaponPicker.value = false;
}
function selectedWeapon(config: Config): Item | undefined {
  return weapons.value.find((item) => item.id === config.weaponId);
}
function setAllAdvanced(value: boolean): void {
  if (activeConfig.value) activeConfig.value.advanced.fill(value);
}
function applyEchoToAll(): void {
  if (!activeConfig.value) return;
  for (const item of currentItems.value)
    Object.assign(configFor('echo', item), {
      start: activeConfig.value.start,
      end: activeConfig.value.end,
      tune: activeConfig.value.tune,
      rarity: activeConfig.value.rarity,
    });
}

async function calculate(): Promise<void> {
  calculating.value = true;
  try {
    for (const item of currentItems.value) {
      const config = configFor(kind.value, item);
      if (config.end < config.start) throw new Error(`${item.name} 的目标等级不能小于当前等级`);
      if (kind.value === 'echo') {
        const materials = echoMaterials(config);
        results[keyFor(kind.value, item.id)] = materials;
        requiredResults[keyFor(kind.value, item.id)] = materials;
        syntheticResults[keyFor(kind.value, item.id)] = echoSyntheticMaterials(config, materials);
      } else {
        const raw = await window.wwbox.kuro.calculate({
          accountId: props.accountId,
          roleId: props.gameRoleId,
          kind: kind.value,
          itemId: item.id,
          startLevel: config.start,
          endLevel: config.end,
          ...(kind.value === 'role'
            ? {
                skillLevelUpList: config.skills.map((skill) => ({
                  startLevel: skill.start,
                  endLevel: skill.end,
                  enabled: skill.enabled,
                })),
                advanceSkillList: config.advanced.flatMap((enabled, index) => {
                  const location = advanceLocations(item.raw)[index];
                  return enabled && location ? [location] : [];
                }),
                weapon: config.weaponId
                  ? {
                      itemId: config.weaponId,
                      startLevel: config.weaponStart,
                      endLevel: config.weaponEnd,
                    }
                  : null,
              }
            : {}),
        });
        results[keyFor(kind.value, item.id)] = extractMaterials(raw, 'missingCost');
        requiredResults[keyFor(kind.value, item.id)] = extractMaterials(raw, 'allCost');
        syntheticResults[keyFor(kind.value, item.id)] = extractMaterials(raw, 'synthetic');
      }
    }
    emit('notice', true, `已完成 ${currentItems.value.length} 项养成计算`);
  } catch (error) {
    emit('notice', false, error instanceof Error ? error.message : String(error));
  } finally {
    calculating.value = false;
  }
}

async function loadEchoes(): Promise<void> {
  echoLoading.value = true;
  try {
    const records: RecordValue[] = [];
    // roleData already contains the account's equipped Echoes. Re-requesting
    // every character detail here is redundant and was the main captcha trigger.
    walk(props.roleData, (record) => {
      if (numberOf(nestedRecord(record, 'phantomProp'), ['phantomId', 'phantomPropId', 'id']))
        records.push(record);
    });
    const ownedMap = new Map<number, Item>();
    for (const raw of records) {
      const phantom = nestedRecord(raw, 'phantomProp');
      const fetter = nestedRecord(raw, 'fetterDetail');
      const id = numberOf(phantom, ['phantomPropId', 'phantomId', 'id']);
      if (!id) continue;
      const quality = numberOf(raw, ['quality', 'rarity', 'star']) || 5;
      const existing = ownedMap.get(id);
      if (existing) {
        if (!existing.ownedRarities.includes(quality)) existing.ownedRarities.push(quality);
        continue;
      }
      const setName = textOf(fetter, ['name', 'fetterName', 'setName', 'groupName'], '未识别套装');
      ownedMap.set(id, {
        id,
        name: textOf(phantom, ['phantomName', 'name'], `声骸 ${id}`),
        icon: imageOf(phantom),
        rarity: quality,
        rarities: [quality],
        ownedRarities: [quality],
        element: '',
        type: textOf(raw, ['phantomTypeName', 'className', 'typeName'], ''),
        owned: true,
        level: numberOf(raw, ['level', 'phantomLevel']),
        cost: numberOf(raw, ['cost', 'phantomCost']),
        set: setName,
        sets: [setName],
        raw,
      });
    }
    const map = new Map(echoCatalog.value.map((item) => [item.id, { ...item }]));
    for (const [id, owned] of ownedMap) {
      const catalogItem = map.get(id);
      map.set(
        id,
        catalogItem
          ? {
              ...catalogItem,
              owned: true,
              ownedRarities: owned.ownedRarities,
              level: owned.level,
              raw: owned.raw,
            }
          : owned,
      );
    }
    echoItems.value = [...map.values()];
    if (!echoItems.value.length) emit('notice', false, '账号当前未返回可用于计算的已装备声骸');
  } finally {
    echoLoading.value = false;
  }
}

function echoMaterials(config: Config): Material[] {
  const xpAt = [
    0, 440, 1320, 2860, 5060, 8360, 12760, 18260, 24860, 32560, 41360, 51260, 62260, 74360, 87560,
    101860, 117260, 133760, 151360, 170060, 189860, 210760, 232760, 255860, 280060, 305360,
  ];
  const xp = Math.max(0, xpAt[config.end]! - xpAt[config.start]!);
  const materials: Material[] = [
    { key: 'shell-credit', name: '贝币', icon: shellCreditIcon, count: xp },
    {
      key: 'premium-sealed-tube',
      name: '特级密音筒',
      icon: 'https://mc.appfeng.com/ui/item/T_IconA_13_UI.png',
      count: Math.ceil(xp / 5000),
    },
  ];
  if (config.tune) {
    const tuner = echoTuner(config.rarity);
    materials.push({
      key: `${config.rarity}-star-tuner`,
      name: tuner.name,
      icon: tuner.icon,
      count: Math.max(0, Math.floor(config.end / 5) - Math.floor(config.start / 5)) * 10,
    });
  }
  return materials;
}
function echoTuner(value: number): { name: string; icon: string } {
  if (value <= 2)
    return {
      name: '初级调谐器',
      icon: 'https://mc.appfeng.com/ui/item/T_IconA_txq_01_UI.png',
    };
  if (value === 3)
    return {
      name: '中级调谐器',
      icon: 'https://mc.appfeng.com/ui/item/T_IconA_txq_01_UI.png',
    };
  if (value === 4)
    return {
      name: '高级调谐器',
      icon: 'https://mc.appfeng.com/ui/item/T_IconA_txq_02_UI.png',
    };
  return {
    name: '特级调谐器',
    icon: 'https://mc.appfeng.com/ui/item/T_IconA_txq_03_UI.png',
  };
}
function echoSyntheticMaterials(config: Config, materials: Material[]): Material[] {
  const tube = materials.find((item) => item.key === 'premium-sealed-tube');
  const values: Material[] = tube?.count
    ? [
        {
          key: 'advanced-sealed-tube-synthetic',
          name: '高级密音筒',
          icon: 'https://mc.appfeng.com/ui/item/T_IconA_12_UI.png',
          count: tube.count * 3,
        },
      ]
    : [];
  const tuner = materials.find((item) => item.key === `${config.rarity}-star-tuner`);
  if (tuner?.count && config.rarity > 2) {
    const lower = echoTuner(config.rarity - 1);
    values.push({
      key: `${config.rarity - 1}-star-tuner-synthetic`,
      name: lower.name,
      icon: lower.icon,
      count: tuner.count * 3,
    });
  }
  return values;
}
function extractMaterials(value: unknown, preferredKey: string): Material[] {
  const map = new Map<string, Material>();
  const preferred = findArray(value, preferredKey);
  const source = hasArrayKey(value, preferredKey) ? preferred : value;
  walk(source, (record) => {
    const name = textOf(record, ['goodsName', 'itemName', 'materialName', 'name'], '');
    const count = numberOf(record, ['needNum', 'needCount', 'count', 'num', 'value']);
    if (!name || count <= 0) return;
    const id = textOf(record, ['goodsId', 'itemId', 'materialId', 'id'], name);
    const key = String(id);
    const old = map.get(key);
    map.set(
      key,
      old ? { ...old, count: old.count + count } : { key, name, icon: imageOf(record), count },
    );
  });
  return [...map.values()];
}
function hasArrayKey(value: unknown, key: string): boolean {
  let found = false;
  walk(value, (record) => {
    if (Array.isArray(record[key])) found = true;
  });
  return found;
}
function findArray(value: unknown, key: string): unknown[] {
  let result: unknown[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node) || result.length) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    const record = node as RecordValue;
    if (Array.isArray(record[key])) {
      result = record[key] as unknown[];
      return;
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return result;
}
function walk(value: unknown, visit: (record: RecordValue) => void, onlyKeys?: string[]): void {
  const seen = new Set<unknown>();
  const run = (node: unknown, key = ''): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) run(child, key);
      return;
    }
    const record = node as RecordValue;
    if (!onlyKeys || onlyKeys.includes(key)) visit(record);
    for (const [childKey, child] of Object.entries(record)) run(child, childKey);
  };
  run(value);
}
function arrayFrom(value: unknown, keys: string[]): RecordValue[] {
  let result: RecordValue[] = [];
  const seen = new Set<unknown>();
  const visit = (current: unknown): void => {
    if (!current || typeof current !== 'object' || seen.has(current) || result.length) return;
    seen.add(current);
    if (Array.isArray(current)) {
      for (const child of current) visit(child);
      return;
    }
    const record = current as RecordValue;
    for (const key of keys) {
      const candidate = record[key];
      if (Array.isArray(candidate) && candidate.some(isRecord)) {
        result = candidate.filter(isRecord);
        return;
      }
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return result;
}
function catalogArray(value: unknown, keys: string[]): RecordValue[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}
function arrayNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter((item) => Number.isFinite(item)) : [];
}
function arrayStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item))
    : [];
}
function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function numberOf(record: RecordValue, keys: string[]): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}
function textOf(record: RecordValue, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}
function imageOf(record: RecordValue): string {
  return textOf(
    record,
    [
      'iconUrl',
      'icon',
      'roleIconUrl',
      'roleIcon',
      'weaponIcon',
      'phantomIcon',
      'picUrl',
      'imageUrl',
    ],
    '',
  );
}
function calculatorImage(item: Item): string {
  if (kind.value !== 'role') return item.icon;
  if (avatarSize.value === 'small') return portraitCache.value[item.id]?.thumbnail || item.icon;
  const artwork = portraitCache.value[item.id];
  return (
    (props.useCardThumbnail ? artwork?.cardThumbnail : artwork?.fullBody) ||
    artwork?.fullBody ||
    item.icon
  );
}
function readPortraitCache(): Record<number, RoleArtwork> {
  try {
    return JSON.parse(localStorage.getItem('wwbox.kuroCalculatorArtworks') || '{}') as Record<
      number,
      RoleArtwork
    >;
  } catch {
    return {};
  }
}
function advanceLocations(record: RecordValue): string[] {
  const list = arrayFrom(record, ['advanceSkillList']);
  const source = list.map((item) => textOf(item, ['location'], '')).filter(Boolean);
  const standard = [
    ...Array.from({ length: 5 }, (_, index) => `2-${index + 1}`),
    ...Array.from({ length: 5 }, (_, index) => `3-${index + 1}`),
  ];
  return standard.map((location, index) =>
    source.includes(location) ? location : (source[index] ?? ''),
  );
}
function nestedRecord(record: RecordValue, key: string): RecordValue {
  return isRecord(record[key]) ? record[key] : {};
}
function resetFilters(): void {
  ownership.value = 'all';
  rarity.value = 0;
  element.value = '';
  itemType.value = '';
  echoSet.value = '';
  echoCost.value = 0;
  search.value = '';
}
function rarityLabel(item: Item): string {
  if (rarity.value && item.rarities.includes(rarity.value)) return `${rarity.value}★`;
  const values = ownership.value === 'owned' ? item.ownedRarities : item.rarities;
  if (!values.length) return '星级未知';
  if (values.length === 1) return `${values[0]}★`;
  return `${Math.min(...values)}–${Math.max(...values)}★`;
}
function maxLevel(item: Item, config: Config): number {
  if (kind.value === 'weapon') return item.rarity <= 2 ? 70 : 90;
  if (kind.value === 'echo') return echoMaxLevel(config.rarity);
  return 90;
}
function echoMaxLevel(value: number): number {
  return value <= 2 ? 10 : value === 3 ? 15 : value === 4 ? 20 : 25;
}
function clampConfigLevels(item: Item, config: Config): void {
  const max = kind.value === 'echo' ? echoMaxLevel(config.rarity) : item.rarity <= 2 ? 70 : 90;
  config.start = Math.min(config.start, max);
  config.end = Math.min(config.end, max);
}
function clampLevels(): void {
  if (!activeItem.value || !activeConfig.value) return;
  clampConfigLevels(activeItem.value, activeConfig.value);
}
function selectedWeaponMax(config: Config): number {
  return (selectedWeapon(config)?.rarity ?? 5) <= 2 ? 70 : 90;
}
function attributeIcon(name: string): string {
  if (/气动/.test(name)) return aeroIcon;
  if (/导电/.test(name)) return electroIcon;
  if (/热熔/.test(name)) return fusionIcon;
  if (/冷凝/.test(name)) return glacioIcon;
  if (/湮灭/.test(name)) return havocIcon;
  if (/衍射/.test(name)) return spectroIcon;
  return '';
}
function weaponTypeIcon(name: string): string {
  const file =
    name === '长刃'
      ? 'Sword'
      : name === '臂铠'
        ? 'Fist'
        : name === '迅刀'
          ? 'Knife'
          : name === '佩枪'
            ? 'Gun'
            : name === '音感仪'
              ? 'Magic'
              : '';
  return file ? `https://mc.appfeng.com/ui/icon/SP_IconNor${file}.png` : '';
}
function echoSetIcon(name: string): string {
  for (const item of echoCatalog.value) {
    const icons = nestedRecord(item.raw, 'setIcons');
    const icon = icons[name];
    if (typeof icon === 'string' && icon) return icon;
  }
  return '';
}
function nestedTextOf(record: RecordValue, keys: string[], names: string[]): string {
  for (const key of keys) {
    if (!isRecord(record[key])) continue;
    const value = textOf(record[key], names, '');
    if (value) return value;
  }
  return '';
}
function attributeNameOf(record: RecordValue): string {
  const direct = textOf(record, ['attributeName', 'elementName'], '');
  if (direct) return direct;
  const rawValue = record.attribute ?? record.element;
  if (typeof rawValue === 'string' && rawValue.trim() && !/^\d+$/.test(rawValue.trim()))
    return rawValue.trim();
  return (
    ATTRIBUTE_NAMES[numberOf(record, ['attributeId', 'elementId', 'attribute', 'element'])] ||
    nestedTextOf(record, ['attribute', 'element'], ['name', 'attributeName', 'elementName'])
  );
}
</script>

<template>
  <section class="calculator-workspace">
    <nav class="calc-tabs" aria-label="养成计算类型">
      <button
        v-for="entry in [
          ['role', '角色'],
          ['weapon', '武器'],
          ['echo', '声骸'],
        ] as const"
        :key="entry[0]"
        :class="{ active: kind === entry[0] }"
        @click="kind = entry[0]"
      >
        {{ entry[1] }}
      </button>
    </nav>

    <template v-if="mode === 'catalog'">
      <header class="catalog-toolbar panel">
        <label class="avatar-size-control"
          >头像大小<ThemedSelect
            v-model="avatarSize"
            :min-width="88"
            :options="[
              { value: 'small', label: '小' },
              { value: 'large', label: '大' },
            ]"
        /></label>
        <ThemedSelect
          v-model="ownership"
          :options="[
            {
              value: 'all',
              label: `全部${kind === 'role' ? '角色' : kind === 'weapon' ? '武器' : '声骸'}`,
            },
            {
              value: 'owned',
              label: `已拥有${kind === 'role' ? '角色' : kind === 'weapon' ? '武器' : '声骸'}`,
            },
          ]"
        />
        <ThemedSelect
          v-model="rarity"
          :options="[
            { value: 0, label: '全部星级' },
            ...rarityOptions.map((v) => ({ value: v, label: `${v} 星` })),
          ]"
        />
        <ThemedSelect
          v-if="kind === 'role'"
          v-model="element"
          :options="[
            { value: '', label: '全部属性' },
            ...optionValues('element').map((v) => ({
              value: String(v),
              label: String(v),
              icon: attributeIcon(String(v)),
            })),
          ]"
        />
        <ThemedSelect
          v-if="kind !== 'echo'"
          v-model="itemType"
          :options="[
            { value: '', label: '全部武器类型' },
            ...optionValues('type').map((v) => ({
              value: String(v),
              label: String(v),
              icon: weaponTypeIcon(String(v)),
            })),
          ]"
        />
        <template v-else>
          <ThemedSelect
            v-model="echoSet"
            :min-width="205"
            :options="[
              { value: '', label: '全部套装' },
              ...echoSetOptions.map((v) => ({ value: v, label: v, icon: echoSetIcon(v) })),
            ]"
          />
          <ThemedSelect
            v-model="echoCost"
            :options="[
              { value: 0, label: '全部 COST' },
              ...optionValues('cost').map((v) => ({ value: Number(v), label: `COST ${v}` })),
            ]"
          />
          <ThemedSelect
            v-model="itemType"
            :options="[
              { value: '', label: '全部级别' },
              ...optionValues('type').map((v) => ({ value: String(v), label: String(v) })),
            ]"
          />
        </template>
        <div class="search-actions">
          <input v-model="search" type="search" placeholder="搜索名称" />
          <button class="primary-button" :disabled="!selected[kind].length" @click="openPlan()">
            完成选择（{{ selected[kind].length }}）
          </button>
        </div>
      </header>
      <div v-if="echoLoading" class="empty panel">正在读取账号已装备声骸…</div>
      <div v-else class="item-grid" :class="{ 'avatar-large': avatarSize === 'large' }">
        <button
          v-for="item in filtered"
          :key="item.id"
          class="item-card"
          :class="[
            `rarity-${displayRarity(item)}`,
            { selected: selected[kind].includes(item.id), 'role-item': kind === 'role' },
          ]"
          @click="direct(item)"
        >
          <span class="check" @click.stop="toggle(item)">{{
            selected[kind].includes(item.id) ? '✓' : ''
          }}</span
          ><HighQualityImage
            v-if="kind === 'role' && calculatorImage(item)"
            class="role-artwork"
            :src="calculatorImage(item)"
            :alt="item.name"
            :position-y="avatarSize === 'small' ? 0.22 : 0"
          /><img v-else-if="calculatorImage(item)" :src="calculatorImage(item)" alt="" /><span
            v-else
            class="image-fallback"
            >{{ item.name.slice(0, 1) }}</span
          >
          <strong>{{ item.name }}</strong
          ><small
            >{{ rarityLabel(item) }}<template v-if="item.element"> · {{ item.element }}</template
            ><template v-if="item.type"> · {{ item.type }}</template
            ><template v-if="item.cost"> · COST {{ item.cost }}</template></small
          >
        </button>
      </div>
      <div v-if="!echoLoading && !filtered.length" class="empty panel">
        没有符合筛选条件的项目。
      </div>
    </template>

    <template v-else>
      <div class="plan-actions">
        <button @click="mode = 'catalog'">← 返回选择</button
        ><button class="primary-button" :disabled="calculating" @click="calculate">
          {{ calculating ? '正在计算…' : '开始计算' }}
        </button>
      </div>
      <div class="plan-columns">
        <article class="panel configure-panel">
          <h2>选定{{ kind === 'role' ? '角色' : kind === 'weapon' ? '武器' : '声骸' }}</h2>
          <div class="selected-strip">
            <button
              v-for="item in currentItems"
              :key="item.id"
              :class="[`rarity-${configuredRarity(item)}`, { active: activeItem?.id === item.id }]"
              @click="activeId = item.id"
            >
              <img v-if="item.icon" :src="item.icon" alt="" /><span v-else>{{
                item.name.slice(0, 1)
              }}</span
              ><i @click.stop="remove(item.id)">×</i></button
            ><button class="add" @click="mode = 'catalog'">＋</button>
          </div>
          <section v-if="activeItem && activeConfig" class="config-body">
            <div class="subject">
              <img v-if="activeItem.icon" :src="activeItem.icon" alt="" />
              <div>
                <h3>{{ activeItem.name }}</h3>
                <span>{{ kind === 'echo' ? activeConfig.rarity : activeItem.rarity }}★</span>
              </div>
            </div>
            <div class="level-row">
              <b>{{ kind === 'echo' ? '声骸等级' : kind === 'weapon' ? '武器等级' : '角色等级' }}</b
              ><ThemedSelect
                v-model="activeConfig.start"
                :options="levelOptions.map((v) => ({ value: v, label: `Lv.${v}` }))"
              /><span>→</span
              ><ThemedSelect
                v-model="activeConfig.end"
                :options="levelOptions.map((v) => ({ value: v, label: `Lv.${v}` }))"
              />
            </div>
            <template v-if="kind === 'role'">
              <h3 class="section-title">技能</h3>
              <div class="skill-list">
                <div v-for="(skill, index) in activeConfig.skills" :key="index" class="skill-row">
                  <span class="skill-icon">{{ index + 1 }}</span>
                  <b>{{ ['常态攻击', '共鸣技能', '共鸣回路', '共鸣解放', '变奏技能'][index] }}</b>
                  <span class="skill-controls">
                    <ThemedSelect
                      v-model="skill.start"
                      :options="
                        Array.from({ length: 10 }, (_, i) => ({
                          value: i + 1,
                          label: `Lv.${i + 1}`,
                        }))
                      "
                    /><span>→</span
                    ><ThemedSelect
                      v-model="skill.end"
                      :options="
                        Array.from({ length: 10 }, (_, i) => ({
                          value: i + 1,
                          label: `Lv.${i + 1}`,
                        }))
                      "
                    />
                    <input v-model="skill.enabled" type="checkbox" />
                  </span>
                </div>
              </div>
              <div class="other-skills">
                <header>
                  <b>其他技能</b
                  ><button @click="setAllAdvanced(!activeConfig.advanced.every(Boolean))">
                    {{ activeConfig.advanced.every(Boolean) ? '取消全选' : '全选' }}
                  </button>
                </header>
                <template v-for="skillIndex in 5" :key="skillIndex">
                  <label
                    ><input v-model="activeConfig.advanced[skillIndex - 1]" type="checkbox" /><span
                      >技能 {{ skillIndex }}·节点 2</span
                    ></label
                  >
                  <label
                    ><input v-model="activeConfig.advanced[skillIndex + 4]" type="checkbox" /><span
                      >技能 {{ skillIndex }}·节点 3</span
                    ></label
                  >
                </template>
              </div>
              <h3 class="section-title">武器 <small>（选填）</small></h3>
              <button class="weapon-choice" @click="weaponPicker = true">
                <template v-if="selectedWeapon(activeConfig)"
                  ><img
                    v-if="selectedWeapon(activeConfig)?.icon"
                    :src="selectedWeapon(activeConfig)?.icon"
                    alt=""
                  /><b>{{ selectedWeapon(activeConfig)?.name }}</b></template
                ><template v-else><span>＋</span>点击选择武器</template>
              </button>
              <div v-if="activeConfig.weaponId" class="level-row">
                <b>武器等级</b
                ><ThemedSelect
                  v-model="activeConfig.weaponStart"
                  :options="
                    Array.from({ length: selectedWeaponMax(activeConfig) }, (_, i) => ({
                      value: i + 1,
                      label: `Lv.${i + 1}`,
                    }))
                  "
                /><span>→</span
                ><ThemedSelect
                  v-model="activeConfig.weaponEnd"
                  :options="
                    Array.from({ length: selectedWeaponMax(activeConfig) }, (_, i) => ({
                      value: i + 1,
                      label: `Lv.${i + 1}`,
                    }))
                  "
                />
              </div>
            </template>
            <div v-if="kind === 'echo'" class="echo-options">
              <label
                >声骸星级
                <ThemedSelect
                  v-model="activeConfig.rarity"
                  :options="activeItem.rarities.map((v) => ({ value: v, label: `${v}星` }))"
                  @change="clampLevels"
              /></label>
              <label><input v-model="activeConfig.tune" type="checkbox" /> 计算调谐消耗</label
              ><button @click="applyEchoToAll">应用到全部</button>
              <p>声骸材料使用本地等级经验表估算；角色与武器由库街区官方计算接口返回。</p>
            </div>
          </section>
        </article>
        <article class="panel result-panel">
          <h2>计算结果</h2>
          <div class="result-strip">
            <button :class="{ active: resultTarget === 'all' }" @click="resultTarget = 'all'">
              <span class="aggregate-icon"><i></i><i></i><i></i><i></i></span></button
            ><button
              v-for="item in currentItems"
              :key="item.id"
              :class="[
                `rarity-${configuredRarity(item)}`,
                { active: resultTarget === keyFor(kind, item.id) },
              ]"
              @click="resultTarget = keyFor(kind, item.id)"
            >
              <img v-if="item.icon" :src="item.icon" alt="" /><span v-else>{{
                item.name.slice(0, 1)
              }}</span>
            </button>
          </div>
          <section class="materials">
            <header>
              <h3>仍需材料总览</h3>
              <span>{{
                resultTarget === 'all' ? `共 ${currentItems.length} 项` : '单项结果'
              }}</span>
            </header>
            <div v-if="shownMaterials.length" class="material-list">
              <article v-for="material in shownMaterials" :key="material.key">
                <img v-if="material.icon" :src="material.icon" alt="" /><span v-else>◆</span
                ><b>{{ material.name }}</b
                ><strong>× {{ material.count.toLocaleString() }}</strong>
              </article>
            </div>
            <div v-else class="empty">配置完成后点击“开始计算”查看材料。</div>
          </section>
          <section class="materials craftable">
            <header>
              <h3>背包可合成材料</h3>
              <span>{{ shownSyntheticMaterials.length }} 种</span>
            </header>
            <div class="material-icons">
              <article v-for="material in shownSyntheticMaterials" :key="material.key">
                <img v-if="material.icon" :src="material.icon" alt="" /><span v-else>◆</span
                ><small>{{ material.name }}</small
                ><b>{{ material.count.toLocaleString() }}</b>
              </article>
            </div>
            <div v-if="!shownSyntheticMaterials.length" class="empty">
              当前计算结果没有可由背包材料合成的项目。
            </div>
          </section>
          <section v-if="shownRequiredMaterials.length" class="materials needed">
            <header>
              <h3>所需材料总览</h3>
              <span>{{ shownRequiredMaterials.length }} 种材料</span>
            </header>
            <div class="material-icons">
              <article v-for="material in shownRequiredMaterials" :key="material.key">
                <img v-if="material.icon" :src="material.icon" alt="" /><span v-else>◆</span
                ><small>{{ material.name }}</small
                ><b>{{ material.count.toLocaleString() }}</b>
              </article>
            </div>
          </section>
        </article>
      </div>
    </template>

    <AppDialog :open="weaponPicker" @close="weaponPicker = false">
      <section class="dialog-surface weapon-modal panel">
        <header>
          <h2>选择武器</h2>
          <button @click="weaponPicker = false">×</button>
        </header>
        <div class="item-grid">
          <button
            v-for="item in compatibleWeapons"
            :key="item.id"
            class="item-card"
            :class="`rarity-${item.rarity}`"
            @click="selectWeapon(item)"
          >
            <img v-if="item.icon" :src="item.icon" alt="" /><strong>{{ item.name }}</strong
            ><small>{{ item.rarity }}★ · {{ item.type }}</small>
          </button>
        </div>
      </section>
    </AppDialog>
    <p v-if="error" class="error panel">{{ error }}</p>
  </section>
</template>

<style scoped>
.calculator-workspace {
  display: grid;
  gap: 14px;
  color: var(--text-primary);
}
button,
select,
input {
  color: var(--text-primary);
}
.panel {
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 14px 35px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(18px);
}
.calc-tabs {
  display: flex;
  gap: 8px;
}
.calc-tabs button,
.filter-group button {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--surface-control);
  padding: 10px 24px;
  font-weight: 800;
}
.calc-tabs button.active,
.filter-group button.active,
.plan-actions .primary-button {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}
.catalog-toolbar {
  position: relative;
  z-index: 40;
  overflow: visible;
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  padding: 12px;
}
.avatar-size-control {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}
.catalog-toolbar select,
.catalog-toolbar input,
.level-row select,
.skill-list select {
  min-height: 38px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--surface-control);
  padding: 0 11px;
}
.icon-select {
  display: inline-flex;
  position: relative;
  align-items: center;
}
.icon-select > img {
  position: absolute;
  z-index: 1;
  left: 10px;
  width: 20px;
  height: 20px;
  object-fit: contain;
  pointer-events: none;
}
.icon-select > img + select {
  padding-left: 36px;
}
.filter-select {
  position: relative;
  z-index: 8;
  min-width: 150px;
}
.filter-select[open] {
  z-index: 200;
}
.filter-select summary {
  display: grid;
  min-height: 38px;
  box-sizing: border-box;
  grid-template-columns: 22px 1fr auto;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--surface-control);
  padding: 0 10px;
  cursor: pointer;
  list-style: none;
}
.filter-select summary::-webkit-details-marker {
  display: none;
}
.filter-select summary img,
.filter-select-menu img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.filter-select summary > span:first-child {
  grid-column: 1 / 3;
}
.filter-select summary i {
  font-style: normal;
}
.filter-select-menu {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  display: grid;
  min-width: 100%;
  max-height: 310px;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--surface-raised);
  padding: 6px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.38);
}
.filter-select-menu button {
  display: grid;
  min-height: 38px;
  grid-template-columns: 24px 1fr;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  padding: 6px 9px;
  text-align: left;
  white-space: nowrap;
}
.filter-select-menu button:not(:has(img)) {
  grid-template-columns: 1fr;
}
.filter-select-menu button:hover,
.filter-select-menu button.active {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface-control)) !important;
}
.set-select {
  min-width: 205px;
}
.search-actions {
  display: flex;
  flex: 1 1 330px;
  gap: 8px;
  margin-left: auto;
}
.search-actions input {
  min-width: 120px;
  flex: 1;
}
.search-actions button {
  min-width: 142px;
  border-radius: 10px;
  padding: 0 13px;
  white-space: nowrap;
}
.filter-group {
  display: flex;
  gap: 5px;
}
.filter-group button {
  padding: 7px 12px;
}
.item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 96px));
  gap: 8px;
  justify-content: start;
}
.item-grid.avatar-large {
  grid-template-columns: repeat(auto-fill, minmax(128px, 150px));
  gap: 10px;
}
.item-grid.avatar-large .item-card {
  min-height: 190px;
  border-radius: 12px;
  padding: 6px;
}
.item-grid.avatar-large .item-card > .role-artwork,
.item-grid.avatar-large .item-card > img,
.item-grid.avatar-large .image-fallback {
  height: 132px;
  border-radius: 11px;
  object-fit: cover;
  object-position: top center;
}
.item-grid.avatar-large .item-card strong {
  font-size: 15px;
  line-height: 20px;
}
.item-grid.avatar-large .item-card small {
  font-size: 11px;
  line-height: 15px;
}
.item-card {
  position: relative;
  display: grid;
  gap: 2px;
  overflow: hidden;
  min-height: 96px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--surface-raised);
  padding: 4px;
  text-align: left;
}
.item-card img,
.image-fallback {
  width: 100%;
  height: 56px;
  border-radius: 7px;
  object-fit: contain;
  background: var(--surface-control);
}
.item-card.role-item > .role-artwork {
  width: 100%;
  height: 56px;
  border-radius: 7px;
  background: var(--surface-control);
}
.item-grid:not(.avatar-large) .item-card.role-item > .role-artwork {
  object-fit: cover;
  object-position: center 22%;
}
.item-card.rarity-5 > img,
.item-card.rarity-5 > .role-artwork,
.item-card.rarity-5 > .image-fallback {
  background: linear-gradient(145deg, #73582b, #d4ae55 72%, #fff0ac) !important;
}
.item-card.rarity-4 > img,
.item-card.rarity-4 > .role-artwork,
.item-card.rarity-4 > .image-fallback {
  background: linear-gradient(145deg, #4b3068, #9e62cc 72%, #ddb6ff) !important;
}
.item-card.rarity-3 > img,
.item-card.rarity-3 > .role-artwork,
.item-card.rarity-3 > .image-fallback {
  background: linear-gradient(145deg, #284d72, #5798d1 72%, #b9e3ff) !important;
}
.item-card.rarity-2 > img,
.item-card.rarity-2 > .role-artwork,
.item-card.rarity-2 > .image-fallback {
  background: linear-gradient(145deg, #285b43, #62ad7d 72%, #c3f3d1) !important;
}
.item-card.rarity-1 > img,
.item-card.rarity-1 > .role-artwork,
.item-card.rarity-1 > .image-fallback {
  background: linear-gradient(145deg, #4c545c, #89949e 72%, #e2e7eb) !important;
}
.image-fallback {
  display: grid;
  place-items: center;
  font-size: 22px;
}
.item-card strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 15px;
}
.item-card small {
  color: var(--text-secondary);
  overflow: hidden;
  font-size: 9px;
  line-height: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-card.selected {
  outline: 3px solid color-mix(in srgb, var(--accent), transparent 30%);
}
.item-card.rarity-5 {
  border-bottom-color: #dbb658;
  background: linear-gradient(
    155deg,
    color-mix(in srgb, #dbb658 28%, var(--surface-raised)),
    var(--surface-raised) 72%
  ) !important;
}
.item-card.rarity-4 {
  border-bottom-color: #a66ee5;
  background: linear-gradient(
    155deg,
    color-mix(in srgb, #a66ee5 28%, var(--surface-raised)),
    var(--surface-raised) 72%
  ) !important;
}
.item-card.rarity-3 {
  border-bottom-color: #5b9fda;
  background: linear-gradient(
    155deg,
    color-mix(in srgb, #5b9fda 28%, var(--surface-raised)),
    var(--surface-raised) 72%
  ) !important;
}
.item-card.rarity-2 {
  border-bottom-color: #65b98b;
  background: linear-gradient(
    155deg,
    color-mix(in srgb, #65b98b 26%, var(--surface-raised)),
    var(--surface-raised) 72%
  ) !important;
}
.item-card.rarity-1 {
  border-bottom-color: #9aa3ad;
  background: linear-gradient(
    155deg,
    color-mix(in srgb, #9aa3ad 24%, var(--surface-raised)),
    var(--surface-raised) 72%
  ) !important;
}
.check {
  position: absolute;
  z-index: 2;
  right: 3px;
  top: 3px;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 2px solid white;
  border-radius: 5px;
  background: rgba(12, 18, 23, 0.78);
  color: white;
  font-size: 11px;
  font-weight: 900;
}
.plan-actions button {
  padding: 10px 20px;
  border-radius: 11px;
}
.plan-actions {
  display: flex;
  justify-content: space-between;
}
.plan-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  gap: 14px;
  align-items: start;
}
.configure-panel,
.result-panel {
  min-width: 0;
  overflow: hidden;
  padding: 16px;
}
.configure-panel h2,
.result-panel h2 {
  margin: 0 0 12px;
}
.selected-strip,
.result-strip {
  display: flex;
  gap: 9px;
  overflow: auto;
  padding: 3px 3px 12px;
}
.selected-strip button,
.result-strip button {
  position: relative;
  flex: 0 0 66px;
  width: 66px;
  height: 66px;
  border: 2px solid var(--border-color);
  border-radius: 13px;
  background: var(--surface-control);
  padding: 3px;
}
.selected-strip button.active,
.result-strip button.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent), transparent 55%);
}
.selected-strip button.rarity-5,
.result-strip button.rarity-5 {
  background: color-mix(in srgb, #dbb658 34%, var(--surface-control)) !important;
}
.selected-strip button.rarity-4,
.result-strip button.rarity-4 {
  background: color-mix(in srgb, #a66ee5 34%, var(--surface-control)) !important;
}
.selected-strip button.rarity-3,
.result-strip button.rarity-3 {
  background: color-mix(in srgb, #5b9fda 34%, var(--surface-control)) !important;
}
.selected-strip button.rarity-2,
.result-strip button.rarity-2 {
  background: color-mix(in srgb, #65b98b 32%, var(--surface-control)) !important;
}
.selected-strip button.rarity-1,
.result-strip button.rarity-1 {
  background: color-mix(in srgb, #9aa3ad 28%, var(--surface-control)) !important;
}
.aggregate-icon {
  display: grid;
  width: 34px;
  height: 34px;
  margin: auto;
  grid-template-columns: repeat(2, 12px);
  grid-template-rows: repeat(2, 12px);
  place-content: center;
  gap: 2px;
  transform: rotate(45deg);
}
.aggregate-icon i {
  display: block;
  border-radius: 2px;
  background: currentColor;
}
.selected-strip img,
.result-strip img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 9px;
}
.selected-strip i {
  position: absolute;
  right: -3px;
  top: -7px;
  border-radius: 50%;
  background: #24282c;
  color: white;
  font-style: normal;
  width: 20px;
  height: 20px;
}
.selected-strip .add {
  font-size: 30px;
}
.config-body {
  display: grid;
  gap: 13px;
}
.subject {
  display: flex;
  align-items: center;
  gap: 14px;
  border-radius: 14px;
  background: var(--surface-control);
  padding: 12px;
}
.subject img {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  object-fit: contain;
}
.subject h3 {
  margin: 0;
  font-size: 22px;
}
.level-row {
  display: grid;
  grid-template-columns: 1fr 108px 22px 108px;
  align-items: center;
  gap: 8px;
  border-left: 5px solid var(--accent);
  border-radius: 12px;
  background: var(--surface-control);
  padding: 10px;
  min-width: 0;
}
.section-title {
  margin: 6px 0 0;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 7px;
}
.section-title small {
  color: var(--text-secondary);
}
.skill-list {
  display: grid;
  gap: 7px;
}
.skill-row {
  display: grid;
  grid-template-columns: 38px minmax(92px, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border-radius: 11px;
  background: var(--surface-control);
  padding: 7px;
}
.skill-row > b {
  white-space: nowrap;
}
.skill-controls {
  display: grid;
  grid-template-columns: 88px 14px 88px 24px;
  align-items: center;
  gap: 5px;
  justify-self: end;
  isolation: isolate;
}
.skill-list :deep(.themed-select-control) {
  position: relative;
  width: 88px !important;
  min-width: 0 !important;
  contain: layout style;
}
.skill-controls :deep(.themed-select-control > button) {
  background: color-mix(in srgb, var(--surface-control) 94%, var(--surface-raised)) !important;
  box-shadow: none !important;
}
.skill-controls > input[type='checkbox'] {
  margin: 0 0 0 3px;
}
.skill-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent), transparent 70%);
  font-weight: 900;
}
.other-skills {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 7px;
  border-radius: 13px;
  background: var(--surface-control);
  padding: 10px;
}
.other-skills header {
  grid-column: 1/-1;
  display: flex;
  justify-content: space-between;
}
.other-skills label {
  display: flex;
  gap: 7px;
  font-size: 13px;
}
.weapon-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 66px;
  border: 1px dashed var(--border-color);
  border-radius: 13px;
  background: var(--surface-control);
  padding: 9px;
}
.weapon-choice img {
  width: 50px;
  height: 50px;
  object-fit: contain;
}
.weapon-choice span {
  font-size: 28px;
}
.echo-options {
  display: grid;
  gap: 10px;
  border-radius: 13px;
  background: var(--surface-control);
  padding: 12px;
}
.echo-options p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
.materials {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--surface-control);
}
.materials > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 13px;
  background: color-mix(in srgb, var(--accent), transparent 72%);
}
.materials h3 {
  margin: 0;
}
.material-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
}
.material-list article {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: 8px;
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  background: var(--surface-raised);
  padding: 8px;
}
.material-list img,
.material-list article > span {
  width: 34px;
  height: 34px;
  object-fit: contain;
}
.material-list article > span {
  display: grid;
  place-items: center;
}
.needed {
  margin-top: 14px;
}
.craftable {
  margin-top: 14px;
}
.material-icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 8px;
  padding: 11px;
}
.material-icons article {
  display: grid;
  justify-items: center;
  gap: 4px;
  border-radius: 10px;
  background: var(--surface-raised);
  padding: 8px;
  text-align: center;
}
.material-icons img,
.material-icons article > span {
  width: 52px;
  height: 52px;
  object-fit: contain;
}
.material-icons article > span {
  display: grid;
  place-items: center;
}
.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
.modal-backdrop {
  position: fixed;
  z-index: 90;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.58);
  padding: 30px;
}
.weapon-modal {
  width: min(850px, 92vw);
  max-height: 82vh;
  overflow: auto;
  padding: 16px;
}
.weapon-modal > header {
  display: flex;
  justify-content: space-between;
}
.weapon-modal > header button {
  font-size: 25px;
}
.error {
  padding: 10px;
  color: #ff867d;
}
@media (max-width: 980px) {
  .plan-columns {
    grid-template-columns: 1fr;
  }
  .search-actions {
    margin-left: 0;
  }
  .material-list {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 650px) {
  .skill-row {
    grid-template-columns: 34px minmax(0, 1fr);
  }
  .skill-controls {
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 1fr) 14px minmax(0, 1fr) 24px;
    width: 100%;
    justify-self: stretch;
  }
  .skill-list :deep(.themed-select-control) {
    width: 100% !important;
  }
  .level-row {
    grid-template-columns: 1fr 82px 15px 82px;
  }
  .other-skills {
    grid-template-columns: 1fr;
  }
  .item-grid {
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  }
}
</style>
