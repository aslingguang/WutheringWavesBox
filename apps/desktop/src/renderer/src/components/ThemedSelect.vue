<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type ThemedSelectOption = {
  value: string | number;
  label: string;
  icon?: string;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    options: ThemedSelectOption[];
    ariaLabel?: string;
    disabled?: boolean;
    minWidth?: number;
  }>(),
  { ariaLabel: '选择选项', disabled: false, minWidth: 0 },
);
const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  change: [value: string | number];
}>();

const open = ref(false);
const trigger = ref<HTMLElement | null>(null);
const panel = ref<HTMLDialogElement | null>(null);
const panelStyle = ref<Record<string, string>>({});
const contentWidth = ref(Math.max(76, props.minWidth));
const triggerHovered = ref(false);
let pointerArmed = false;
const selected = computed(
  () =>
    props.options.find((item) => String(item.value) === String(props.modelValue)) ??
    props.options[0],
);
const controlStyle = computed(() => ({
  width: `${contentWidth.value}px`,
  maxWidth: 'calc(100vw - 16px)',
}));

function measureContentWidth(): void {
  const element = trigger.value;
  if (!element) return;
  const display = element.querySelector<HTMLElement>('.themed-select-display');
  if (!display) return;
  const style = getComputedStyle(display);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const labels = props.options.length
    ? props.options.map((item) => item.label)
    : [selected.value?.label ?? props.ariaLabel];
  const textWidth = Math.max(...labels.map((label) => context.measureText(label).width));
  const iconWidth = props.options.some((item) => item.icon) ? 30 : 0;
  const triggerChrome = 20 + 8 + 12;
  const panelChrome = 12 + 18 + 22;
  contentWidth.value = Math.max(
    76,
    props.minWidth,
    Math.ceil(textWidth + iconWidth + Math.max(triggerChrome, panelChrome)),
  );
}

async function toggle(): Promise<void> {
  if (props.disabled) return;
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  await nextTick();
  panel.value?.showModal();
  await nextTick();
  position();
}
function armPointer(): void {
  pointerArmed = true;
}
function updateTriggerHover(event: PointerEvent): void {
  const hitTarget = trigger.value?.querySelector<HTMLElement>('.themed-select-hit-target');
  if (!hitTarget || event.pointerType === 'touch') {
    triggerHovered.value = false;
    return;
  }
  const box = hitTarget.getBoundingClientRect();
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  triggerHovered.value =
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom &&
    Boolean(hit && hitTarget.contains(hit));
}
function onTriggerClick(event: MouseEvent): void {
  const accepted = pointerArmed && event.detail > 0;
  pointerArmed = false;
  if (accepted) void toggle();
}
function position(): void {
  const element = trigger.value;
  if (!element) return;
  const box = element.getBoundingClientRect();
  const theme = getComputedStyle(element);
  const display = element.querySelector<HTMLElement>('.themed-select-display');
  const typography = display ? getComputedStyle(display) : theme;
  const width = Math.min(window.innerWidth - 16, Math.max(box.width, contentWidth.value));
  const availableBelow = window.innerHeight - box.bottom - 10;
  const availableAbove = box.top - 10;
  const placeAbove = availableBelow < 150 && availableAbove > availableBelow;
  const maxHeight = Math.min(320, Math.max(120, placeAbove ? availableAbove : availableBelow));
  const verticalPosition = placeAbove
    ? { top: 'auto', bottom: `${window.innerHeight - box.top + 5}px` }
    : { top: `${box.bottom + 5}px`, bottom: 'auto' };
  panelStyle.value = {
    right: 'auto',
    left: `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`,
    ...verticalPosition,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    '--select-text': theme.getPropertyValue('--text-primary') || theme.getPropertyValue('--t-text'),
    '--select-strong':
      theme.getPropertyValue('--t-strong') || theme.getPropertyValue('--text-primary'),
    '--select-raised':
      theme.getPropertyValue('--surface-raised') || theme.getPropertyValue('--t-raised'),
    '--select-control':
      theme.getPropertyValue('--surface-control') || theme.getPropertyValue('--t-control'),
    '--select-border':
      theme.getPropertyValue('--border-color') || theme.getPropertyValue('--t-divider'),
    '--select-accent': theme.getPropertyValue('--accent') || theme.getPropertyValue('--t-accent'),
    '--select-font-family': typography.fontFamily,
    '--select-font-size': typography.fontSize,
    '--select-font-weight': typography.fontWeight,
  };
}
function choose(option: ThemedSelectOption): void {
  if (option.disabled) return;
  emit('update:modelValue', option.value);
  emit('change', option.value);
  close();
}
function onScroll(event: Event): void {
  const target = event.target as Node | null;
  // The popover is teleported to body. Its own wheel/scrollbar scrolling must
  // never be mistaken for a page scroll and close the menu.
  if (target && panel.value?.contains(target)) return;
  if (open.value) position();
}
function close(): void {
  if (panel.value?.open) panel.value.close();
  open.value = false;
  pointerArmed = false;
}
onMounted(() => {
  measureContentWidth();
  document.fonts?.ready.then(measureContentWidth);
  document.addEventListener('pointermove', updateTriggerHover, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', clearTriggerHover);
  window.addEventListener('scroll', onScroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointermove', updateTriggerHover, true);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('blur', clearTriggerHover);
  window.removeEventListener('scroll', onScroll, true);
});
function clearTriggerHover(): void {
  triggerHovered.value = false;
}
function onResize(): void {
  measureContentWidth();
  close();
}
watch(
  () => [
    props.modelValue,
    props.minWidth,
    ...props.options.flatMap((item) => [item.label, item.icon]),
  ],
  () => nextTick(measureContentWidth),
);
</script>

<template>
  <div
    ref="trigger"
    class="themed-select-control"
    :class="{ disabled, open, 'trigger-hovered': triggerHovered }"
    :style="controlStyle"
  >
    <div class="themed-select-display" aria-hidden="true" :style="controlStyle">
      <img v-if="selected?.icon" :src="selected.icon" alt="" />
      <span :title="selected?.label ?? ariaLabel">{{ selected?.label ?? ariaLabel }}</span
      ><i>⌄</i>
    </div>
    <button
      class="themed-select-hit-target"
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :style="controlStyle"
      @pointerdown.stop="armPointer"
      @click.prevent.stop="onTriggerClick"
      @keydown.enter.prevent.stop="toggle"
      @keydown.space.prevent.stop="toggle"
    ></button>
    <Teleport to="body">
      <dialog
        v-if="open"
        ref="panel"
        class="themed-select-popover"
        :style="panelStyle"
        role="listbox"
        @cancel.prevent="close"
        @pointerdown.stop
        @click.self="close"
        @wheel.stop
      >
        <button
          v-for="option in options"
          :key="String(option.value)"
          type="button"
          :disabled="option.disabled"
          :class="{ active: String(option.value) === String(modelValue) }"
          @click="choose(option)"
        >
          <img v-if="option.icon" :src="option.icon" alt="" />
          <span :title="option.label">{{ option.label }}</span
          ><b v-if="String(option.value) === String(modelValue)">✓</b>
        </button>
      </dialog>
    </Teleport>
  </div>
</template>

<style>
.themed-select-control {
  display: inline-block !important;
  position: relative;
  min-width: 0;
  align-self: start;
  flex: 0 0 auto;
  place-self: start;
  justify-self: start;
  pointer-events: none;
}
.themed-select-display {
  display: grid !important;
  min-width: 0;
  max-width: calc(100vw - 16px);
  min-height: 38px;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-color, var(--t-divider)) !important;
  border-radius: 10px !important;
  color: var(--text-primary, var(--t-text)) !important;
  background: var(--surface-control, var(--t-control)) !important;
  padding: 0 10px !important;
  text-align: left;
  pointer-events: none;
  contain: layout paint;
}
.themed-select-control:not(.trigger-hovered):not(.open) > .themed-select-display {
  border-color: var(--border-color, var(--t-divider)) !important;
  color: var(--text-primary, var(--t-text)) !important;
  background: var(--surface-control, var(--t-control)) !important;
  box-shadow: none !important;
  transform: none !important;
}
.themed-select-control.trigger-hovered > .themed-select-display,
.themed-select-control.open > .themed-select-display {
  border-color: var(--accent, var(--t-accent)) !important;
  background: color-mix(
    in srgb,
    var(--accent, var(--t-accent)) 12%,
    var(--surface-control, var(--t-control))
  ) !important;
}
.themed-select-display:not(:has(img)) {
  grid-template-columns: minmax(0, 1fr) auto;
}
.themed-select-hit-target {
  position: absolute !important;
  inset: 0 auto auto 0 !important;
  z-index: 2;
  display: block !important;
  min-height: 38px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 10px !important;
  background: transparent !important;
  box-shadow: none !important;
  opacity: 0 !important;
  pointer-events: auto;
}
.themed-select-control img,
.themed-select-popover img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.themed-select-control span,
.themed-select-popover span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.themed-select-control i {
  font-style: normal;
  transition: transform 0.16s ease;
}
.themed-select-control.open i {
  transform: rotate(180deg);
}
.themed-select-popover {
  position: fixed;
  inset: auto;
  display: grid;
  overflow: auto;
  box-sizing: border-box;
  margin: 0;
  gap: 3px;
  border: 1px solid var(--select-border, #697780);
  border-radius: 12px;
  color: var(--select-text, #eef4f6);
  background: color-mix(in srgb, var(--select-raised, #18242b) 96%, transparent);
  padding: 6px;
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(20px) saturate(1.15);
  font-family: var(--select-font-family, inherit);
  font-size: var(--select-font-size, inherit);
  font-weight: var(--select-font-weight, inherit);
}
.themed-select-popover::backdrop {
  background: transparent;
}
.themed-select-popover > button {
  display: grid !important;
  min-height: 38px;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 0 !important;
  border-radius: 8px !important;
  color: inherit !important;
  background: transparent !important;
  padding: 6px 9px !important;
  text-align: left;
  font: inherit !important;
}
.themed-select-popover > button:not(:has(img)) {
  grid-template-columns: minmax(0, 1fr) auto;
}
.themed-select-popover > button:hover,
.themed-select-popover > button.active {
  color: var(--select-strong, #fff) !important;
  background: color-mix(
    in srgb,
    var(--select-accent, #55d8c0) 22%,
    var(--select-control, #26343c)
  ) !important;
}
.themed-select-popover b {
  color: var(--select-accent, #55d8c0);
}
.themed-select-control.disabled {
  opacity: 0.55;
}
</style>
