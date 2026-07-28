<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    positionX?: number;
    positionY?: number;
  }>(),
  {
    alt: '',
    positionX: 0.5,
    positionY: 0.5,
  },
);

const canvas = ref<HTMLCanvasElement | null>(null);
let image: HTMLImageElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let frame = 0;
let loadVersion = 0;

function drawingContext(target: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = target.getContext('2d', { alpha: true });
  if (context) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
  }
  return context;
}

function draw(): void {
  const target = canvas.value;
  const source = image;
  if (!target || !source || !source.complete || !source.naturalWidth || !source.naturalHeight)
    return;

  const bounds = target.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * dpr));
  const height = Math.max(1, Math.round(bounds.height * dpr));
  if (target.width !== width) target.width = width;
  if (target.height !== height) target.height = height;

  const scale = Math.max(width / source.naturalWidth, height / source.naturalHeight);
  const cropWidth = Math.min(source.naturalWidth, width / scale);
  const cropHeight = Math.min(source.naturalHeight, height / scale);
  const sourceX = (source.naturalWidth - cropWidth) * props.positionX;
  const sourceY = (source.naturalHeight - cropHeight) * props.positionY;

  let current: HTMLImageElement | HTMLCanvasElement = source;
  let currentX = sourceX;
  let currentY = sourceY;
  let currentWidth = cropWidth;
  let currentHeight = cropHeight;

  // Chromium softens very large one-step reductions. Repeated halving preserves
  // fine line art before the final high-quality sample at the physical pixel size.
  while (currentWidth > width * 2 || currentHeight > height * 2) {
    const nextWidth = Math.max(width, Math.round(currentWidth / 2));
    const nextHeight = Math.max(height, Math.round(currentHeight / 2));
    const intermediate = document.createElement('canvas');
    intermediate.width = nextWidth;
    intermediate.height = nextHeight;
    const context = drawingContext(intermediate);
    if (!context) return;
    context.drawImage(
      current,
      currentX,
      currentY,
      currentWidth,
      currentHeight,
      0,
      0,
      nextWidth,
      nextHeight,
    );
    current = intermediate;
    currentX = 0;
    currentY = 0;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const context = drawingContext(target);
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.drawImage(current, currentX, currentY, currentWidth, currentHeight, 0, 0, width, height);
}

function scheduleDraw(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

async function load(): Promise<void> {
  const version = ++loadVersion;
  const nextImage = new Image();
  nextImage.src = props.src;
  try {
    await nextImage.decode();
  } catch {
    return;
  }
  if (version !== loadVersion) return;
  image = nextImage;
  await nextTick();
  scheduleDraw();
}

watch(() => props.src, load, { immediate: true });
watch(() => [props.positionX, props.positionY], scheduleDraw);

onMounted(() => {
  if (canvas.value) {
    resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(canvas.value);
  }
  scheduleDraw();
});

onBeforeUnmount(() => {
  loadVersion += 1;
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
});
</script>

<template>
  <canvas ref="canvas" role="img" :aria-label="alt" />
</template>
