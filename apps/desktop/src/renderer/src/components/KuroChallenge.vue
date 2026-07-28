<script setup lang="ts">
import { computed, ref, watch } from 'vue';

type RecordValue = Record<string, unknown>;

const props = defineProps<{
  data: RecordValue | null;
  error: string | undefined;
}>();

const activeKey = ref('tower');
const categories = computed(() => {
  const hologram = asRecord(props.data?.hologram);
  const extras = Object.entries(hologram)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => ({ key: `extra-${key}`, name: labelOf(key), data: asRecord(value) }))
    .filter((item) => recordsOf(item.data).length)
    .slice(0, 8);
  return [
    {
      key: 'tower',
      name: '逆境深塔',
      data: asRecord(props.data?.tower),
    },
    {
      key: 'slash',
      name: '冥歌海墟',
      data: asRecord(props.data?.slash),
    },
    {
      key: 'newTower',
      name: '终焉矩阵',
      data: asRecord(props.data?.newTower),
    },
    {
      key: 'hologram',
      name: '全息战略',
      data: hologram,
    },
    {
      key: 'overview',
      name: '其他周期玩法',
      data: asRecord(props.data?.overview),
    },
    ...extras,
  ];
});
const activeCategory = computed(
  () => categories.value.find((item) => item.key === activeKey.value) ?? categories.value[0],
);
watch(categories, (items) => {
  if (!items.some((item) => item.key === activeKey.value))
    activeKey.value = items[0]?.key ?? 'tower';
});

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
}

function scalarEntries(value: RecordValue): Array<[string, string]> {
  return Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && typeof item !== 'object')
    .map(([key, item]) => [
      labelOf(key),
      typeof item === 'boolean' ? (item ? '是' : '否') : String(item),
    ]);
}

function recordsOf(value: RecordValue): RecordValue[] {
  const records: RecordValue[] = [];
  const seen = new Set<unknown>();
  function visit(node: unknown): void {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    const record = node as RecordValue;
    if (scalarEntries(record).length >= 2) records.push(record);
    for (const child of Object.values(record)) visit(child);
  }
  visit(value);
  return records.slice(0, 60);
}

function recordTitle(value: RecordValue, index: number): string {
  return String(
    value.title ??
      value.name ??
      value.difficultyName ??
      value.floorName ??
      value.areaName ??
      value.roleName ??
      `记录 ${index + 1}`,
  );
}

function labelOf(key: string): string {
  return (
    (
      {
        name: '名称',
        title: '标题',
        difficultyName: '难度',
        floorName: '层级',
        areaName: '区域',
        roleName: '角色',
        score: '得分',
        totalScore: '总分',
        star: '星级',
        starNum: '星数',
        totalStar: '总星数',
        maxStar: '最高星数',
        pass: '已通关',
        isPass: '已通关',
        challengeTime: '挑战时间',
        endTime: '结束时间',
        seasonEndTime: '赛季结束',
        rank: '排名',
        level: '等级',
        challengeList: '挑战记录',
        bossList: '首领挑战',
        phantom: '全息战略',
        strongChallenge: '强者之路',
        achievement: '挑战成就',
      } as Record<string, string>
    )[key] ?? key.replace(/([A-Z])/g, ' $1')
  );
}
</script>

<template>
  <section class="challenge-workspace">
    <header>
      <div>
        <p class="eyebrow">CHALLENGE RECORDS</p>
        <h2>挑战数据</h2>
      </div>
      <span
        >{{ categories.filter((item) => Object.keys(item.data).length).length }}/{{
          categories.length
        }}
        已同步</span
      >
    </header>

    <nav class="challenge-tabs" aria-label="挑战玩法">
      <button
        v-for="category in categories"
        :key="category.key"
        type="button"
        :class="{ active: category.key === activeCategory?.key }"
        @click="activeKey = category.key"
      >
        <span>{{ category.name }}</span
        ><small>{{ recordsOf(category.data).length }}</small>
      </button>
    </nav>

    <section v-if="activeCategory" class="challenge-section">
      <div class="challenge-heading">
        <h3>{{ activeCategory.name }}</h3>
        <span>{{ recordsOf(activeCategory.data).length }} 条记录</span>
      </div>
      <div v-if="scalarEntries(activeCategory.data).length" class="challenge-summary">
        <dl v-for="entry in scalarEntries(activeCategory.data).slice(0, 8)" :key="entry[0]">
          <dt>{{ entry[0] }}</dt>
          <dd>{{ entry[1] }}</dd>
        </dl>
      </div>
      <div v-if="recordsOf(activeCategory.data).length" class="challenge-grid">
        <article
          v-for="(record, index) in recordsOf(activeCategory.data)"
          :key="`${activeCategory.key}-${index}`"
        >
          <h4>{{ recordTitle(record, index) }}</h4>
          <dl>
            <template v-for="entry in scalarEntries(record).slice(0, 10)" :key="entry[0]">
              <dt>{{ entry[0] }}</dt>
              <dd>{{ entry[1] }}</dd>
            </template>
          </dl>
        </article>
      </div>
      <p v-else class="challenge-empty">暂无可用记录</p>
    </section>

    <p v-if="error && !categories.some((item) => Object.keys(item.data).length)" class="error">
      {{ error }}
    </p>
  </section>
</template>

<style scoped>
.challenge-workspace {
  display: grid;
  gap: 14px;
}
.challenge-workspace > header,
.challenge-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.challenge-workspace h2,
.challenge-workspace h3,
.challenge-workspace h4 {
  margin: 0;
}
.challenge-workspace > header > span,
.challenge-heading span {
  color: var(--t-muted);
  font-size: 12px;
}
.challenge-section {
  border-top: 1px solid var(--t-divider);
  padding-top: 12px;
}
.challenge-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 3px;
}
.challenge-tabs button {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  border: 1px solid var(--t-divider);
  border-radius: 6px;
  padding: 0 10px;
  color: var(--t-muted);
  background: var(--t-control);
  cursor: pointer;
}
.challenge-tabs button.active {
  border-color: var(--t-accent);
  color: var(--t-strong);
}
.challenge-tabs small {
  color: var(--t-accent);
}
.challenge-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 7px;
  margin-bottom: 10px;
}
.challenge-summary dl {
  margin: 0;
  border-left: 2px solid var(--t-accent);
  padding: 5px 8px;
}
.challenge-summary dt {
  color: var(--t-muted);
  font-size: 11px;
}
.challenge-summary dd {
  margin: 2px 0 0;
  color: var(--t-strong);
  font-weight: 700;
}
.challenge-heading {
  margin-bottom: 9px;
}
.challenge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
}
.challenge-grid article {
  min-width: 0;
  border: 1px solid var(--t-divider);
  border-radius: 8px;
  background: var(--t-panel);
  padding: 11px;
}
.challenge-grid h4 {
  overflow: hidden;
  margin-bottom: 8px;
  color: var(--t-strong);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.challenge-grid dl {
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  gap: 5px 9px;
  margin: 0;
  font-size: 12px;
}
.challenge-grid dt {
  color: var(--t-muted);
}
.challenge-grid dd {
  overflow: hidden;
  margin: 0;
  color: var(--t-text);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.challenge-empty,
.error {
  margin: 0;
  border: 1px dashed var(--t-divider);
  border-radius: 8px;
  padding: 18px;
  color: var(--t-muted);
  text-align: center;
}
.error {
  color: var(--t-danger);
}
</style>
