<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type {
  KuroAccount,
  KuroDashboard,
  KuroLoginMethod,
  KuroOperationResult,
  KuroRetroEligibility,
} from '@wwbox/contracts';
import astriteIcon from '../assets/resource-briefing/astrite.png';
import ResourceBriefing from './ResourceBriefing.vue';
import KuroRoles from './KuroRoles.vue';
import KuroCalculator from './KuroCalculator.vue';
import KuroChallenge from './KuroChallenge.vue';
import ThemedSelect from './ThemedSelect.vue';
import AppDialog from './AppDialog.vue';

const accounts = ref<KuroAccount[]>([]);
const dashboard = ref<KuroDashboard | null>(null);
const tab = ref<'overview' | 'roles' | 'calculator' | 'challenge' | 'sign'>('sign');
const loading = ref(false);
const loginOpen = ref(false);
const settingsOpen = ref(false);
const loginMethod = ref<KuroLoginMethod>('sms');
const remark = ref('');
const phone = ref('');
const code = ref('');
const token = ref('');
const did = ref('');
const editingId = ref<string | null>(null);
const smsCooldown = ref(0);
const smsSending = ref(false);
const securityVerificationActive = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);
const retroEligibility = ref<KuroRetroEligibility[]>([]);
const useCardThumbnail = ref(localStorage.getItem('wwbox.kuroArtworkMode') !== 'original');
const storedCardResolution = Number(localStorage.getItem('wwbox.kuroArtworkResolution'));
const cardResolution = ref(
  Number.isInteger(storedCardResolution) &&
    storedCardResolution >= 128 &&
    storedCardResolution <= 2048
    ? storedCardResolution
    : 512,
);
watch(useCardThumbnail, (value) =>
  localStorage.setItem('wwbox.kuroArtworkMode', value ? 'thumbnail' : 'original'),
);
watch(cardResolution, (value) => {
  const normalized = Math.max(128, Math.min(2048, Math.round(Number(value) || 512)));
  if (normalized !== value) cardResolution.value = normalized;
  localStorage.setItem('wwbox.kuroArtworkResolution', String(normalized));
});

const activeAccount = computed(
  () => accounts.value.find((item) => item.active) ?? accounts.value[0] ?? null,
);
const activeRole = computed(
  () =>
    activeAccount.value?.roles.find((role) => role.roleId === activeAccount.value?.activeRoleId) ??
    activeAccount.value?.roles[0] ??
    null,
);
const allAutoSign = computed(
  () => accounts.value.length > 0 && accounts.value.every((item) => item.autoSign),
);
const allAutoRetroSign = computed(
  () => accounts.value.length > 0 && accounts.value.every((item) => item.autoRetroSign),
);
const currentSignedToday = computed(() => happenedToday(activeAccount.value?.lastSignAt));
const currentRetro = computed(
  () => retroEligibility.value.find((item) => item.accountId === activeAccount.value?.id) ?? null,
);
const currentKuroCoins = computed(() => currentRetro.value?.kuroCoins ?? null);
const mobileUrl = computed(() => {
  if (tab.value === 'sign')
    return 'https://web-static.kurobbs.com/events2.0/index.html#/mc-month-sign/home';
  if (tab.value === 'overview')
    return 'https://web-static.kurobbs.com/resource-briefing/index.html#/home';
  if (tab.value === 'calculator')
    return 'https://web-static.kurobbs.com/growth-calculator/index.html#/';
  const roleId = encodeURIComponent(activeRole.value?.roleId ?? '');
  const serverId = encodeURIComponent(activeRole.value?.serverId ?? '');
  return `https://web-static.kurobbs.com/mcbox/index.html#/mc-role-box?accessType=1&roleId=${roleId}&serverId=${serverId}`;
});
async function openMobile(): Promise<void> {
  if (!activeAccount.value || !activeRole.value) return;
  try {
    await window.wwbox.kuro.openMobile(
      activeAccount.value.id,
      activeRole.value.roleId,
      mobileUrl.value,
    );
  } catch (error) {
    notify(false, errorText(error));
  }
}
const allSignedToday = computed(
  () => accounts.value.length > 0 && accounts.value.every((item) => happenedToday(item.lastSignAt)),
);
const eligibleRetroAccounts = computed(() =>
  retroEligibility.value.filter((item) => item.canRetro),
);
const allRetroReason = computed(() => {
  if (eligibleRetroAccounts.value.length) return null;
  const reasons = [...new Set(retroEligibility.value.map((item) => item.reason).filter(Boolean))];
  return reasons.join('；') || '没有可补签账号';
});
const tabs = [
  ['sign', '每日签到'],
  ['overview', '资源简报'],
  ['roles', '我的角色'],
  ['calculator', '养成计算'],
  ['challenge', '挑战数据'],
] as const;

type SignReward = {
  name: string;
  count: number;
  image: string;
  date: string;
  signed: boolean;
};
const signData = computed(() => dashboard.value?.sign ?? {});
const signDays = computed(() =>
  numberByKeys(signData.value, ['sigInNum', 'signInNum', 'signinNum', 'totalSignInNum']),
);
const signedToday = computed(() =>
  booleanByKeys(signData.value, ['isSigIn', 'isSignIn', 'hasSignIn']),
);
const signRewards = computed<SignReward[]>(() => {
  const list = arrayByKeys(signData.value, ['signInGoodsConfigs', 'goodsConfigs', 'rewardList']);
  return list.map((item, index) => rewardFrom(item, index < signDays.value));
});
const signRecords = computed<SignReward[]>(() => {
  const list = arrayByKeys(signData.value, [
    'signInRecordList',
    'signInRecords',
    'recordList',
    'records',
    'list',
  ]);
  return list.map((item) => rewardFrom(item, true));
});
const streakRewards = computed(() =>
  [
    { day: 1, count: 10 },
    { day: 3, count: 20 },
    { day: 5, count: 30 },
  ].map((item) => ({ ...item, reached: signDays.value >= item.day })),
);
const daysToNextStreak = computed(() => {
  const next = streakRewards.value.find((item) => !item.reached);
  return next ? Math.max(0, next.day - signDays.value) : 0;
});
onMounted(async () => {
  await reloadAccounts();
});

async function reloadAccounts(): Promise<void> {
  accounts.value = await window.wwbox.kuro.listAccounts();
  if (activeAccount.value) {
    await loadDashboard();
    await loadRetroEligibility();
  }
}
async function loadRetroEligibility(): Promise<void> {
  try {
    retroEligibility.value = await window.wwbox.kuro.retroEligibility();
  } catch (error) {
    notify(false, errorText(error));
  }
}

async function loadDashboard(force = false, allowSecurityVerification = true): Promise<void> {
  if (!activeAccount.value) return;
  loading.value = true;
  try {
    dashboard.value = await window.wwbox.kuro.dashboard(
      activeAccount.value.id,
      activeRole.value?.roleId,
      force,
    );
    const verificationError = Object.values(dashboard.value?.errors ?? {}).find(isSecurityError);
    if (verificationError && allowSecurityVerification) {
      await handleSecurityVerification();
    } else if (verificationError) {
      notify(false, '安全验证完成后数据仍不可用，请稍后重新同步');
    }
  } catch (error) {
    notify(false, errorText(error));
  } finally {
    loading.value = false;
  }
}

async function sendSms(): Promise<void> {
  if (smsSending.value || smsCooldown.value > 0) return;
  smsSending.value = true;
  try {
    const geeTestData = await window.wwbox.kuro.requestCaptcha();
    const result = await window.wwbox.kuro.sendSms({
      phone: phone.value,
      geeTestData,
    });
    notify(result.success, result.message);
    if (result.success) startSmsCooldown();
  } catch (error) {
    notify(false, errorText(error));
  } finally {
    smsSending.value = false;
  }
}

async function login(): Promise<void> {
  loading.value = true;
  try {
    await window.wwbox.kuro.login({
      method: loginMethod.value,
      ...(remark.value ? { remark: remark.value } : {}),
      phone: phone.value,
      code: code.value,
      token: token.value,
      ...(did.value ? { did: did.value } : {}),
    });
    loginOpen.value = false;
    remark.value = '';
    code.value = '';
    token.value = '';
    await reloadAccounts();
    notify(true, '库街区账号添加成功');
  } catch (error) {
    notify(false, errorText(error));
  } finally {
    loading.value = false;
  }
}

function openAdd(): void {
  editingId.value = null;
  remark.value = '';
  token.value = '';
  did.value = '';
  phone.value = '';
  code.value = '';
  loginOpen.value = true;
}

function openEdit(account: KuroAccount): void {
  editingId.value = account.id;
  remark.value = account.remark ?? '';
  token.value = '';
  did.value = '';
  loginMethod.value = 'token';
  loginOpen.value = true;
}

async function saveEdit(): Promise<void> {
  if (!editingId.value) return;
  loading.value = true;
  try {
    await window.wwbox.kuro.update({
      accountId: editingId.value,
      remark: remark.value || null,
      ...(token.value ? { token: token.value } : {}),
      ...(did.value ? { did: did.value } : {}),
    });
    loginOpen.value = false;
    await reloadAccounts();
    notify(true, '账号信息已更新');
  } catch (error) {
    notify(false, errorText(error));
  } finally {
    loading.value = false;
  }
}

function generateDid(): void {
  did.value = crypto.randomUUID().replaceAll('-', '');
}
function startSmsCooldown(): void {
  smsCooldown.value = 60;
  const timer = window.setInterval(() => {
    smsCooldown.value -= 1;
    if (smsCooldown.value <= 0) window.clearInterval(timer);
  }, 1000);
}

async function activate(id: string): Promise<void> {
  await window.wwbox.kuro.activate(id);
  dashboard.value = null;
  await reloadAccounts();
}
async function selectRole(roleId: string): Promise<void> {
  if (!activeAccount.value) return;
  await window.wwbox.kuro.selectRole(activeAccount.value.id, roleId);
  await reloadAccounts();
}
async function refreshRoles(): Promise<void> {
  if (!activeAccount.value) return;
  loading.value = true;
  try {
    await window.wwbox.kuro.refreshRoles(activeAccount.value.id);
    await reloadAccounts();
    notify(true, '角色列表已更新');
  } catch (error) {
    notify(false, errorText(error));
  } finally {
    loading.value = false;
  }
}
async function removeAccount(id: string): Promise<void> {
  await window.wwbox.kuro.remove(id);
  dashboard.value = null;
  await reloadAccounts();
}
async function toggleCurrent(enabled: boolean): Promise<void> {
  if (!activeAccount.value) return;
  await window.wwbox.kuro.setAutoSign(activeAccount.value.id, enabled);
  accounts.value = await window.wwbox.kuro.listAccounts();
}
async function toggleAll(enabled: boolean): Promise<void> {
  accounts.value = await window.wwbox.kuro.setAllAutoSign(enabled);
}
async function toggleCurrentRetro(enabled: boolean): Promise<void> {
  if (!activeAccount.value) return;
  await window.wwbox.kuro.setAutoRetroSign(activeAccount.value.id, enabled);
  accounts.value = await window.wwbox.kuro.listAccounts();
}
async function toggleAllRetro(enabled: boolean): Promise<void> {
  accounts.value = await window.wwbox.kuro.setAllAutoRetroSign(enabled);
}
async function sign(id?: string): Promise<void> {
  loading.value = true;
  try {
    const results = await window.wwbox.kuro.sign(id);
    showResults(results);
    accounts.value = await window.wwbox.kuro.listAccounts();
    await loadDashboard(true);
    await loadRetroEligibility();
  } catch (error) {
    notify(false, errorText(error));
  } finally {
    loading.value = false;
  }
}
async function retroactiveSign(id?: string): Promise<void> {
  loading.value = true;
  try {
    const results = await window.wwbox.kuro.retroSign(id);
    showResults(results);
    accounts.value = await window.wwbox.kuro.listAccounts();
    await loadDashboard(true);
    await loadRetroEligibility();
  } catch (error) {
    notify(false, errorText(error));
  } finally {
    loading.value = false;
  }
}
function showResults(results: KuroOperationResult[]): void {
  notify(
    results.every((item) => item.success),
    results.map((item) => item.message).join('；'),
  );
}
function notify(ok: boolean, text: string): void {
  message.value = { ok, text };
}
function isSecurityError(value: unknown): boolean {
  return typeof value === 'string' && /验证|captcha|安全校验|人机/i.test(value);
}
async function handleSecurityVerification(): Promise<void> {
  if (securityVerificationActive.value) return;
  securityVerificationActive.value = true;
  message.value = { ok: false, text: '库街区要求完成安全验证，请在弹出的窗口中完成验证' };
  try {
    await window.wwbox.kuro.requestCaptcha();
    await loadDashboard(true, false);
  } catch (error) {
    message.value = { ok: false, text: errorText(error) };
  } finally {
    securityVerificationActive.value = false;
  }
}
function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
    : '操作失败';
}
function happenedToday(value: string | null | undefined): boolean {
  return Boolean(value && new Date(value).toLocaleDateString() === new Date().toLocaleDateString());
}
function arrayByKeys(value: unknown, keys: string[]): Record<string, unknown>[] {
  const seen = new Set<unknown>();
  function visit(current: unknown): Record<string, unknown>[] {
    if (!current || typeof current !== 'object' || seen.has(current)) return [];
    seen.add(current);
    const record = current as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as Record<string, unknown>[];
    }
    for (const child of Object.values(record)) {
      const found = visit(child);
      if (found.length) return found;
    }
    return [];
  }
  return visit(value);
}
function numberByKeys(value: unknown, keys: string[]): number {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  for (const key of keys) {
    const result = Number(record[key]);
    if (Number.isFinite(result)) return result;
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') {
      const result = numberByKeys(child, keys);
      if (result) return result;
    }
  }
  return 0;
}
function booleanByKeys(value: unknown, keys: string[]): boolean {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  for (const key of keys) {
    if (key in record) return record[key] === true || record[key] === 1;
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object' && booleanByKeys(child, keys)) return true;
  }
  return false;
}
function rewardFrom(item: Record<string, unknown>, signed: boolean): SignReward {
  return {
    name: String(item.goodsName ?? item.name ?? item.rewardName ?? '签到奖励'),
    count: Number(item.goodsNum ?? item.num ?? item.count ?? 1),
    image: String(item.goodsUrl ?? item.iconUrl ?? item.icon ?? ''),
    date: String(item.sigInDate ?? item.signInDate ?? item.createTime ?? item.time ?? ''),
    signed: signed || item.isGain === true || item.isGain === 1,
  };
}
</script>

<template>
  <div class="kuro-page">
    <header class="kuro-hero">
      <div>
        <p class="eyebrow">KURO COMMUNITY HUB</p>
        <h1>库街区工作台</h1>
        <p>角色、养成、挑战、签到与资源数据统一管理，并通过游戏 UID 自动关联本地档案。</p>
      </div>
      <div class="hero-actions">
        <button class="secondary-button" @click="settingsOpen = true">库街区设置</button>
        <button
          class="secondary-button"
          :disabled="loading || !activeAccount"
          @click="loadDashboard(true)"
        >
          同步数据</button
        ><button class="primary-button" @click="openAdd">添加库街区账号</button>
      </div>
    </header>

    <p v-if="message" class="kuro-message" :class="{ error: !message.ok }">
      {{ message.text }}<button @click="message = null">×</button>
    </p>

    <section v-if="accounts.length" class="account-strip">
      <button
        v-for="account in accounts"
        :key="account.id"
        class="kuro-account-chip"
        :class="{ active: account.active }"
        @click="activate(account.id)"
      >
        <span>{{ account.accountName.slice(0, 1) }}</span
        ><strong :title="account.displayTitle">{{ account.displayTitle }}</strong
        ><small>{{ account.remark || `${account.roles.length} 个角色` }}</small
        ><i v-if="account.autoSign">自动签</i>
      </button>
      <button class="add-chip" @click="openAdd">＋</button>
    </section>

    <section v-if="activeAccount" class="role-toolbar">
      <div>
        <small>当前游戏角色</small
        ><ThemedSelect
          :model-value="activeRole?.roleId ?? ''"
          :options="
            activeAccount.roles.map((role) => ({
              value: role.roleId,
              label: `${role.roleName} · UID ${role.roleId}${role.linkedAccountId ? ' · 已关联档案' : ''}`,
            }))
          "
          :min-width="300"
          @change="selectRole(String($event))"
        />
      </div>
      <div class="uid-link">
        <span :class="{ linked: activeRole?.linkedAccountId }">{{
          activeRole?.linkedAccountId ? '✓ 已通过 UID 协同' : '未找到同 UID 本地档案'
        }}</span
        ><button class="text-button" @click="refreshRoles">刷新绑定</button
        ><button class="text-button" @click="openEdit(activeAccount)">编辑账号</button
        ><button class="text-button danger" @click="removeAccount(activeAccount.id)">
          移除账号</button
        ><button class="text-button phone-view-button" @click="openMobile">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="2.5" width="12" height="19" rx="2.4" />
            <path d="M10 5h4M11 18.5h2" />
          </svg>
          手机视图
        </button>
      </div>
    </section>

    <nav v-if="activeAccount" class="kuro-tabs">
      <button
        v-for="item in tabs"
        :key="item[0]"
        :class="{ active: tab === item[0] }"
        @click="tab = item[0]"
      >
        {{ item[1] }}
      </button>
      <span class="kuro-coin-badge"
        >库洛币 <b>{{ currentKuroCoins ?? '—' }}</b></span
      >
    </nav>

    <div v-if="!accounts.length" class="kuro-empty">
      <div>◈</div>
      <h2>连接库街区，解锁完整游戏档案</h2>
      <p>支持多个库街区账号，每个账号可管理多个游戏角色。Token 仅加密保存在本机。</p>
      <button class="primary-button" @click="openAdd">添加第一个账号</button>
    </div>

    <section v-else-if="loading && !dashboard" class="kuro-empty">
      <div class="loader" />
      <p>正在同步库街区数据…</p>
    </section>

    <div v-else-if="dashboard" class="kuro-content">
      <ResourceBriefing
        v-if="tab === 'overview' && activeAccount"
        :account-id="activeAccount.id"
        :role-id="activeRole?.roleId"
        :periods="dashboard.resourcePeriods"
        :initial-data="dashboard.resources"
        :error="dashboard.errors.resources"
      />

      <KuroRoles
        v-else-if="tab === 'roles' && activeAccount && activeRole"
        :account-id="activeAccount.id"
        :game-role-id="activeRole.roleId"
        :data="dashboard.roles"
        :error="dashboard.errors.roles"
        :use-card-thumbnail="useCardThumbnail"
        :card-resolution="cardResolution"
        @notice="notify"
        @open-mobile="openMobile"
      />

      <KuroCalculator
        v-else-if="tab === 'calculator' && activeAccount && activeRole"
        :account-id="activeAccount.id"
        :game-role-id="activeRole.roleId"
        :data="dashboard.calculator"
        :role-data="dashboard.roles"
        :error="dashboard.errors.calculator"
        :use-card-thumbnail="useCardThumbnail"
        :card-resolution="cardResolution"
        @notice="notify"
      />

      <KuroChallenge
        v-else-if="tab === 'challenge'"
        :data="dashboard.challenge"
        :error="dashboard.errors.challenge"
      />

      <section v-else-if="tab === 'sign'" class="sign-layout">
        <div class="sign-primary-column">
          <article class="feature-card sign-actions-card">
            <div class="sign-action-buttons">
              <button
                class="secondary-button"
                :class="{ completed: currentSignedToday }"
                :disabled="loading || currentSignedToday"
                @click="sign(activeAccount?.id)"
              >
                {{ currentSignedToday ? '已签到当前账号' : '签到当前账号' }}
              </button>
              <button
                class="secondary-button retro-button"
                :disabled="loading || !currentRetro?.canRetro"
                @click="retroactiveSign(activeAccount?.id)"
              >
                <span>{{ currentRetro?.canRetro ? '可补签当前账号' : '不可补签当前账号' }}</span>
                <small v-if="!currentRetro?.canRetro">{{
                  currentRetro?.reason || '正在检查补签资格'
                }}</small>
              </button>
              <button
                class="secondary-button"
                :class="{ completed: allSignedToday }"
                :disabled="loading || allSignedToday"
                @click="sign()"
              >
                {{ allSignedToday ? '已签到所有账号' : '签到所有账号' }}
              </button>
              <button
                class="secondary-button retro-button"
                :disabled="loading || !eligibleRetroAccounts.length"
                @click="retroactiveSign()"
              >
                <span>{{
                  !eligibleRetroAccounts.length
                    ? '不可补签全部账号'
                    : eligibleRetroAccounts.length === accounts.length
                      ? '可补签全部账号'
                      : '可补签部分账号'
                }}</span>
                <small v-if="!eligibleRetroAccounts.length">{{ allRetroReason }}</small>
              </button>
            </div>
          </article>

          <article class="feature-card sign-calendar-card">
            <header class="sign-card-heading">
              <div>
                <p class="eyebrow">MONTHLY CHECK-IN</p>
                <h2>
                  {{ new Date().getMonth() + 1 }} 月累计签到 <b>{{ signDays }}</b> 天
                </h2>
              </div>
              <span :class="{ signed: signedToday }">{{
                signedToday ? '今日已签到' : '今日待签到'
              }}</span>
            </header>
            <p class="sign-status-line">
              {{ activeAccount?.lastSignStatus || '签到数据已同步' }}
              <small v-if="activeAccount?.lastSignAt"
                >最近执行：{{ new Date(activeAccount.lastSignAt).toLocaleString() }}</small
              >
            </p>
            <div v-if="signRewards.length" class="sign-reward-grid">
              <article
                v-for="(reward, index) in signRewards"
                :key="`${reward.name}-${index}`"
                :class="{ signed: reward.signed, today: index + 1 === signDays }"
              >
                <div>
                  <img v-if="reward.image" :src="reward.image" :alt="reward.name" />
                  <span v-else>◈</span>
                  <b>×{{ reward.count }}</b>
                  <i v-if="reward.signed">✓</i>
                </div>
                <strong>第{{ index + 1 }}天</strong>
                <small>{{ reward.name }}</small>
              </article>
            </div>
            <p v-else class="sign-empty">{{ dashboard.errors.sign || '暂无本月签到奖励数据' }}</p>
          </article>
        </div>

        <div class="sign-secondary-column">
          <article class="feature-card streak-card">
            <header>
              <div>
                <p class="eyebrow">STREAK BONUS</p>
                <h2>连续签到额外奖励</h2>
              </div>
              <b>当前连续第 {{ signDays }} 天</b>
            </header>
            <div class="streak-content">
              <p v-if="daysToNextStreak">
                再连续 <b>{{ daysToNextStreak }}</b> 天可获得下一档星声
              </p>
              <p v-else>本轮连续签到奖励已全部达成</p>
              <div class="streak-rewards">
                <div
                  v-for="reward in streakRewards"
                  :key="reward.day"
                  :class="{ reached: reward.reached }"
                >
                  <img :src="astriteIcon" alt="星声" />
                  <i v-if="reward.reached">✓</i>
                  <strong>×{{ reward.count }}</strong
                  ><small>第{{ reward.day }}天</small>
                </div>
              </div>
            </div>
          </article>

          <article class="feature-card sign-history-card">
            <header class="sign-card-heading">
              <div>
                <p class="eyebrow">REWARD HISTORY</p>
                <h2>领取记录</h2>
              </div>
              <span>{{ signRecords.length }} 条</span>
            </header>
            <div v-if="signRecords.length" class="sign-history-list">
              <article
                v-for="(record, index) in signRecords"
                :key="`${record.name}-${record.date}-${index}`"
              >
                <img v-if="record.image" :src="record.image" :alt="record.name" />
                <span v-else>◈</span>
                <div>
                  <strong>{{ record.name }} ×{{ record.count }}</strong
                  ><small>{{ record.date || '本月领取' }}</small>
                </div>
                <b>已发放</b>
              </article>
            </div>
            <p v-else class="sign-empty">暂无领取记录</p>
          </article>
        </div>
      </section>
    </div>

    <AppDialog
      :open="settingsOpen"
      backdrop-class="kuro-modal-backdrop"
      @close="settingsOpen = false"
    >
      <section class="dialog-surface kuro-modal kuro-settings-modal">
        <header>
          <div>
            <p class="eyebrow">KURO SETTINGS</p>
            <h2>库街区设置</h2>
          </div>
          <button type="button" @click="settingsOpen = false">×</button>
        </header>
        <section class="kuro-setting-group">
          <div class="kuro-setting-title">
            <div>
              <h3>签到相关</h3>
              <small>启动时自动执行；持续运行时在每日刷新后 1–4 小时内稳定随机执行</small>
            </div>
            <span>随机延迟</span>
          </div>
          <div class="sign-setting-grid">
            <label class="switch-row">
              <span
                ><strong>当前账号自动签到</strong
                ><small>{{ activeAccount?.accountName }}</small></span
              >
              <input
                type="checkbox"
                :checked="activeAccount?.autoSign"
                @change="toggleCurrent(($event.target as HTMLInputElement).checked)"
              />
            </label>
            <label class="switch-row">
              <span
                ><strong>所有账号自动签到</strong
                ><small>批量控制 {{ accounts.length }} 个账号</small></span
              >
              <input
                type="checkbox"
                :checked="allAutoSign"
                @change="toggleAll(($event.target as HTMLInputElement).checked)"
              />
            </label>
            <label class="switch-row">
              <span
                ><strong>当前账号自动补签</strong
                ><small>{{ activeAccount?.accountName }}</small></span
              >
              <input
                type="checkbox"
                :checked="activeAccount?.autoRetroSign"
                @change="toggleCurrentRetro(($event.target as HTMLInputElement).checked)"
              />
            </label>
            <label class="switch-row">
              <span
                ><strong>所有账号自动补签</strong
                ><small>批量控制 {{ accounts.length }} 个账号</small></span
              >
              <input
                type="checkbox"
                :checked="allAutoRetroSign"
                @change="toggleAllRetro(($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
        </section>
        <section class="kuro-setting-group artwork-setting-group">
          <div class="kuro-setting-title">
            <div>
              <h3>角色大头像</h3>
              <small>控制“我的角色”和“养成计算”大头像模式使用的图片</small>
            </div>
            <span>{{ useCardThumbnail ? `${cardResolution}px` : '原图' }}</span>
          </div>
          <div class="artwork-mode-control" role="radiogroup" aria-label="大头像加载方式">
            <label>
              <input v-model="useCardThumbnail" type="radio" :value="true" />
              <span><strong>预生成专用缩略图</strong><small>加载更快，内存占用更低</small></span>
            </label>
            <label>
              <input v-model="useCardThumbnail" type="radio" :value="false" />
              <span><strong>使用原始全身像</strong><small>保留最高画质，加载开销较大</small></span>
            </label>
          </div>
          <label class="resolution-setting">
            <span><strong>缩略图最长边</strong><small>允许 128–2048 像素，默认 512</small></span>
            <div>
              <input
                v-model.number.lazy="cardResolution"
                type="number"
                min="128"
                max="2048"
                step="64"
                :disabled="!useCardThumbnail"
              />
              <b>px</b>
            </div>
          </label>
        </section>
      </section>
    </AppDialog>

    <AppDialog :open="loginOpen" backdrop-class="kuro-modal-backdrop" @close="loginOpen = false">
      <form class="dialog-surface kuro-modal" @submit.prevent="editingId ? saveEdit() : login()">
        <header>
          <div>
            <p class="eyebrow">{{ editingId ? 'EDIT KURO ACCOUNT' : 'ADD KURO ACCOUNT' }}</p>
            <h2>{{ editingId ? '编辑库街区账号' : '添加库街区账号' }}</h2>
          </div>
          <button type="button" @click="loginOpen = false">×</button>
        </header>
        <div v-if="!editingId" class="login-methods">
          <button
            type="button"
            :class="{ active: loginMethod === 'sms' }"
            @click="loginMethod = 'sms'"
          >
            手机号验证码</button
          ><button
            type="button"
            :class="{ active: loginMethod === 'token' }"
            @click="loginMethod = 'token'"
          >
            手动 Token
          </button>
        </div>
        <label
          >备注（可选）<input
            v-model="remark"
            maxlength="60"
            placeholder="例如：主账号、备用号" /></label
        ><template v-if="!editingId && loginMethod === 'sms'"
          ><label
            >手机号
            <div class="input-action">
              <input
                v-model="phone"
                required
                inputmode="numeric"
                maxlength="11"
                placeholder="中国大陆手机号"
              /><button
                type="button"
                :class="{ 'sms-cooldown': smsCooldown > 0 }"
                :disabled="smsSending || smsCooldown > 0"
                @click="sendSms"
              >
                {{
                  smsSending
                    ? '正在发送…'
                    : smsCooldown > 0
                      ? `重新发送（${smsCooldown} 秒）`
                      : '验证并发送'
                }}
              </button>
            </div></label
          ><label
            >短信验证码<input
              v-model="code"
              required
              inputmode="numeric"
              maxlength="8"
              placeholder="请输入验证码" /></label></template
        ><template v-else
          ><label
            >库街区 Token{{ editingId ? '（留空则不修改）' : ''
            }}<textarea
              v-model="token"
              rows="5"
              placeholder="Token 只会加密存储在本机，不会显示在界面中"
            /></label
          ><label
            >Did（设备标识）
            <div class="input-action">
              <input
                v-model="did"
                :placeholder="editingId ? '留空则不修改' : '可填写已有 Did 或自动生成'"
              /><button type="button" @click="generateDid">自动生成</button>
            </div></label
          ></template
        >
        <p class="security-note">
          登录后会自动读取该库街区账号绑定的所有鸣潮角色，并按游戏 UID 关联本地账号档案。
        </p>
        <button class="primary-button" type="submit" :disabled="loading">
          {{ loading ? '正在验证…' : editingId ? '保存并重新验证' : '验证并添加账号' }}
        </button>
      </form>
    </AppDialog>
  </div>
</template>

<style scoped>
.kuro-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.kuro-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
}
.kuro-hero h1 {
  margin: 4px 0 8px;
  font-size: 34px;
}
.kuro-hero p {
  margin: 0;
  color: var(--text-secondary, #9aa7b2);
}
.hero-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.account-strip {
  display: flex;
  gap: 10px;
  overflow: auto;
  padding: 2px;
}
.kuro-account-chip,
.add-chip {
  border: 1px solid rgba(255, 255, 255, 0.11);
  background: rgba(12, 20, 27, 0.55);
  color: inherit;
  border-radius: 14px;
  padding: 7px 10px;
  display: grid;
  grid-template-columns: 32px auto;
  gap: 1px 9px;
  text-align: left;
  min-width: 175px;
}
.kuro-account-chip > span {
  grid-row: 1/3;
  background: #54d7c0;
  color: #08211d;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  font-weight: 800;
}
.kuro-account-chip small {
  opacity: 0.6;
}
.kuro-account-chip i {
  grid-column: 2;
  font-size: 11px;
  color: #65e0c9;
}
.kuro-account-chip.active {
  border-color: #55d8c0;
  box-shadow: 0 0 0 1px #55d8c055;
}
.add-chip {
  display: grid;
  place-items: center;
  min-width: 46px;
  font-size: 22px;
}
.role-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(10, 18, 24, 0.45);
}
.role-toolbar small {
  display: block;
  opacity: 0.6;
  margin-bottom: 5px;
}
.role-toolbar select {
  min-width: 300px;
}
.kuro-coin-badge {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  margin-inline-start: auto;
  border: 1px solid color-mix(in srgb, var(--t-accent) 45%, var(--t-divider));
  border-radius: 10px;
  background: color-mix(in srgb, var(--t-accent) 17%, var(--t-raised));
  padding: 0 12px;
  white-space: nowrap;
}
.kuro-coin-badge b {
  color: var(--t-strong);
  font-size: 14px;
}
.uid-link {
  display: flex;
  gap: 12px;
  align-items: center;
}
.uid-link > span {
  font-size: 12px;
  color: #e3b96e;
}
.uid-link > span.linked {
  color: #62d8ac;
}
.text-button {
  border: 0;
  background: none;
  color: #75dac8;
}
.text-button.danger {
  color: #e99090;
}
.kuro-tabs {
  display: flex;
  gap: 4px;
  padding: 5px;
  border-radius: 14px;
  background: rgba(7, 14, 19, 0.45);
  width: 100%;
  box-sizing: border-box;
}
.phone-view-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.phone-view-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}
.kuro-tabs button {
  border: 0;
  background: transparent;
  color: inherit;
  padding: 9px 15px;
  border-radius: 10px;
}
.kuro-tabs button.active,
.login-methods button.active {
  background: #56d7c0;
  color: #09211c;
  font-weight: 700;
}
.kuro-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.metric-card,
.feature-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  background: rgba(14, 23, 30, 0.58);
  padding: 12px;
}
.metric-card span {
  display: block;
  opacity: 0.65;
  margin-bottom: 5px;
}
.metric-card strong {
  font-size: 21px;
}
.dense-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
}
.dense-card {
  position: relative;
  min-height: 70px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  background: rgba(14, 23, 30, 0.58);
  padding: 9px 10px;
}
.dense-card > img {
  width: 38px;
  height: 38px;
  object-fit: cover;
  float: left;
  margin: 0 8px 5px 0;
  border-radius: 8px;
}
.dense-card h3 {
  font-size: 14px;
  margin: 0 0 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dense-card dl {
  clear: both;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 8px;
  margin: 0;
  font-size: 11px;
}
.dense-card dt {
  opacity: 0.58;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dense-card dd {
  margin: 0;
  font-weight: 650;
}
.mini-records {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
}
.mini-records > span {
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: 1px 7px;
  padding: 6px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.045);
}
.mini-records img {
  grid-row: 1/3;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  object-fit: cover;
}
.mini-records b,
.mini-records small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-records small {
  font-size: 10px;
  opacity: 0.55;
}
.feature-card.accent {
  background: linear-gradient(135deg, rgba(75, 210, 187, 0.24), rgba(14, 23, 30, 0.58));
  grid-row: span 2;
}
.feature-card.accent h2 {
  font-size: 26px;
  margin: 7px 0;
}
.feature-card.accent span,
.feature-card.accent b {
  display: block;
  margin-top: 8px;
}
.feature-card.wide {
  grid-column: 1/-1;
}
.feature-card h2,
.feature-card h3 {
  margin-top: 0;
}
.feature-card dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 9px 16px;
  margin: 0;
}
.feature-card dt {
  opacity: 0.65;
}
.feature-card dd {
  margin: 0;
  font-weight: 650;
}
.calculator-layout,
.sign-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) 1.4fr;
  gap: 14px;
}
.sign-layout {
  grid-template-columns: minmax(0, 1.18fr) minmax(255px, 0.82fr);
  align-items: start;
}
.sign-primary-column,
.sign-secondary-column {
  display: grid;
  min-width: 0;
  gap: 10px;
}
.sign-layout .feature-card {
  min-width: 0;
  overflow: hidden;
  padding: 14px;
}
.sign-actions-card {
  display: block;
}
.sign-action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.sign-action-buttons button.completed {
  border-color: rgba(74, 210, 169, 0.45) !important;
  color: #8be6ca !important;
  background: rgba(39, 138, 111, 0.2) !important;
  opacity: 1 !important;
}
.sign-action-buttons button {
  min-height: 34px;
  padding: 7px 10px;
  font-size: 10px;
  white-space: nowrap;
}
.sign-action-buttons button > span,
.sign-action-buttons button > small {
  display: block;
}
.sign-action-buttons button > small {
  margin-top: 2px;
  font-size: 8px;
  font-weight: 400;
  opacity: 0.72;
  white-space: normal;
}
.retro-button {
  color: #e6c57c !important;
}
.sign-card-heading,
.streak-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sign-card-heading h2,
.streak-card h2 {
  margin: 2px 0 0;
  font-size: 17px;
}
.sign-card-heading h2 b {
  color: #58a8ef;
  font-size: 23px;
}
.sign-card-heading > span,
.streak-card > header > b {
  padding: 5px 8px;
  border: 1px solid rgba(232, 173, 82, 0.35);
  border-radius: 7px;
  color: #e9bd70;
  background: rgba(182, 125, 36, 0.12);
  font-size: 10px;
  white-space: nowrap;
}
.sign-card-heading > span.signed {
  border-color: rgba(74, 210, 169, 0.38);
  color: #78e0c1;
  background: rgba(40, 155, 124, 0.14);
}
.sign-status-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 9px 0;
  font-size: 10px;
  opacity: 1;
}
.sign-reward-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(68px, 1fr));
  gap: 7px;
}
.sign-reward-grid > article {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(137, 160, 169, 0.2);
  border-radius: 8px;
  background: rgba(8, 18, 24, 0.42);
  text-align: center;
  opacity: 1;
}
.sign-reward-grid > article.today {
  border-color: #4b92dc;
  box-shadow: inset 0 0 0 1px #4b92dc;
  opacity: 1;
}
.sign-reward-grid > article.signed {
  opacity: 1;
}
.sign-reward-grid > article > div {
  position: relative;
  display: grid;
  height: 58px;
  place-items: center;
  background: linear-gradient(180deg, rgba(81, 111, 150, 0.3), rgba(21, 30, 39, 0.18));
}
.sign-reward-grid img {
  width: 45px;
  height: 45px;
  object-fit: contain;
}
.sign-reward-grid > article > div > span {
  font-size: 24px;
}
.sign-reward-grid > article > div > b {
  position: absolute;
  right: 5px;
  bottom: 3px;
  font-size: 10px;
}
.sign-reward-grid > article > div > i {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 50%;
  color: #09231c;
  background: #65d8b7;
  font-size: 10px;
  font-style: normal;
}
.sign-reward-grid > article > strong,
.sign-reward-grid > article > small {
  display: block;
  overflow: hidden;
  padding: 4px 4px 0;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sign-reward-grid > article > small {
  padding: 1px 4px 5px;
  opacity: 0.48;
}
.streak-card > header {
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.streak-content {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
}
.streak-content > p {
  margin: 0;
  font-size: 11px;
}
.streak-content > p b {
  color: #58a8ef;
  font-size: 18px;
}
.streak-rewards {
  display: flex;
  gap: 6px;
}
.streak-rewards > div {
  position: relative;
  display: grid;
  width: 55px;
  grid-template-columns: 1fr;
  justify-items: center;
  padding: 5px;
  border: 1px solid rgba(120, 151, 174, 0.2);
  border-radius: 6px;
  opacity: 1;
}
.streak-rewards > div.reached {
  border-color: rgba(82, 169, 231, 0.55);
  background: rgba(48, 108, 169, 0.16);
  opacity: 1;
}
.streak-rewards > div > i {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  width: 15px;
  height: 15px;
  place-items: center;
  border-radius: 50%;
  color: #09231c;
  background: #65d8b7;
  font-size: 9px;
  font-style: normal;
}
.streak-rewards img {
  width: 32px;
  height: 32px;
}
.streak-rewards strong,
.streak-rewards small {
  font-size: 9px;
}
.sign-history-card {
  min-height: 350px;
}
.sign-history-list {
  display: grid;
  max-height: 465px;
  overflow: auto;
  margin-top: 10px;
  border: 1px solid rgba(130, 157, 170, 0.2);
  border-radius: 9px;
}
.sign-history-list > article {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(130, 157, 170, 0.18);
  background: rgba(255, 255, 255, 0.018);
}
.sign-history-list > article:last-child {
  border-bottom: 0;
}
.sign-history-list img,
.sign-history-list > article > span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  object-fit: contain;
  background: transparent;
}
.sign-history-list div {
  min-width: 0;
}
.sign-history-list strong,
.sign-history-list small {
  display: block;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sign-history-list small {
  margin-top: 3px;
  opacity: 0.46;
}
.sign-history-list > article > b {
  color: #86a0ae;
  font-size: 10px;
  font-weight: 500;
}
.sign-empty {
  margin: 24px 0;
  text-align: center;
  font-size: 11px;
  opacity: 0.55;
}
.kuro-settings-modal {
  width: min(680px, calc(100vw - 32px));
}
.kuro-setting-group {
  padding: 14px;
  border: 1px solid rgba(119, 159, 171, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
}
.artwork-setting-group {
  margin-top: 12px;
}
.sign-setting-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding-top: 12px;
}
.sign-setting-grid .switch-row {
  min-width: 0;
  min-height: 64px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(119, 159, 171, 0.2);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.02);
}
.sign-setting-grid .switch-row > span {
  min-width: 0;
}
.sign-setting-grid .switch-row small {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artwork-mode-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px 0;
}
.artwork-mode-control label {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: start;
  margin: 0;
  border: 1px solid rgba(119, 159, 171, 0.22);
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
}
.artwork-mode-control label:has(input:checked) {
  border-color: #79d9ca;
  background: rgba(58, 166, 147, 0.1);
}
.artwork-mode-control input {
  margin-top: 2px;
}
.artwork-mode-control small,
.resolution-setting small {
  display: block;
  margin-top: 3px;
  opacity: 0.58;
}
.resolution-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  border-top: 1px solid rgba(119, 159, 171, 0.16);
  padding-top: 12px;
}
.resolution-setting > div {
  display: flex;
  align-items: center;
  gap: 6px;
}
.resolution-setting input {
  width: 96px;
}
.resolution-setting b {
  color: var(--t-muted);
  font-size: 11px;
}
.kuro-setting-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(119, 159, 171, 0.16);
}
.kuro-setting-title h3 {
  margin: 0 0 4px;
}
.kuro-setting-title small {
  opacity: 0.58;
}
.kuro-setting-title > span {
  padding: 4px 7px;
  border-radius: 6px;
  color: #79d9ca;
  background: rgba(58, 166, 147, 0.15);
  font-size: 9px;
  white-space: nowrap;
}
.feature-card label {
  display: block;
  margin: 16px 0;
}
.toggle-line {
  display: flex !important;
  gap: 8px;
}
.plan-summary {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px 20px;
  margin-top: 24px;
}
.level-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.level-pair label {
  margin: 8px 0;
}
.result-grid {
  margin-top: 12px;
}
.plan-summary span {
  opacity: 0.6;
}
.switch-row {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.switch-row small {
  display: block;
  opacity: 0.55;
  margin-top: 3px;
}
.switch-row input {
  width: 38px;
}
.kuro-empty {
  text-align: center;
  padding: 70px 20px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  border-radius: 20px;
}
.kuro-empty > div:first-child {
  font-size: 38px;
  color: #58d9c2;
}
.kuro-message {
  display: flex;
  justify-content: space-between;
  background: rgba(66, 205, 167, 0.14);
  border: 1px solid rgba(66, 205, 167, 0.35);
  padding: 10px 14px;
  border-radius: 12px;
}
.kuro-message.error {
  background: rgba(220, 80, 80, 0.12);
  border-color: rgba(220, 80, 80, 0.35);
}
.kuro-message button {
  border: 0;
  background: none;
  color: inherit;
}
.kuro-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40000;
  background: rgba(2, 7, 10, 0.62);
  backdrop-filter: none;
  display: grid;
  place-items: center;
  padding: 24px;
}
.kuro-modal {
  width: min(520px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: color-mix(in srgb, var(--t-raised) 96%, transparent);
  border: 1px solid var(--t-line);
  border-radius: 14px;
  padding: 24px;
  color: var(--t-text);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(20px) saturate(1.15);
}
.kuro-modal header {
  display: flex;
  justify-content: space-between;
}
.kuro-modal header h2 {
  margin: 4px 0 16px;
}
.kuro-modal header button {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--t-line);
  border-radius: 9px;
  background: var(--t-control);
  color: var(--t-text);
  font-size: 20px;
}
.login-methods {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: #091116;
  padding: 5px;
  border-radius: 12px;
  margin-bottom: 18px;
}
.login-methods button {
  border: 0;
  border-radius: 9px;
  padding: 10px;
  background: transparent;
  color: inherit;
}
.kuro-modal label {
  display: block;
  margin: 14px 0;
}
.kuro-modal input,
.kuro-modal textarea,
.kuro-modal select,
.role-toolbar select,
.feature-card select {
  box-sizing: border-box;
  width: 100%;
  margin-top: 7px;
  padding: 11px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: #091319;
  color: inherit;
}
.input-action {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.input-action button {
  margin-top: 7px;
  border: 1px solid #58d9c2;
  border-radius: 10px;
  background: transparent;
  color: #67ddc8;
  padding: 0 14px;
}
.input-action button:disabled,
.input-action button.sms-cooldown {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.42);
  cursor: not-allowed;
}
.security-note {
  font-size: 12px;
  opacity: 0.65;
  line-height: 1.6;
}
.loader {
  width: 30px;
  height: 30px;
  border: 3px solid #ffffff22;
  border-top-color: #58d9c2;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: auto;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1000px) {
  .kuro-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .role-toolbar {
    align-items: flex-start;
    gap: 10px;
  }
  .uid-link {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .sign-action-buttons {
    flex-wrap: wrap;
  }
}
@media (max-width: 980px) {
  .sign-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 720px) {
  .sign-setting-grid,
  .streak-content {
    grid-template-columns: 1fr;
  }
  .sign-action-buttons {
    justify-content: flex-start;
  }
  .sign-reward-grid {
    grid-template-columns: repeat(4, minmax(64px, 1fr));
  }
}
</style>
