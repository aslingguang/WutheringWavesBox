<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import glacioIcon from '../assets/kuro/attributes/glacio.png';
import fusionIcon from '../assets/kuro/attributes/fusion.png';
import electroIcon from '../assets/kuro/attributes/electro.png';
import aeroIcon from '../assets/kuro/attributes/aero.png';
import spectroIcon from '../assets/kuro/attributes/spectro.png';
import havocIcon from '../assets/kuro/attributes/havoc.png';
import bundledPhantomWeights from '../assets/kuro/phantom-weights.json';
import HighQualityImage from './HighQualityImage.vue';
import ThemedSelect from './ThemedSelect.vue';
import AppDialog from './AppDialog.vue';

const props = defineProps<{
  accountId: string;
  gameRoleId: string;
  data: Record<string, unknown> | null;
  error: string | undefined;
  useCardThumbnail: boolean;
  cardResolution: number;
}>();
const emit = defineEmits<{
  notice: [ok: boolean, text: string];
  openMobile: [];
}>();

type RecordValue = Record<string, unknown>;
type RoleArtwork = {
  fullBody: string;
  team: string;
  thumbnail?: string;
  cardThumbnail?: string;
  cardResolution?: number;
  order: number;
  wikiEntryId: string;
};
type SortKey = 'attribute' | 'weapon' | 'level' | 'rarity' | 'chain';
type SortRule = { key: SortKey; direction: 'asc' | 'desc' };
const attributeFilter = ref('全部属性');
const weaponFilter = ref('全部武器');
const rarityFilter = ref('全部星级');
const sortRules = ref<SortRule[]>([]);
const avatarSize = ref<'small' | 'large'>(
  localStorage.getItem('wwbox.kuroRoleAvatarSize') === 'small' ? 'small' : 'large',
);
const infoModal = ref('');
const selected = ref<RecordValue | null>(null);
const detail = ref<RecordValue | null>(null);
const loading = ref(false);
const detailError = ref('');
const detailArtwork = ref<'profile' | 'team'>('profile');
const wikiArtworks = ref<Record<string, RoleArtwork>>(readWikiArtworks());
const collapsed = ref<Record<string, boolean>>(readCollapsed());
watch(avatarSize, (value) => localStorage.setItem('wwbox.kuroRoleAvatarSize', value));

const roles = computed(() => {
  const source = arrayAt(props.data, ['roleList', 'roles', 'roleDataList']);
  const candidates = source.length ? source : collectRoleRecords(props.data);
  const unique = new Map<string, RecordValue>();
  for (const item of candidates) {
    const id = String(item.roleId ?? item.id ?? item.cardRoleId ?? '');
    if (id && roleName(item)) unique.set(id, item);
  }
  return [...unique.values()];
});
const attributes = computed(() => [
  '全部属性',
  ...new Set(roles.value.map(attributeName).filter(Boolean)),
]);
const weapons = computed(() => [
  '全部武器',
  ...new Set(roles.value.map(weaponTypeName).filter(Boolean)),
]);
const rarities = computed(() => [
  '全部星级',
  ...new Set(
    roles.value
      .map((item) => numberOf(item, ['starLevel', 'rarity', 'quality']))
      .filter(Boolean)
      .sort((a, b) => b - a)
      .map((item) => `${item}星`),
  ),
]);
const visibleRoles = computed(() => {
  const officialOrder = new Map(
    roles.value.map((item, index) => [String(item.roleId ?? item.id), index]),
  );
  const result = roles.value.filter(
    (item) =>
      (attributeFilter.value === '全部属性' || attributeName(item) === attributeFilter.value) &&
      (weaponFilter.value === '全部武器' || weaponTypeName(item) === weaponFilter.value) &&
      (rarityFilter.value === '全部星级' ||
        `${numberOf(item, ['starLevel', 'rarity', 'quality'])}星` === rarityFilter.value),
  );
  return [...result].sort((left, right) => {
    for (const rule of sortRules.value) {
      const a = valueForRule(left, rule.key);
      const b = valueForRule(right, rule.key);
      const compared =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a).localeCompare(String(b), 'zh-CN');
      if (compared) return rule.direction === 'desc' ? -compared : compared;
    }
    const rarity =
      numberOf(right, ['starLevel', 'rarity', 'quality']) -
      numberOf(left, ['starLevel', 'rarity', 'quality']);
    if (rarity) return rarity;
    const leftId = String(left.roleId ?? left.id);
    const rightId = String(right.roleId ?? right.id);
    const leftWiki = wikiArtworks.value[leftId]?.order;
    const rightWiki = wikiArtworks.value[rightId]?.order;
    if (leftWiki !== undefined || rightWiki !== undefined)
      return (leftWiki ?? Number.MAX_SAFE_INTEGER) - (rightWiki ?? Number.MAX_SAFE_INTEGER);
    return (
      (officialOrder.get(rightId) ?? Number.MIN_SAFE_INTEGER) -
      (officialOrder.get(leftId) ?? Number.MIN_SAFE_INTEGER)
    );
  });
});
const active = computed(() => detail.value ?? selected.value ?? {});
const role = computed(() => {
  const nested = recordOf(active.value.role);
  return Object.keys(nested).length ? nested : (selected.value ?? {});
});
const skills = computed(() => arrayOf(active.value.skillList ?? active.value.skills));
const displaySkills = computed(() => skills.value.slice(0, 5));
const attributesList = computed(() =>
  arrayOf(
    active.value.roleAttributeList ?? active.value.attributeList ?? active.value.properties,
  ).sort((left, right) => numberOf(left, ['sort']) - numberOf(right, ['sort'])),
);
const weapon = computed(() => recordOf(active.value.weaponData));
const weaponInfo = computed(() => {
  const nested = recordOf(weapon.value.weapon);
  return Object.keys(nested).length ? nested : weapon.value;
});
const phantomWeights = computed(() => {
  const remote = recordOf(active.value.phantomWeights);
  if (Object.keys(remote).length) return remote;
  const roleId = String(role.value.roleId ?? role.value.mapRoleId ?? '');
  return recordOf((bundledPhantomWeights as Record<string, unknown>)[roleId]);
});
const phantomData = computed(() => recordOf(active.value.phantomData));
const phantoms = computed(() =>
  arrayOf(phantomData.value.equipPhantomList ?? active.value.phantomList),
);
const heroStyle = computed(() => ({ '--role-color': elementColor(attributeName(role.value)) }));
const echoSets = computed(() => {
  const values = new Map<
    string,
    { name: string; icon: string; count: number; effect2: string; effect5: string }
  >();
  for (const item of phantoms.value) {
    const set = recordOf(item.fetterDetail);
    const name = String(set.name ?? '未组成套装');
    const current = values.get(name) ?? {
      name,
      icon: imageOf(set),
      count: 0,
      effect2: String(set.firstDescription ?? ''),
      effect5: String(set.secondDescription ?? ''),
    };
    current.count += 1;
    values.set(name, current);
  }
  return [...values.values()];
});
const echoBuffs = computed(() => {
  const totals = new Map<string, { name: string; icon: string; value: number; percent: boolean }>();
  for (const echo of phantoms.value) {
    for (const prop of arrayOf(echo.subProps)) {
      const name = labelOf(prop);
      const raw = valueOf(prop);
      const value = Number.parseFloat(raw.replace('%', ''));
      if (!Number.isFinite(value)) continue;
      const current = totals.get(name) ?? {
        name,
        icon: imageOf(prop),
        value: 0,
        percent: raw.includes('%'),
      };
      current.value += value;
      totals.set(name, current);
    }
  }
  return [...totals.values()];
});
const officialRecommendedNames = computed(() => {
  const names = new Set<string>();
  const seen = new Set<unknown>();
  const isStat = (value: string) =>
    /生命|攻击|防御|暴击|共鸣效率|普攻伤害|重击伤害|共鸣技能伤害|共鸣解放伤害/.test(value);
  const visit = (value: unknown, recommendationContext = false): void => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, recommendationContext));
      return;
    }
    const record = value as RecordValue;
    const flagged =
      recommendationContext ||
      record.recommended === true ||
      record.isRecommend === true ||
      record.defaultRecommend === true;
    const label = String(record.attributeName ?? record.propName ?? record.name ?? '');
    if (flagged && isStat(label)) names.add(normalizeStatName(label));
    for (const [key, child] of Object.entries(record)) {
      const context = flagged || /recommend|suggest|effective|valid|推荐|有效辅音/i.test(key);
      if (context && typeof child === 'string' && isStat(child))
        names.add(normalizeStatName(child));
      else visit(child, context);
    }
  };
  visit(active.value);
  return names;
});
const recommendedHits = computed(() => {
  const configured = [
    ...new Set([...Object.keys(phantomWeights.value), ...officialRecommendedNames.value]),
  ];
  const names = configured.length
    ? configured
    : ['攻击百分比', '共鸣技能伤害加成', '共鸣解放伤害加成', '暴击', '暴击伤害'];
  return names
    .map((name) => [name, phantomWeights.value[name] ?? 3] as const)
    .map(([name, weight]) => ({
      name,
      weight: Number(weight),
      hits: phantoms.value.reduce(
        (count, echo) =>
          count + arrayOf(echo.subProps).filter((prop) => normalizedPropName(prop) === name).length,
        0,
      ),
    }))
    .filter((item) => item.weight > 0)
    .sort((left, right) => right.weight - left.weight || right.hits - left.hits);
});
const echoOverallGrade = computed(() => {
  const score = phantoms.value.reduce((sum, item) => {
    const rating = echoRating(item);
    return sum + rating.termScore + rating.valueScore;
  }, 0);
  return score === 45 ? 'ACE' : score >= 35 ? 'SSS' : score >= 25 ? 'SS' : score >= 18 ? 'S' : 'N';
});

async function openRole(item: RecordValue): Promise<void> {
  selected.value = item;
  detail.value = null;
  detailError.value = '';
  loading.value = true;
  detailArtwork.value = 'profile';
  try {
    const cardId = numberOf(item, ['roleId', 'id', 'cardRoleId']);
    detail.value = await window.wwbox.kuro.roleDetail(props.accountId, props.gameRoleId, cardId);
  } catch (error) {
    detailError.value =
      error instanceof Error
        ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
        : '角色详情获取失败';
    emit('notice', false, detailError.value);
  } finally {
    loading.value = false;
  }
}
async function loadWikiArtworks(): Promise<void> {
  const request = roles.value.map((item) => ({
    id: numberOf(item, ['roleId', 'id']),
    name: roleName(item),
    icon: roleAvatar(item),
    element: attributeName(item),
  }));
  if (!request.length) return;
  try {
    wikiArtworks.value = {
      ...wikiArtworks.value,
      ...(await window.wwbox.kuro.roleArtworks(request, {
        useCardThumbnail: props.useCardThumbnail,
        cardResolution: props.cardResolution,
      })),
    };
    localStorage.setItem('wwbox.kuroRoleArtworks', JSON.stringify(wikiArtworks.value));
  } catch {
    // The account-provided images remain usable while Wiki is temporarily unavailable.
  }
}
function readWikiArtworks(): Record<string, RoleArtwork> {
  try {
    return JSON.parse(localStorage.getItem('wwbox.kuroRoleArtworks') || '{}') as Record<
      string,
      RoleArtwork
    >;
  } catch {
    return {};
  }
}
function selectedWikiArtwork(): RoleArtwork | undefined {
  return wikiArtworks.value[
    String(role.value.roleId ?? role.value.id ?? selected.value?.roleId ?? '')
  ];
}
function detailPortrait(): string {
  return detailArtwork.value === 'team'
    ? selectedWikiArtwork()?.team || imageOf(role.value)
    : imageOf(role.value);
}
onMounted(loadWikiArtworks);
watch(roles, loadWikiArtworks);
watch(() => [props.useCardThumbnail, props.cardResolution], loadWikiArtworks);
function toggleSection(key: string): void {
  collapsed.value[key] = !collapsed.value[key];
  localStorage.setItem('wwbox.kuroRoleSections', JSON.stringify(collapsed.value));
}
function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('wwbox.kuroRoleSections') || '{}') as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}
function arrayAt(value: unknown, keys: string[]): RecordValue[] {
  const seen = new Set<unknown>();
  const visit = (current: unknown): RecordValue[] => {
    if (!current || typeof current !== 'object' || seen.has(current)) return [];
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        const found = visit(item);
        if (found.length) return found;
      }
      return current.filter((item) => item && typeof item === 'object') as RecordValue[];
    }
    const record = current as RecordValue;
    for (const key of keys) if (Array.isArray(record[key])) return record[key] as RecordValue[];
    for (const child of Object.values(record)) {
      const found = visit(child);
      if (found.length) return found;
    }
    return [];
  };
  return visit(value);
}
function collectRoleRecords(value: unknown): RecordValue[] {
  const output: RecordValue[] = [];
  const visit = (current: unknown) => {
    if (Array.isArray(current)) return current.forEach(visit);
    if (!current || typeof current !== 'object') return;
    const record = current as RecordValue;
    if (
      (record.roleName || record.name) &&
      (record.roleId || record.cardRoleId) &&
      record.level !== undefined
    )
      output.push(record);
    Object.values(record).forEach(visit);
  };
  visit(value);
  return output;
}
function recordOf(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}
function arrayOf(value: unknown): RecordValue[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as RecordValue[])
    : [];
}
function valueForRule(item: RecordValue, key: SortKey): string | number {
  if (key === 'attribute') return attributeName(item);
  if (key === 'weapon') return weaponTypeName(item);
  if (key === 'rarity') return numberOf(item, ['starLevel', 'rarity', 'quality']);
  if (key === 'chain') return numberOf(item, ['chainUnlockNum', 'chainNum']);
  return numberOf(item, ['level', 'roleLevel']);
}
function toggleSort(key: SortKey, enabled: boolean): void {
  const index = sortRules.value.findIndex((item) => item.key === key);
  if (enabled && index < 0) sortRules.value.push({ key, direction: 'desc' });
  if (!enabled && index >= 0) sortRules.value.splice(index, 1);
}
function sortRule(key: SortKey): SortRule | undefined {
  return sortRules.value.find((item) => item.key === key);
}
function setSortDirection(key: SortKey, direction: 'asc' | 'desc'): void {
  const rule = sortRule(key);
  if (rule) rule.direction = direction;
}
function nestedRecord(item: RecordValue, key: string): RecordValue {
  const nested = recordOf(item[key]);
  return Object.keys(nested).length ? nested : item;
}
function roleName(item: RecordValue): string {
  return String(item.roleName ?? item.name ?? '');
}
function attributeName(item: RecordValue): string {
  return String(item.attributeName ?? item.elementName ?? item.attribute ?? '未知属性');
}
function weaponTypeName(item: RecordValue): string {
  return String(
    item.weaponTypeName ?? item.weaponType ?? recordOf(item.weapon).weaponTypeName ?? '未知武器',
  );
}
function numberOf(item: RecordValue, keys: string[]): number {
  for (const key of keys) {
    const value = Number(item[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}
function imageOf(item: RecordValue): string {
  return String(
    item.rolePicUrl ??
      item.rolePic ??
      item.roleIcon ??
      item.iconUrl ??
      item.icon ??
      item.weaponIcon ??
      item.phantomIcon ??
      '',
  );
}
function roleAvatar(item: RecordValue): string {
  return String(
    item.roleIconUrl ??
      item.avatarUrl ??
      item.iconUrl ??
      item.roleIcon ??
      item.icon ??
      imageOf(item),
  );
}
function roleCardImage(item: RecordValue): string {
  const artwork = wikiArtworks.value[String(item.roleId ?? item.id)];
  return avatarSize.value === 'small'
    ? artwork?.thumbnail || roleAvatar(item)
    : (props.useCardThumbnail ? artwork?.cardThumbnail : artwork?.fullBody) ||
        artwork?.fullBody ||
        imageOf(item);
}
function labelOf(item: RecordValue): string {
  return String(
    item.attributeName ??
      item.skillName ??
      item.chainName ??
      item.phantomName ??
      item.weaponName ??
      item.name ??
      '数据项',
  );
}
function valueOf(item: RecordValue): string {
  return String(item.attributeValue ?? item.value ?? item.level ?? item.num ?? '—');
}
function elementColor(name: string): string {
  if (/冷凝|冰/.test(name)) return '#5caee0';
  if (/热熔|火/.test(name)) return '#d36c54';
  if (/导电|雷/.test(name)) return '#835dcc';
  if (/气动|风/.test(name)) return '#54ae91';
  if (/衍射|光/.test(name)) return '#d2b44e';
  if (/湮灭|暗/.test(name)) return '#b04d91';
  return '#617f91';
}
function elementIcon(name: string): string {
  if (/冷凝|冰/.test(name)) return glacioIcon;
  if (/热熔|火/.test(name)) return fusionIcon;
  if (/导电|雷/.test(name)) return electroIcon;
  if (/气动|风/.test(name)) return aeroIcon;
  if (/衍射|光/.test(name)) return spectroIcon;
  if (/湮灭|暗/.test(name)) return havocIcon;
  return '';
}
function rarityColor(item: RecordValue): string {
  const rarity = numberOf(item, ['starLevel', 'weaponStarLevel', 'rarity', 'quality']);
  return rarity >= 5 ? '#d9b74f' : rarity >= 4 ? '#a75bea' : '#5c9fe0';
}
function isRecommendedProp(prop: RecordValue): boolean {
  return propWeight(prop) > 0;
}
function normalizedPropName(prop: RecordValue): string {
  const name = normalizeStatName(labelOf(prop));
  const value = valueOf(prop);
  return /^(攻击|生命|防御)$/.test(name) && value.includes('%') ? `${name}百分比` : name;
}
function normalizeStatName(name: string): string {
  return name.replace(/[（(]百分比[）)]/g, '百分比').replace(/\s+/g, '');
}
function propWeight(prop: RecordValue): number {
  const name = normalizedPropName(prop);
  if (Object.prototype.hasOwnProperty.call(phantomWeights.value, name))
    return Number(phantomWeights.value[name]) || 0;
  if (officialRecommendedNames.value.has(name)) return 3;
  const element = attributeName(role.value).replace(/属性$/, '');
  if (/暴击伤害|暴击|攻击百分比/.test(name) || (name.includes(element) && /伤害加成/.test(name)))
    return 3;
  if (/共鸣效率|普攻伤害加成|重击伤害加成|共鸣技能伤害加成|共鸣解放伤害加成/.test(name)) return 2;
  if (/^攻击$|生命百分比|防御百分比/.test(name)) return 1;
  return 0;
}
function propMaximum(prop: RecordValue): number {
  const values: Record<string, number> = {
    暴击伤害: 21,
    暴击: 10.5,
    攻击: 60,
    攻击百分比: 11.6,
    生命: 580,
    生命百分比: 11.6,
    防御: 60,
    防御百分比: 14.7,
    共鸣效率: 12.4,
    普攻伤害加成: 11.6,
    重击伤害加成: 11.6,
    共鸣技能伤害加成: 11.6,
    共鸣解放伤害加成: 11.6,
  };
  return values[normalizedPropName(prop)] ?? 1;
}
function propIcon(name: string, source = ''): string {
  if (source) return source;
  const normalized = name.replace(/百分比$/, '');
  const exact = attributesList.value.find(
    (item) => labelOf(item) === name || labelOf(item) === normalized,
  );
  if (exact && imageOf(exact)) return imageOf(exact);
  if (/冷凝|热熔|导电|气动|衍射|湮灭/.test(name)) return elementIcon(name);
  const related = attributesList.value.find((item) => {
    const label = labelOf(item);
    if (/暴击伤害/.test(name)) return /暴击伤害/.test(label);
    if (/暴击/.test(name)) return /^暴击$/.test(label);
    if (/攻击/.test(name)) return /^攻击$/.test(label);
    if (/生命/.test(name)) return /^生命$/.test(label);
    if (/防御/.test(name)) return /^防御$/.test(label);
    if (/共鸣效率/.test(name)) return /共鸣效率/.test(label);
    return false;
  });
  if (related && imageOf(related)) return imageOf(related);
  return elementIcon(attributeName(role.value));
}
function statusForTerm(
  level3: number,
  level2: number,
  level1: number,
): { status: string; score: number } {
  const lower = level2 + level1;
  if (level3 === 2 && lower === 3) return { status: 'ACE', score: 5 };
  if (level3 === 2 && lower === 2) return { status: 'SSS', score: 4 };
  if ((level3 === 2 && lower === 1) || (level3 === 1 && lower === 3))
    return { status: 'SS', score: 3 };
  if (level3 === 2 || (level3 === 1 && lower >= 2)) return { status: 'S', score: 2 };
  return { status: 'N', score: 1 };
}
function statusForValue(
  level3: number,
  level1: number,
  ratio: number,
): { status: string; score: number } {
  if (level3 === 2 && ratio > 3.5) return { status: 'ACE', score: 5 };
  if (level3 === 2 && ratio > 2.8) return { status: 'SSS', score: 4 };
  if ((level3 === 2 && ratio > 2.1) || (level3 === 1 && ratio > 2.4))
    return { status: 'SS', score: 3 };
  if ((level3 === 1 && ratio > 1.6) || (level3 === 2 && ratio > 1.2))
    return { status: 'S', score: 2 };
  return { status: 'N', score: 1 };
}
function echoRating(item: RecordValue) {
  const weights = arrayOf(item.subProps).map(propWeight).filter(Boolean);
  const level3 = weights.filter((value) => value === 3).length;
  const level2 = weights.filter((value) => value === 2).length;
  const level1 = weights.filter((value) => value === 1).length;
  const ratio = arrayOf(item.subProps).reduce((sum, prop) => {
    if (!propWeight(prop)) return sum;
    return sum + Number.parseFloat(valueOf(prop).replace('%', '')) / propMaximum(prop);
  }, 0);
  const term = statusForTerm(level3, level2, level1);
  const value = statusForValue(level3, level1, ratio);
  return { term: term.status, value: value.status, termScore: term.score, valueScore: value.score };
}
function info(text: string): void {
  infoModal.value = text;
}
</script>

<template>
  <section class="roles-workspace">
    <template v-if="!selected">
      <header class="role-controls">
        <div>
          <p class="eyebrow">OWNED RESONATORS</p>
          <h2>
            我的角色 <small>{{ visibleRoles.length }}/{{ roles.length }}</small>
          </h2>
        </div>
        <div class="role-filters">
          <label
            >属性<ThemedSelect
              v-model="attributeFilter"
              :options="
                attributes.map((item) => ({
                  value: item,
                  label: item,
                  icon: item === '全部属性' ? '' : elementIcon(item),
                }))
              "
          /></label>
          <label
            >武器<ThemedSelect
              v-model="weaponFilter"
              :options="weapons.map((item) => ({ value: item, label: item }))"
          /></label>
          <label
            >星级<ThemedSelect
              v-model="rarityFilter"
              :options="rarities.map((item) => ({ value: item, label: item }))"
          /></label>
          <label
            >头像大小<ThemedSelect
              v-model="avatarSize"
              :options="[
                { value: 'large', label: '大' },
                { value: 'small', label: '小' },
              ]"
          /></label>
        </div>
      </header>
      <div class="multi-sort-panel">
        <span>复合排序 <small>优先级按勾选先后排列</small></span>
        <label
          v-for="option in [
            { key: 'rarity', name: '星级' },
            { key: 'level', name: '等级' },
            { key: 'chain', name: '共鸣链' },
            { key: 'attribute', name: '属性' },
            { key: 'weapon', name: '武器' },
          ]"
          :key="option.key"
        >
          <input
            type="checkbox"
            :checked="Boolean(sortRule(option.key as SortKey))"
            @change="toggleSort(option.key as SortKey, ($event.target as HTMLInputElement).checked)"
          />
          <b v-if="sortRule(option.key as SortKey)">{{
            sortRules.findIndex((item) => item.key === option.key) + 1
          }}</b>
          {{ option.name }}
          <ThemedSelect
            :disabled="!sortRule(option.key as SortKey)"
            :model-value="sortRule(option.key as SortKey)?.direction ?? 'desc'"
            :options="[
              { value: 'desc', label: '降序' },
              { value: 'asc', label: '升序' },
            ]"
            @update:model-value="setSortDirection(option.key as SortKey, $event as 'asc' | 'desc')"
          />
        </label>
      </div>
      <div class="role-card-grid" :class="{ compact: avatarSize === 'small' }">
        <button
          v-for="item in visibleRoles"
          :key="String(item.roleId ?? item.id)"
          class="role-card"
          :style="{
            '--role-color': elementColor(attributeName(item)),
            '--rarity-color': rarityColor(item),
          }"
          @click="openRole(item)"
        >
          <HighQualityImage
            v-if="roleCardImage(item)"
            class="role-artwork"
            :src="roleCardImage(item)"
            :alt="roleName(item)"
            :position-y="avatarSize === 'small' ? 0.22 : 0"
          />
          <span class="role-badges">
            <span class="role-attribute"
              ><img :src="elementIcon(attributeName(item))" alt="" />{{ attributeName(item) }}</span
            ><span class="role-chain">{{ numberOf(item, ['chainUnlockNum', 'chainNum']) }}</span>
          </span>
          <b>Lv.{{ numberOf(item, ['level', 'roleLevel']) }}</b
          ><strong>{{ roleName(item) }}</strong
          ><small
            >{{ weaponTypeName(item) }} · {{ numberOf(item, ['starLevel', 'rarity']) || 5 }}★</small
          >
        </button>
      </div>
      <article v-if="!roles.length" class="role-empty">
        {{ error || '暂无角色数据，请先同步。' }}
      </article>
    </template>

    <template v-else>
      <button
        class="role-back secondary-button"
        @click="
          selected = null;
          detail = null;
        "
      >
        ← 返回角色列表
      </button>
      <div class="role-detail-layout">
        <aside class="role-switcher" aria-label="快速切换角色">
          <button
            v-for="item in visibleRoles"
            :key="String(item.roleId ?? item.id)"
            :class="{
              active: String(item.roleId ?? item.id) === String(selected?.roleId ?? selected?.id),
            }"
            :style="{ '--switch-rarity': rarityColor(item) }"
            @click="openRole(item)"
          >
            <img v-if="roleAvatar(item)" :src="roleAvatar(item)" :alt="roleName(item)" />
            <span
              ><b>{{ roleName(item) }}</b
              ><small>Lv.{{ numberOf(item, ['level']) }}</small></span
            >
          </button>
        </aside>
        <main class="role-detail-main">
          <article class="role-hero" :style="heroStyle">
            <button
              v-if="selectedWikiArtwork()?.team"
              class="artwork-toggle secondary-button"
              :title="detailArtwork === 'profile' ? '切换为编队立绘' : '切换为角色立绘'"
              @click="detailArtwork = detailArtwork === 'profile' ? 'team' : 'profile'"
            >
              ⇄
            </button>
            <img
              v-if="detailPortrait()"
              class="role-portrait"
              :src="detailPortrait()"
              :alt="roleName(role)"
            />
            <div class="role-hero-content">
              <div class="role-heading">
                <p class="hero-element">
                  <img :src="elementIcon(attributeName(role))" alt="" />{{ attributeName(role) }}
                </p>
                <h2>
                  {{ roleName(role) }}
                  <small
                    >Lv.{{ numberOf(active, ['level']) || numberOf(role, ['level']) }} · 共鸣链
                    {{ numberOf(role, ['chainUnlockNum', 'chainNum']) }}</small
                  >
                </h2>
              </div>
              <div class="hero-loadout">
                <div class="hero-weapon" :style="{ '--weapon-rarity': rarityColor(weaponInfo) }">
                  <img v-if="imageOf(weaponInfo)" :src="imageOf(weaponInfo)" alt="" />
                  <div>
                    <b>{{ labelOf(weaponInfo) }}</b
                    ><small>Lv.{{ numberOf(weapon, ['level']) }}</small
                    ><small>谐振等级 {{ numberOf(weapon, ['resonLevel']) || 1 }}</small>
                  </div>
                </div>
                <div class="skill-strip">
                  <span v-for="(skill, index) in displaySkills" :key="index">
                    <img
                      v-if="imageOf(nestedRecord(skill, 'skill'))"
                      :src="imageOf(nestedRecord(skill, 'skill'))"
                      alt=""
                    />
                    <b>Lv.{{ numberOf(skill, ['level']) }}</b>
                  </span>
                </div>
              </div>
              <dl class="role-attributes">
                <template v-for="(item, index) in attributesList" :key="index">
                  <dt>
                    <img v-if="imageOf(item)" :src="imageOf(item)" alt="" />{{ labelOf(item) }}
                  </dt>
                  <dd>{{ valueOf(item) }}</dd>
                </template>
              </dl>
            </div>
            <span v-if="loading" class="detail-loading">正在读取详情…</span>
          </article>
          <p v-if="detailError" class="role-detail-error">
            {{ detailError }}
            <button
              v-if="/验证|captcha|安全校验|人机/.test(detailError)"
              class="secondary-button"
              @click="emit('openMobile')"
            >
              打开手机视图完成验证
            </button>
          </p>

          <section class="role-fold" :class="{ collapsed: collapsed.echo }">
            <header @click="toggleSection('echo')">
              <div>
                <h3>声骸数据与评级</h3>
                <button
                  class="info-button"
                  @click.stop="
                    info(
                      '声骸评价分为“词条”和“词条数值”两项。词条评级统计适合当前角色的有效辅音词条数量及权重；数值评级比较有效词条当前数值与该词条最高档数值。单项依次分为 ACE、SSS、SS、S、N 五级。总体评价汇总五个声骸的两项得分：45 分为 ACE，35 分起为 SSS，25 分起为 SS，18 分起为 S，其余为 N。推荐词条会高亮显示；未命中推荐词条或数值档位较低时，评价会相应降低。',
                    )
                  "
                >
                  !
                </button>
              </div>
              <span>{{ collapsed.echo ? '展开' : '收起' }}⌄</span>
            </header>
            <div class="fold-content echo-content">
              <div class="echo-overview">
                <div class="echo-total">
                  <span>总体评价</span><b>{{ echoOverallGrade }}</b
                  ><small
                    >{{ phantoms.length }} 件 · COST {{ numberOf(phantomData, ['cost']) }}</small
                  >
                </div>
                <div class="echo-sets">
                  <article v-for="item in echoSets" :key="item.name">
                    <img v-if="item.icon" :src="item.icon" alt="" />
                    <div>
                      <b>{{ item.name }} ×{{ item.count }}</b>
                      <small v-if="item.count >= 2"><strong>×2</strong> {{ item.effect2 }}</small>
                      <small v-if="item.count >= 5"><strong>×5</strong> {{ item.effect5 }}</small>
                      <small v-if="item.count < 2">尚未激活套装效果</small>
                    </div>
                  </article>
                </div>
              </div>
              <div class="echo-buff-summary">
                <h4>声骸增益详情</h4>
                <span
                  v-for="item in echoBuffs"
                  :key="item.name"
                  :class="{
                    recommended:
                      propWeight({
                        attributeName: item.name,
                        attributeValue: `${item.value}${item.percent ? '%' : ''}`,
                      }) > 0,
                  }"
                  ><img :src="propIcon(item.name, item.icon)" alt="" /><b>{{ item.name }}</b
                  ><em>+{{ Number(item.value.toFixed(1)) }}{{ item.percent ? '%' : '' }}</em></span
                >
              </div>
              <div class="recommend-hit-card">
                <div>
                  <h4>推荐辅音词条命中</h4>
                  <small>按当前角色的专属推荐配置统计已装备声骸命中数量</small>
                </div>
                <span
                  v-for="item in recommendedHits"
                  :key="item.name"
                  :class="{ hit: item.hits > 0 }"
                >
                  <img :src="propIcon(item.name)" alt="" />
                  <b>{{ item.name }}</b
                  ><em>{{ item.hits }} 条</em><small>权重 {{ item.weight }}</small>
                </span>
                <p v-if="!recommendedHits.length">当前角色暂无可用的推荐辅音词条配置</p>
              </div>
              <div class="echo-grid">
                <article v-for="(item, index) in phantoms" :key="index">
                  <div class="echo-head">
                    <img
                      v-if="imageOf(nestedRecord(item, 'phantomProp'))"
                      :src="imageOf(nestedRecord(item, 'phantomProp'))"
                      alt=""
                    />
                    <div>
                      <h4>{{ labelOf(nestedRecord(item, 'phantomProp')) }}</h4>
                      <small
                        >COST {{ numberOf(item, ['cost']) }} · Lv.{{
                          numberOf(item, ['level'])
                        }}</small
                      >
                    </div>
                    <div class="echo-ratings">
                      <span
                        >词条 <b>{{ echoRating(item).term }}</b></span
                      ><span
                        >数值 <b>{{ echoRating(item).value }}</b></span
                      >
                    </div>
                  </div>
                  <dl class="echo-props">
                    <template
                      v-for="(prop, propIndex) in arrayOf(item.mainProps)"
                      :key="`main-${propIndex}`"
                    >
                      <dt :class="{ recommended: isRecommendedProp(prop) }">
                        <img v-if="imageOf(prop)" :src="imageOf(prop)" alt="" />{{ labelOf(prop) }}
                      </dt>
                      <dd :class="{ recommended: isRecommendedProp(prop) }">{{ valueOf(prop) }}</dd>
                    </template>
                    <template
                      v-for="(prop, propIndex) in arrayOf(item.subProps)"
                      :key="`sub-${propIndex}`"
                    >
                      <dt class="sub-prop" :class="{ recommended: isRecommendedProp(prop) }">
                        {{ labelOf(prop) }}
                      </dt>
                      <dd :class="{ recommended: isRecommendedProp(prop) }">{{ valueOf(prop) }}</dd>
                    </template>
                  </dl>
                </article>
                <p v-if="!phantoms.length">暂无声骸详情</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </template>
    <AppDialog
      :open="Boolean(infoModal)"
      backdrop-class="role-modal-backdrop"
      @close="infoModal = ''"
    >
      <article class="dialog-surface role-info-modal">
        <header>
          <h3>声骸评价标准</h3>
          <button @click="infoModal = ''">×</button>
        </header>
        <p>{{ infoModal }}</p>
        <button class="primary-button" @click="infoModal = ''">知道了</button>
      </article>
    </AppDialog>
  </section>
</template>

<style scoped>
.roles-workspace {
  display: grid;
  gap: 12px;
}
.role-controls {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 14px;
}
.role-controls h2 {
  margin: 2px 0;
}
.role-controls h2 small {
  font-size: 11px;
  opacity: 0.5;
}
.role-filters {
  display: flex;
  align-items: end;
  gap: 7px;
}
.role-filters label {
  font-size: 12px;
}
.role-filters select {
  display: block;
  min-width: 112px;
  margin-top: 3px;
  padding: 7px 9px;
}
.role-filters button {
  height: 34px;
}
.multi-sort-panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid var(--t-divider);
  border-radius: 9px;
  background: var(--t-panel);
  font-size: 12px;
}
.multi-sort-panel > span {
  margin-right: 4px;
  font-weight: 700;
}
.multi-sort-panel > span small {
  margin-left: 4px;
  opacity: 0.5;
  font-weight: 400;
}
.multi-sort-panel label {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 5px;
  border-radius: 10px;
  background: var(--t-control);
  border: 1px solid transparent;
  color: var(--t-text) !important;
}
.multi-sort-panel label:has(input:checked) {
  border-color: color-mix(in srgb, var(--t-accent) 65%, transparent);
  background: color-mix(in srgb, var(--t-accent) 14%, var(--t-raised));
}
.multi-sort-panel input {
  margin: 0;
}
.multi-sort-panel label > b {
  display: grid;
  width: 15px;
  height: 15px;
  place-items: center;
  border-radius: 50%;
  background: var(--t-accent);
  color: var(--t-accent-text);
  font-size: 10px;
}
.multi-sort-panel select {
  min-width: 58px;
  padding: 3px 5px;
  border-color: var(--t-divider) !important;
  border-radius: 5px !important;
  background: var(--t-panel) !important;
  color: var(--t-text) !important;
  font-size: 11px;
}
.multi-sort-panel select:disabled {
  opacity: 0.38;
}
.role-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 150px));
  gap: 10px;
  justify-content: start;
}
.role-card {
  --rarity-color: #d9b74f;
  position: relative;
  min-height: 190px;
  padding: 0 !important;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--role-color) 45%, transparent) !important;
  border-radius: 12px !important;
  background: linear-gradient(
    155deg,
    color-mix(in srgb, var(--rarity-color) 32%, #18232a),
    #11191e
  ) !important;
  text-align: left;
}
.role-card > .role-artwork {
  width: 100%;
  height: 132px;
  display: block;
  object-fit: cover;
  object-position: top;
  border-bottom: 4px solid var(--rarity-color);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--rarity-color) 68%, #202830),
    color-mix(in srgb, var(--rarity-color) 22%, #10171c)
  ) !important;
}
.role-card-grid:not(.compact) .role-card > .role-artwork {
  object-fit: cover;
  object-position: top center;
}
.role-card-grid.compact {
  grid-template-columns: repeat(auto-fill, minmax(65px, 90px));
  gap: 6px;
  justify-content: start;
}
.role-card-grid.compact .role-card {
  min-height: 95px;
  border-radius: 8px !important;
}
.role-card-grid.compact .role-card > .role-artwork {
  height: 66px;
  object-fit: cover;
  object-position: center 22%;
  border-bottom-width: 2px;
}
.role-card-grid.compact .role-card > strong {
  padding: 3px 5px 0;
  overflow: hidden;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.role-card-grid.compact .role-card > small {
  display: none;
}
.role-card-grid.compact .role-card > b {
  top: 50px;
  right: 3px;
  font-size: 7px;
}
.role-card-grid.compact .role-badges {
  top: 3px;
  left: 3px;
}
.role-card-grid.compact .role-attribute {
  width: 18px;
  padding: 2px;
  overflow: hidden;
  font-size: 0;
}
.role-card-grid.compact .role-attribute img {
  width: 14px;
  height: 14px;
}
.role-card-grid.compact .role-chain {
  padding: 2px 4px;
  font-size: 7px;
}
.role-card > strong,
.role-card > small {
  display: block;
  padding: 6px 10px 0;
}
.role-card > strong {
  color: #fff !important;
}
.role-card > small {
  padding-top: 1px;
  padding-bottom: 7px;
  font-size: 9px;
  opacity: 0.58;
  color: #dce5e8 !important;
}
.role-card > b {
  position: absolute;
  right: 6px;
  top: 110px;
  padding: 2px 5px;
  border-radius: 5px;
  background: #111b;
  color: #fff;
  font-size: 10px;
}
.role-badges {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 2px;
  color: #fff;
}
.role-attribute,
.role-chain {
  padding: 3px 5px;
  border-radius: 6px;
  background: #0c151ddd;
  font-size: 8px;
  color: #fff !important;
}
.role-attribute {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: color-mix(in srgb, var(--role-color) 78%, white) !important;
}
.role-attribute img,
.hero-element > img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.role-empty {
  padding: 40px;
  text-align: center;
}
.role-back {
  justify-self: start;
}
.role-detail-layout {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.role-switcher {
  position: sticky;
  top: 8px;
  display: grid;
  gap: 5px;
  max-height: calc(100vh - 170px);
  overflow-y: auto;
  padding-right: 4px;
}
.role-switcher button {
  --switch-rarity: #d9b74f;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 58px;
  padding: 6px 8px !important;
  border-color: color-mix(in srgb, var(--switch-rarity) 62%, transparent) !important;
  border-left-width: 4px !important;
  background: var(--t-raised) !important;
  text-align: left;
}
.role-switcher button.active {
  border-color: var(--switch-rarity) !important;
  background: color-mix(in srgb, var(--t-accent) 18%, var(--t-raised)) !important;
}
.role-switcher img {
  width: 42px;
  height: 46px;
  border-radius: 7px;
  object-fit: cover;
  object-position: top;
  border: 2px solid var(--switch-rarity);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--switch-rarity) 48%, transparent),
    color-mix(in srgb, var(--switch-rarity) 14%, var(--t-raised))
  );
}
.role-switcher span,
.role-switcher small {
  display: block;
  min-width: 0;
}
.role-switcher b {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.role-switcher small {
  opacity: 0.58;
  font-size: 10px;
}
.role-detail-main {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.role-hero {
  --role-color: #617f91;
  position: relative;
  min-height: 360px;
  height: auto;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--role-color) 65%, white 15%);
  border-radius: 15px;
  background: linear-gradient(
    105deg,
    color-mix(in srgb, var(--role-color) 60%, #28343c),
    color-mix(in srgb, var(--role-color) 36%, #171e24)
  ) !important;
  isolation: isolate;
}
.role-hero-content {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 12px;
  min-height: 360px;
  height: auto;
  width: 490px;
  min-width: 490px;
  max-width: 490px;
  box-sizing: border-box;
  padding: 18px;
}
.role-heading {
  min-width: 0;
}
.role-heading > p {
  margin: 0;
  color: color-mix(in srgb, var(--role-color) 45%, white);
}
.hero-element {
  display: flex;
  align-items: center;
  gap: 6px;
}
.role-hero h2 {
  margin: 3px 0 0;
  font-size: 24px;
}
.role-hero h2 small {
  font-size: 16px;
}
.role-portrait {
  position: absolute;
  right: -3%;
  bottom: 0;
  width: auto;
  height: 100%;
  max-width: none;
  object-fit: contain;
  object-position: right bottom;
  z-index: 1;
}
.artwork-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  display: grid;
  width: 36px;
  height: 36px;
  min-width: 0;
  place-items: center;
  border-radius: 50%;
  padding: 0;
  font-size: 20px;
}
.role-hero::after {
  content: none;
}
.skill-strip {
  display: flex;
  align-items: center;
  gap: 6px;
}
.skill-strip span {
  display: grid;
  justify-items: center;
  font-size: 9px;
}
.skill-strip img {
  width: 38px;
  height: 38px;
  object-fit: contain;
}
.hero-loadout {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 9px;
  border: 1px solid var(--t-divider);
  border-radius: 12px;
  background: color-mix(in srgb, var(--t-raised) 84%, transparent);
  backdrop-filter: blur(7px);
}
.hero-weapon {
  --weapon-rarity: #d9b74f;
  display: grid;
  grid-template-columns: 52px minmax(90px, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 165px;
  padding: 7px;
  border: 0;
  border-radius: 10px;
  background: transparent;
}
.hero-weapon > img {
  width: 50px;
  height: 50px;
  object-fit: contain;
  border-radius: 7px;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--weapon-rarity) 70%, white),
    var(--weapon-rarity)
  );
}
.hero-weapon b,
.hero-weapon small {
  display: block;
}
.hero-weapon b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.hero-weapon small {
  margin-top: 2px;
  opacity: 0.72;
  font-size: 11px;
}
.role-attributes {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(2, 1fr auto);
  gap: 7px 10px;
  align-self: end;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 12px 14px;
  overflow: auto;
  border-radius: 12px;
  background: #ffffff24;
  backdrop-filter: blur(7px);
}
.role-attributes dt {
  display: flex;
  align-items: center;
  gap: 5px;
  opacity: 0.7;
}
.role-attributes dt img,
.echo-grid dt img {
  width: 14px;
  height: 14px;
  object-fit: contain;
}
.role-attributes dd {
  margin: 0;
  font-weight: 700;
}
.detail-loading {
  position: absolute;
  right: 12px;
  top: 12px;
}
.role-detail-error {
  padding: 9px;
  border-radius: 8px;
  background: #d85d5d1a;
  color: #efaaaa;
}
.role-fold {
  overflow: hidden;
  border: 1px solid var(--t-divider);
  border-radius: 12px;
  background: var(--t-panel);
}
.roles-workspace
  :is(
    .multi-sort-panel,
    .multi-sort-panel label,
    .role-card,
    .role-switcher button,
    .role-hero,
    .hero-loadout,
    .hero-weapon,
    .role-attributes,
    .role-fold,
    .echo-total,
    .echo-sets article,
    .echo-buff-summary,
    .echo-buff-summary span,
    .recommend-hit-card,
    .recommend-hit-card > span,
    .echo-grid > article,
    .echo-props dt,
    .echo-props dd
  ) {
  border-radius: 12px;
}
.role-fold > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  cursor: pointer;
  background: var(--t-raised);
}
.role-fold > header > div {
  display: flex;
  align-items: center;
  gap: 7px;
}
.role-fold h3 {
  margin: 0;
  font-size: 14px;
}
.info-button {
  display: grid !important;
  width: 20px;
  height: 20px;
  min-height: 0 !important;
  padding: 0 !important;
  place-items: center;
  border-radius: 50% !important;
  font-size: 11px;
}
.role-modal-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.62);
  padding: 24px;
}
.role-info-modal {
  width: min(520px, 92vw);
  border: 1px solid var(--dialog-line);
  border-radius: 13px;
  background: var(--dialog-bg) !important;
  padding: 16px;
  box-shadow: var(--dialog-shadow);
  backdrop-filter: blur(24px) saturate(1.18);
}
.role-info-modal header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.role-info-modal h3 {
  margin: 0;
}
.role-info-modal header button {
  min-width: 34px;
  padding: 4px;
  font-size: 20px;
}
.role-info-modal p {
  line-height: 1.75;
  white-space: pre-line;
}
.role-info-modal > button {
  display: block;
  min-width: 110px;
  margin-left: auto;
}
.role-fold.collapsed .fold-content {
  display: none;
}
.fold-content {
  padding: 12px;
}
.echo-grid dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 9px;
  margin: 0;
}
.echo-grid dt {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.echo-grid dd {
  margin: 0;
  font-weight: 600;
}
.echo-content {
  display: grid;
  gap: 10px;
}
.echo-overview {
  display: grid;
  grid-template-columns: 135px 1fr;
  gap: 9px;
}
.echo-total {
  display: grid;
  align-content: center;
  justify-items: center;
  padding: 12px;
  border: 1px solid var(--t-divider);
  border-radius: 10px;
  background: var(--t-raised);
}
.echo-total > span,
.echo-total > small {
  opacity: 0.6;
  font-size: 9px;
}
.echo-total > b {
  color: #c273ff;
  font-size: 30px;
}
.echo-sets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 7px;
}
.echo-sets article {
  display: grid;
  grid-template-columns: 38px 1fr;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--t-divider);
  border-radius: 9px;
  background: var(--t-raised);
}
.echo-sets img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.echo-sets b,
.echo-sets small {
  display: block;
}
.echo-sets b {
  font-size: 13px;
}
.echo-sets small {
  margin-top: 3px;
  opacity: 0.6;
  font-size: 12px;
  line-height: 1.5;
}
.echo-sets small strong {
  color: #d7b544;
}
.echo-buff-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px;
  padding: 9px;
  border: 1px solid var(--t-divider);
  border-radius: 9px;
  background: var(--t-raised);
}
.echo-buff-summary h4 {
  grid-column: 1 / -1;
  margin: 0 0 7px;
}
.echo-buff-summary span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 7px 9px;
  border-radius: 6px;
  background: var(--t-panel);
  font-size: 11px;
}
.echo-buff-summary span.recommended {
  color: #e4c04f;
  background: #d6aa2918;
}
.echo-buff-summary img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.echo-buff-summary em {
  margin-left: auto;
  color: #d8b84d;
  font-style: normal;
  font-weight: 700;
}
.recommend-hit-card {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--t-divider);
  border-radius: 10px;
  background: var(--t-raised);
}
.recommend-hit-card > div {
  grid-column: 1 / -1;
}
.recommend-hit-card h4 {
  margin: 0;
  font-size: 13px;
}
.recommend-hit-card > div small {
  font-size: 10px;
}
.recommend-hit-card > span {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  gap: 5px;
  padding: 7px 8px;
  border: 1px solid var(--t-divider);
  border-radius: 8px;
  background: var(--t-panel);
  opacity: 0.62;
}
.recommend-hit-card > span.hit {
  border-color: #d5ae39;
  background: #d5ae3918;
  opacity: 1;
}
.recommend-hit-card img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.recommend-hit-card b,
.recommend-hit-card em {
  font-size: 10px;
}
.recommend-hit-card em {
  color: #e1bd4e;
  font-style: normal;
  font-weight: 700;
}
.recommend-hit-card > span small {
  grid-column: 2 / -1;
  font-size: 8px;
}
.recommend-hit-card > p {
  grid-column: 1 / -1;
  margin: 0;
}
:global(.shell.theme-glass)
  :is(
    .role-fold,
    .echo-total,
    .echo-sets article,
    .echo-buff-summary,
    .recommend-hit-card,
    .echo-grid > article
  ) {
  border-color: color-mix(in srgb, var(--t-line) 74%, transparent);
  background: color-mix(in srgb, var(--t-raised) 56%, rgba(10, 27, 34, 0.82));
  box-shadow:
    inset 0 1px 0 #ffffff18,
    0 8px 22px #00000016;
  backdrop-filter: blur(15px) saturate(1.18);
}
:global(.shell.theme-glass) :is(.echo-buff-summary span, .recommend-hit-card > span) {
  background: color-mix(in srgb, var(--t-panel) 48%, rgba(8, 23, 29, 0.78));
  backdrop-filter: blur(10px);
}
:global(.shell.theme-glass) .multi-sort-panel label {
  background: color-mix(in srgb, var(--t-control) 62%, rgba(9, 25, 31, 0.8));
  color: #eef7f8 !important;
}
:global(.shell.theme-dark) .multi-sort-panel label {
  color: #e7eef0 !important;
}
:global(.shell.theme-light) .multi-sort-panel label {
  color: #17282e !important;
}
:global(.shell.theme-light) :is(.role-attribute, .role-chain, .role-card > b) {
  background: rgba(15, 24, 29, 0.9) !important;
  color: #fff !important;
  text-shadow: 0 1px 2px #000;
}
.echo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
}
.echo-grid > article {
  padding: 10px;
  border: 1px solid var(--t-divider);
  border-radius: 9px;
  background: var(--t-raised);
}
.echo-head {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.echo-head img {
  width: 42px;
  height: 42px;
  object-fit: contain;
}
.echo-head h4 {
  margin: 0;
}
.echo-ratings {
  display: grid;
  gap: 2px;
  font-size: 8px;
}
.echo-ratings span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.echo-ratings b {
  color: #b65cff;
  font-size: 13px;
}
.echo-grid dl {
  margin-top: 9px;
  font-size: 10px;
}
.echo-props dt,
.echo-props dd {
  min-height: 22px;
  padding: 3px 5px;
  border: 1px solid color-mix(in srgb, var(--t-divider) 65%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--t-panel) 72%, transparent);
}
.echo-props dd {
  text-align: right;
}
.echo-props .sub-prop::before {
  content: '•';
  margin-right: 6px;
  opacity: 0.6;
}
.echo-props .recommended {
  color: #e4c04f;
  background: #d6aa2918;
  font-weight: 700;
}
.chain-list {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.chain-list article {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 8px;
  opacity: 0.4;
}
.chain-list article.unlocked {
  opacity: 1;
}
.chain-list img {
  width: 42px;
  height: 42px;
  object-fit: contain;
}
.chain-list span {
  font-size: 9px;
  text-align: center;
}
.chain-list small {
  display: -webkit-box;
  overflow: hidden;
  opacity: 0.55;
  font-size: 8px;
  line-height: 1.35;
  text-align: center;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.skill-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
}
.skill-detail-grid article {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--t-divider);
  border-radius: 9px;
  background: var(--t-raised);
}
.skill-detail-grid img {
  width: 42px;
  height: 42px;
  object-fit: contain;
}
.skill-detail-grid h4 {
  margin: 0;
  font-size: 11px;
}
.skill-detail-grid h4 b {
  color: var(--t-accent);
}
.skill-detail-grid p {
  margin: 5px 0 0;
  opacity: 0.7;
  font-size: 9px;
  line-height: 1.55;
  white-space: pre-line;
}
@media (max-width: 850px) {
  .role-controls {
    align-items: stretch;
    flex-direction: column;
  }
  .role-filters {
    flex-wrap: wrap;
  }
  .role-hero-info {
    width: 74%;
  }
  .role-detail-layout {
    grid-template-columns: 1fr;
  }
  .role-switcher {
    position: static;
    grid-auto-flow: column;
    grid-auto-columns: 130px;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .chain-list {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
