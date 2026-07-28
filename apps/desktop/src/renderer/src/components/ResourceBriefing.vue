<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import astriteIcon from '../assets/resource-briefing/astrite.png';
import forgingTideIcon from '../assets/resource-briefing/forging-tide.png';
import lustrousTideIcon from '../assets/resource-briefing/lustrous-tide.png';
import radiantTideIcon from '../assets/resource-briefing/radiant-tide.png';
import shellCreditIcon from '../assets/resource-briefing/shell-credit.png';
import ThemedSelect from './ThemedSelect.vue';
import type {
  KuroResourceBriefing,
  KuroResourceItem,
  KuroResourcePeriod,
  KuroResourcePeriodType,
} from '@wwbox/contracts';

const props = defineProps<{
  accountId: string;
  roleId: string | undefined;
  periods: Record<string, unknown> | null;
  initialData: Record<string, unknown> | null;
  error: string | undefined;
}>();

type ResourceKind = 'star' | 'goldTide' | 'lustrousTide' | 'coin';
const resourceIcons: Record<ResourceKind, { src: string; alt: string }[]> = {
  star: [
    {
      src: astriteIcon,
      alt: '星声',
    },
  ],
  goldTide: [
    {
      src: radiantTideIcon,
      alt: '浮金波纹',
    },
    {
      src: forgingTideIcon,
      alt: '铸潮波纹',
    },
  ],
  lustrousTide: [
    {
      src: lustrousTideIcon,
      alt: '唤声涡纹',
    },
  ],
  coin: [
    {
      src: shellCreditIcon,
      alt: '贝币',
    },
  ],
};
const periodType = ref<KuroResourcePeriodType>('version');
const selectedPeriodIndex = ref<number | null>(null);
const briefing = ref<KuroResourceBriefing | null>(null);
const resourceKind = ref<ResourceKind>('star');
const viewMode = ref<'chart' | 'table'>('chart');
const sortMode = ref<'default' | 'desc' | 'asc' | 'name'>('default');
const loading = ref(false);
const localError = ref('');

const periodGroups = computed(() => {
  const source = props.periods ?? {};
  return {
    version: normalizePeriods(source.versions),
    month: normalizePeriods(source.months),
    week: normalizePeriods(source.weeks),
  };
});
const availablePeriods = computed(() => periodGroups.value[periodType.value]);
const selectedPeriod = computed(
  () =>
    availablePeriods.value.find((item) => item.index === selectedPeriodIndex.value) ??
    availablePeriods.value[0] ??
    null,
);
const summary = computed(() => {
  const raw = briefing.value?.raw ?? props.initialData ?? {};
  const starList = briefing.value?.starList ?? normalizeItems(raw.starList);
  const coinList = briefing.value?.coinList ?? normalizeItems(raw.coinList);
  return {
    star: briefing.value?.totalStar ?? numberFrom(raw, ['totalStar', 'star', 'starNum']),
    coin: briefing.value?.totalCoin ?? numberFrom(raw, ['totalCoin', 'coin', 'coinNum']),
    goldTide:
      numberFrom(raw, [
        'totalGold',
        'totalGoldTide',
        'totalRadiantTide',
        'totalForgingTide',
        'totalForging',
        'totalRadiant',
        'goldTide',
      ]) || sumMatching([...starList, ...coinList], /浮金|铸潮|radiant|forging/i),
    lustrousTide:
      numberFrom(raw, [
        'totalLustrous',
        'totalLustrousTide',
        'totalLustrousWave',
        'lustrousTide',
      ]) || sumMatching([...starList, ...coinList], /唤声|lustrous/i),
  };
});
const details = computed(() => {
  const raw = briefing.value?.raw ?? props.initialData ?? {};
  let items: KuroResourceItem[];
  if (resourceKind.value === 'star')
    items = briefing.value?.starList ?? normalizeItems(raw.starList);
  else if (resourceKind.value === 'coin')
    items = briefing.value?.coinList ?? normalizeItems(raw.coinList);
  else if (resourceKind.value === 'goldTide') {
    items = firstItems(raw, ['goldList', 'goldTideList', 'radiantList', 'forgingList']);
    if (!items.length) items = matchingItems(raw, /gold|radiant|forging/i);
  } else {
    items = firstItems(raw, ['lustrousList', 'lustrousTideList', 'waveList']);
    if (!items.length) items = matchingItems(raw, /lustrous/i);
  }
  if (!items.length) items = defaultCategories.map((type) => ({ type, num: 0 }));
  const output = items.map((item, index) => ({ ...item, index }));
  if (sortMode.value === 'desc') output.sort((a, b) => b.num - a.num);
  if (sortMode.value === 'asc') output.sort((a, b) => a.num - b.num);
  if (sortMode.value === 'name') output.sort((a, b) => a.type.localeCompare(b.type, 'zh-CN'));
  return output;
});
const detailTotal = computed(() => details.value.reduce((sum, item) => sum + item.num, 0));
const resourceName = computed(
  () =>
    ({ star: '星声', goldTide: '浮金波纹 & 铸潮波纹', lustrousTide: '唤声涡纹', coin: '贝币' })[
      resourceKind.value
    ],
);
const chartGradient = computed(() => {
  if (!detailTotal.value) return '#27323b 0deg 360deg';
  let cursor = 0;
  return details.value
    .map((item, index) => {
      const start = cursor;
      cursor += (item.num / detailTotal.value) * 360;
      return `${colors[index % colors.length]} ${start}deg ${cursor}deg`;
    })
    .join(',');
});

watch(
  [periodType, availablePeriods],
  () => {
    selectedPeriodIndex.value = availablePeriods.value[0]?.index ?? null;
  },
  { immediate: true },
);
watch(
  selectedPeriod,
  (period) => {
    if (period) void loadBriefing(period);
  },
  { immediate: true },
);
watch(
  () => props.accountId,
  () => {
    briefing.value = null;
    if (selectedPeriod.value) void loadBriefing(selectedPeriod.value);
  },
);

async function loadBriefing(period: KuroResourcePeriod): Promise<void> {
  loading.value = true;
  localError.value = '';
  try {
    briefing.value = await window.wwbox.kuro.resourceBriefing(
      props.accountId,
      props.roleId,
      periodType.value,
      period,
    );
  } catch (error) {
    localError.value =
      error instanceof Error
        ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
        : '资源简报加载失败';
  } finally {
    loading.value = false;
  }
}
function normalizePeriods(value: unknown): KuroResourcePeriod[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
    .map((item) => ({ title: String(item.title ?? ''), index: Number(item.index ?? 0) }))
    .filter((item) => item.title && Number.isInteger(item.index))
    .sort((a, b) => b.index - a.index);
}
function normalizeItems(value: unknown): KuroResourceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
    .map((item) => ({
      type: String(item.type ?? item.name ?? '其他'),
      num: Number(item.num ?? item.count ?? 0),
    }))
    .filter((item) => Number.isFinite(item.num));
}
function firstItems(raw: Record<string, unknown>, keys: string[]): KuroResourceItem[] {
  for (const key of keys) {
    const result = normalizeItems(raw[key]);
    if (result.length) return result;
  }
  return [];
}
function matchingItems(raw: Record<string, unknown>, pattern: RegExp): KuroResourceItem[] {
  for (const [key, value] of Object.entries(raw)) {
    if (!pattern.test(key)) continue;
    const result = normalizeItems(value);
    if (result.length) return result;
  }
  return [];
}
function numberFrom(raw: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return 0;
}
function sumMatching(items: KuroResourceItem[], pattern: RegExp): number {
  return items.filter((item) => pattern.test(item.type)).reduce((sum, item) => sum + item.num, 0);
}
function percentage(value: number): string {
  return detailTotal.value ? `${((value / detailTotal.value) * 100).toFixed(1)}%` : '0%';
}
const defaultCategories = [
  '日常挑战',
  '其他',
  '大世界探索',
  '活动奖励',
  '任务获取',
  '玩法奖励',
  '海市兑换',
];
const colors = ['#ff786a', '#f4b84c', '#eed653', '#91d17a', '#50c4c7', '#548fd2', '#a96bd4'];
</script>

<template>
  <section class="briefing-shell">
    <header class="briefing-tabs">
      <div>
        <p class="eyebrow">RESOURCE BRIEFING</p>
        <h2>资源简报</h2>
      </div>
      <nav aria-label="资源统计周期">
        <button
          v-for="item in [
            ['version', '版本'],
            ['month', '月份'],
            ['week', '周'],
          ] as const"
          :key="item[0]"
          :class="{ active: periodType === item[0] }"
          :aria-pressed="periodType === item[0]"
          @click="periodType = item[0]"
        >
          {{ item[1] }}
        </button>
      </nav>
    </header>

    <div class="briefing-section-heading">
      <div>
        <i />
        <h3>收入总览</h3>
        <small>INCOME OVERVIEW</small>
      </div>
      <ThemedSelect
        class="period-select"
        :model-value="selectedPeriodIndex ?? ''"
        :disabled="!availablePeriods.length"
        :options="availablePeriods.map((period) => ({ value: period.index, label: period.title }))"
        @change="selectedPeriodIndex = Number($event)"
      />
    </div>

    <div class="income-grid" :class="{ loading }">
      <article class="income-card star">
        <span class="resource-icon-stack">
          <img v-for="icon in resourceIcons.star" :key="icon.src" :src="icon.src" :alt="icon.alt" />
        </span>
        <div>
          <small>星声</small><strong>{{ summary.star.toLocaleString() }}</strong>
        </div>
      </article>
      <article class="income-card gold">
        <span class="resource-icon-stack paired">
          <img
            v-for="icon in resourceIcons.goldTide"
            :key="icon.src"
            :src="icon.src"
            :alt="icon.alt"
          />
        </span>
        <div>
          <small>浮金波纹 & 铸潮波纹</small><strong>{{ summary.goldTide.toLocaleString() }}</strong>
        </div>
      </article>
      <article class="income-card tide">
        <span class="resource-icon-stack">
          <img
            v-for="icon in resourceIcons.lustrousTide"
            :key="icon.src"
            :src="icon.src"
            :alt="icon.alt"
          />
        </span>
        <div>
          <small>唤声涡纹</small><strong>{{ summary.lustrousTide.toLocaleString() }}</strong>
        </div>
      </article>
      <article class="income-card coin">
        <span class="resource-icon-stack">
          <img v-for="icon in resourceIcons.coin" :key="icon.src" :src="icon.src" :alt="icon.alt" />
        </span>
        <div>
          <small>贝币</small><strong>{{ summary.coin.toLocaleString() }}</strong>
        </div>
      </article>
    </div>

    <p v-if="localError || error" class="briefing-error">{{ localError || error }}</p>

    <div class="briefing-divider" />
    <div class="briefing-section-heading detail-title">
      <div>
        <i />
        <h3>资源明细</h3>
        <small>RESOURCE DETAILS</small>
      </div>
      <ThemedSelect
        v-model="resourceKind"
        class="resource-select"
        :options="[
          { value: 'star', label: '星声' },
          { value: 'goldTide', label: '浮金波纹 & 铸潮波纹' },
          { value: 'lustrousTide', label: '唤声涡纹' },
          { value: 'coin', label: '贝币' },
        ]"
      />
    </div>

    <div class="detail-panel">
      <header>
        <div>
          <span
            class="detail-resource-icon"
            :class="{ paired: resourceIcons[resourceKind].length > 1 }"
          >
            <img
              v-for="icon in resourceIcons[resourceKind]"
              :key="icon.src"
              :src="icon.src"
              :alt="icon.alt"
            />
          </span>
          <ThemedSelect
            v-model="sortMode"
            class="sort-select"
            :options="[
              { value: 'default', label: '默认排序' },
              { value: 'desc', label: '数量降序' },
              { value: 'asc', label: '数量升序' },
              { value: 'name', label: '名称排序' },
            ]"
          />
        </div>
        <div class="view-switch">
          <button
            :class="{ active: viewMode === 'chart' }"
            :aria-pressed="viewMode === 'chart'"
            @click="viewMode = 'chart'"
          >
            占比图</button
          ><button
            :class="{ active: viewMode === 'table' }"
            :aria-pressed="viewMode === 'table'"
            @click="viewMode = 'table'"
          >
            表格
          </button>
        </div>
      </header>

      <div v-if="viewMode === 'chart'" class="chart-layout">
        <div class="donut-wrap">
          <div class="donut" :style="{ background: `conic-gradient(${chartGradient})` }">
            <div>
              <strong>{{ detailTotal.toLocaleString() }}</strong
              ><span>{{ resourceName }}</span>
            </div>
          </div>
        </div>
        <ul class="legend">
          <li v-for="(item, index) in details" :key="`${item.type}-${index}`">
            <i :style="{ background: colors[index % colors.length] }" /><span>{{ item.type }}</span
            ><strong>{{ item.num.toLocaleString() }}</strong
            ><b>{{ percentage(item.num) }}</b>
          </li>
        </ul>
      </div>

      <div v-else class="resource-table-wrap">
        <table>
          <thead>
            <tr>
              <th>资源类型</th>
              <th>获取数量</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in details" :key="`${item.type}-${index}`">
              <td><i :style="{ background: colors[index % colors.length] }" />{{ item.type }}</td>
              <td>{{ item.num.toLocaleString() }}</td>
              <td>{{ percentage(item.num) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>合计</td>
              <td>{{ detailTotal.toLocaleString() }}</td>
              <td>100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <footer class="briefing-notes">
      <p>数据统计截至昨日（自然日），每日 6:00 刷新。</p>
      <p>充值、邮件（兑换码除外）及月相兑换获得的相关资源不纳入统计。</p>
      <p>展示结果仅供参考，请以游戏内实际数据为准。</p>
    </footer>
  </section>
</template>

<style scoped>
.briefing-shell {
  --gold: #d5ad61;
  --panel: rgba(13, 22, 29, 0.78);
  --control-bg: #111d24;
  --control-border: rgba(213, 173, 97, 0.55);
  --control-text: #edf3f3;
  --option-bg: #111d24;
  --switch-bg: #071016;
  --inner-bg: #111c23;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.briefing-tabs {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.briefing-tabs h2 {
  font-size: 25px;
  margin: 2px 0 10px;
}
.briefing-tabs nav {
  display: flex;
  gap: 4px;
}
.briefing-tabs nav button {
  min-width: 86px;
  padding: 10px 18px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  background: var(--control-bg);
  color: var(--control-text);
  opacity: 0.78;
  transition: 0.18s ease;
}
.briefing-tabs nav button.active {
  background: linear-gradient(180deg, #e0bf7d, #b88a3b);
  color: #1c1710;
  font-weight: 800;
  border-color: #ebca88;
  box-shadow:
    0 -2px 14px rgba(213, 173, 97, 0.28),
    inset 0 1px #fff8;
  opacity: 1;
}
.briefing-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.briefing-section-heading > div {
  display: grid;
  grid-template-columns: 5px auto;
  column-gap: 9px;
}
.briefing-section-heading i {
  grid-row: 1/3;
  width: 5px;
  border-radius: 3px;
  background: var(--gold);
}
.briefing-section-heading h3 {
  margin: 0;
  font-size: 20px;
}
.briefing-section-heading small {
  font-size: 8px;
  letter-spacing: 3px;
  opacity: 0.36;
}
.briefing-shell select {
  color-scheme: dark;
  border: 1px solid var(--control-border);
  background-color: var(--control-bg);
  color: var(--control-text);
}
.briefing-shell select:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.briefing-shell select option {
  background: var(--option-bg);
  color: var(--control-text);
}
.briefing-section-heading select {
  width: auto;
  min-width: 170px;
  border-color: #c9a25a;
  background: linear-gradient(180deg, rgba(208, 164, 87, 0.94), rgba(165, 119, 46, 0.94));
  color: #fff;
  font-weight: 700;
}
.income-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  transition: opacity 0.2s;
}
.income-grid.loading {
  opacity: 0.45;
}
.income-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px;
  border: 1px solid rgba(220, 190, 128, 0.38);
  border-radius: 13px;
  background: linear-gradient(135deg, rgba(240, 225, 187, 0.12), rgba(255, 255, 255, 0.035));
  box-shadow: inset 0 0 20px rgba(230, 199, 130, 0.05);
}
.resource-icon-stack {
  flex: none;
  position: relative;
  width: 48px;
  height: 48px;
}
.resource-icon-stack img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.34));
}
.resource-icon-stack.paired img {
  position: absolute;
  width: 38px;
  height: 38px;
}
.resource-icon-stack.paired img:first-child {
  left: -2px;
  top: -1px;
}
.resource-icon-stack.paired img:last-child {
  right: -2px;
  bottom: -1px;
}
.income-card small,
.income-card strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.income-card small {
  white-space: nowrap;
  opacity: 0.72;
}
.income-card strong {
  font-size: 22px;
  margin-top: 3px;
}
.briefing-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(218, 188, 125, 0.6), transparent);
  margin: 5px 0;
}
.detail-panel {
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  background: var(--panel);
  overflow: hidden;
}
.detail-panel > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.035);
}
.detail-panel > header > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-resource-icon {
  width: 30px;
  height: 30px;
  position: relative;
  flex: none;
}
.detail-resource-icon img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}
.detail-resource-icon.paired img {
  position: absolute;
  width: 23px;
  height: 23px;
}
.detail-resource-icon.paired img:first-child {
  left: -2px;
  top: -1px;
}
.detail-resource-icon.paired img:last-child {
  right: -2px;
  bottom: -1px;
}
.detail-panel select {
  margin: 0;
  width: auto;
  min-width: 112px;
}
.view-switch {
  padding: 3px;
  border-radius: 9px;
  border: 1px solid var(--control-border);
  background: var(--switch-bg);
}
.view-switch button {
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  padding: 6px 12px;
  border-radius: 7px;
  opacity: 0.72;
  transition: 0.18s ease;
}
.view-switch button.active {
  border-color: #e8c77f;
  background: linear-gradient(180deg, #ddb971, #b8873c);
  color: #17120b;
  font-weight: 800;
  box-shadow:
    0 0 12px rgba(213, 173, 97, 0.3),
    inset 0 1px #fff7;
  opacity: 1;
}
.chart-layout {
  display: grid;
  grid-template-columns: minmax(170px, 0.7fr) 1.3fr;
  align-items: center;
  min-height: 280px;
  padding: 18px;
}
.donut-wrap {
  display: grid;
  place-items: center;
}
.donut {
  width: 180px;
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.donut > div {
  width: 112px;
  aspect-ratio: 1;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--inner-bg);
  box-shadow: 0 0 25px #0005;
}
.donut strong {
  font-size: 24px;
}
.donut span {
  font-size: 11px;
  opacity: 0.55;
  margin-top: 4px;
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 16px;
}
.legend li {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto 48px;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}
.legend li i,
.resource-table-wrap td i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.legend li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legend li b {
  font-weight: 500;
  text-align: right;
  opacity: 0.65;
}
.resource-table-wrap {
  max-height: 340px;
  overflow: auto;
  padding: 8px 12px 14px;
}
.resource-table-wrap table {
  width: 100%;
  border-collapse: collapse;
}
.resource-table-wrap th,
.resource-table-wrap td {
  padding: 9px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.resource-table-wrap th {
  font-size: 11px;
  opacity: 0.56;
}
.resource-table-wrap td i {
  display: inline-block;
  margin-right: 8px;
}
.resource-table-wrap tfoot {
  font-weight: 700;
  color: #e2c27c;
}
.briefing-notes {
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.48;
}
.briefing-notes p {
  margin: 2px 0;
}
.briefing-notes p::before {
  content: '※ ';
}
.briefing-error {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #d85d5d1a;
  color: #efaaaa;
}
:global(.shell.theme-light) .briefing-shell {
  --panel: rgba(255, 255, 255, 0.88);
  --control-bg: #fffdf8;
  --control-border: rgba(151, 105, 39, 0.72);
  --control-text: #25343a;
  --option-bg: #fffdf8;
  --switch-bg: #eee6d8;
  --inner-bg: #f7f3ea;
}
:global(.shell.theme-light) .briefing-shell select {
  color-scheme: light;
}
@media (max-width: 1100px) {
  .income-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
