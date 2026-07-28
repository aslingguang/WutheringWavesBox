<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';

const openDialogs: symbol[] = [];

const props = withDefaults(
  defineProps<{
    open: boolean;
    backdropClass?: string;
    closeOnOutside?: boolean;
  }>(),
  { backdropClass: '', closeOnOutside: true },
);
const emit = defineEmits<{ close: [] }>();
const dialogId = Symbol('app-dialog');

function close(): void {
  emit('close');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open && openDialogs.at(-1) === dialogId) close();
}

function removeFromStack(): void {
  const index = openDialogs.lastIndexOf(dialogId);
  if (index >= 0) openDialogs.splice(index, 1);
}

watch(
  () => props.open,
  (open) => {
    removeFromStack();
    if (open) {
      openDialogs.push(dialogId);
      document.addEventListener('keydown', onKeydown);
    } else document.removeEventListener('keydown', onKeydown);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  removeFromStack();
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="#app-dialog-root" defer>
    <div
      v-if="open"
      class="app-dialog-backdrop modal-backdrop"
      :class="backdropClass"
      @click.self="closeOnOutside && close()"
    >
      <slot />
    </div>
  </Teleport>
</template>
