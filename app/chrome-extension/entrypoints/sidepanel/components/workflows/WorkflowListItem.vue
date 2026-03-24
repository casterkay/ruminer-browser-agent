<template>
  <div
    class="workflow-item"
    :style="itemStyle"
    @mouseenter="showActions = true"
    @mouseleave="showActions = false"
  >
    <div class="workflow-content">
      <!-- Title and description -->
      <div class="workflow-info">
        <div class="flex items-center gap-2">
          <img
            v-if="platformIcon"
            :src="`/platform-icons/${platformIcon.file}`"
            :alt="platformIcon.alt"
            class="workflow-platform-icon mb-0.5"
          />
          <div class="workflow-name" :style="nameStyle">{{ flow.name || 'Untitled' }}</div>
          <span v-if="props.isLaunching" class="workflow-status-badge workflow-status-launching">
            <span
              class="workflow-status-dot workflow-status-dot-pulse"
              style="background-color: var(--ac-warning, #d97706)"
            ></span>
            Starting
          </span>
          <span
            v-else-if="activeRun?.isInProgress"
            class="workflow-status-badge workflow-status-running"
          >
            <span
              class="workflow-status-dot workflow-status-dot-pulse"
              style="background-color: var(--ac-primary, #3b82f6)"
            ></span>
            Running
          </span>
        </div>
        <div class="workflow-desc" :style="descStyle" :title="flow.description || ''">{{
          flow.description || 'No description'
        }}</div>
        <div
          v-if="activeRun?.isInProgress && props.activeRunProgress"
          class="mt-1 text-[11px] truncate"
          :style="{ color: 'var(--ac-text-subtle)' }"
          :title="props.activeRunProgress"
        >
          {{ props.activeRunProgress }}
        </div>
        <!-- Chips row: schedule + tags -->
        <div class="workflow-chips">
          <!-- Schedule chip -->
          <button
            v-if="!isIngestor"
            class="workflow-schedule-chip"
            :class="{
              'workflow-schedule-chip-active': scheduleEnabled,
            }"
            :style="scheduleChipStyle"
            @click.stop="toggleScheduleMenu()"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span>{{ scheduleChipLabel }}</span>
            <svg
              v-if="!isIngestor"
              class="schedule-chevron"
              :class="{ 'schedule-chevron-open': showScheduleMenu }"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>

            <!-- Schedule dropdown menu -->
            <Transition name="menu-fade">
              <div
                v-if="showScheduleMenu && !isIngestor"
                class="schedule-menu"
                :style="menuStyle"
                @click.stop
              >
                <button
                  class="schedule-menu-item"
                  :class="{ 'schedule-menu-item-active': schedulePreset === 'off' }"
                  :style="schedulePreset === 'off' ? menuItemActiveStyle : menuItemStyle"
                  @click.stop="onSchedulePresetChange('off')"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span>Off</span>
                </button>
                <button
                  class="schedule-menu-item"
                  :class="{ 'schedule-menu-item-active': schedulePreset === 'every6h' }"
                  :style="schedulePreset === 'every6h' ? menuItemActiveStyle : menuItemStyle"
                  @click.stop="onSchedulePresetChange('every6h')"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span>Every 6h</span>
                </button>
                <button
                  class="schedule-menu-item"
                  :class="{ 'schedule-menu-item-active': schedulePreset === 'daily2am' }"
                  :style="schedulePreset === 'daily2am' ? menuItemActiveStyle : menuItemStyle"
                  @click.stop="onSchedulePresetChange('daily2am')"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span>Daily 2am</span>
                </button>
              </div>
            </Transition>
          </button>

          <!-- Tags -->
          <template v-if="hasTags">
            <span v-if="flow.meta?.domain" class="workflow-tag" :style="tagDomainStyle">
              {{ flow.meta.domain }}
            </span>
            <span
              v-for="tag in flow.meta?.tags || []"
              :key="tag"
              class="workflow-tag"
              :style="tagStyle"
            >
              {{ tag }}
            </span>
          </template>
        </div>
      </div>

      <!-- Actions -->
      <div
        class="workflow-actions"
        :class="{ 'workflow-actions-visible': showActions || props.isLaunching }"
      >
        <button
          v-if="activeRun?.isInProgress"
          class="workflow-action workflow-action-danger"
          :style="actionDangerStyle"
          @click.stop="$emit('stopRun', { runId: activeRun.id, status: activeRun.status })"
          title="Stop workflow"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M6 6h12v12H6z" />
          </svg>
        </button>
        <button
          v-else
          class="workflow-action workflow-action-primary"
          :style="actionPrimaryStyle"
          :disabled="props.isLaunching"
          @click.stop="$emit('run', flow.id)"
          :title="props.isLaunching ? 'Starting...' : 'Run workflow'"
        >
          <svg
            v-if="props.isLaunching"
            class="animate-spin"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button
          class="workflow-action"
          :style="actionStyle"
          @click.stop="$emit('edit', flow.id)"
          title="Edit workflow"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          class="workflow-action workflow-action-more"
          :style="actionStyle"
          @click.stop="toggleMoreMenu"
          title="More actions"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>

        <!-- More menu dropdown -->
        <Transition name="menu-fade">
          <div v-if="showMoreMenu" class="workflow-more-menu" :style="menuStyle" @click.stop>
            <button class="workflow-menu-item" :style="menuItemStyle" @click="handleExport">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              <span>Export</span>
            </button>
            <button
              class="workflow-menu-item workflow-menu-item-danger"
              :style="menuItemDangerStyle"
              @click="handleDelete"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span>Delete</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

interface FlowLite {
  id: string;
  name: string;
  description?: string;
  meta?: {
    domain?: string;
    tags?: string[];
    bindings?: any[];
  };
}

const props = defineProps<{
  flow: FlowLite;
  activeRun?: { id: string; status: string; isInProgress?: boolean } | null;
  activeRunProgress?: string | null;
  scheduleTrigger?: { id: string; enabled?: boolean; cron?: string } | null;
  isLaunching?: boolean;
}>();

const emit = defineEmits<{
  (e: 'run', id: string): void;
  (e: 'stopRun', payload: { runId: string; status: string }): void;
  (e: 'edit', id: string): void;
  (e: 'delete', id: string): void;
  (e: 'export', id: string): void;
  (e: 'scheduleChange', payload: { flowId: string; cron: string | null; enabled: boolean }): void;
}>();

const showActions = ref(false);
const showMoreMenu = ref(false);
const showScheduleMenu = ref(false);

type SchedulePreset = 'off' | 'every6h' | 'daily2am' | 'custom';

const schedulePreset = ref<SchedulePreset>('off');
const scheduleEnabled = ref(false);

const CRON_PRESETS: Record<Exclude<SchedulePreset, 'custom'>, string | null> = {
  off: null,
  every6h: '0 */6 * * *',
  daily2am: '0 2 * * *',
};

function presetForCron(cron: string | undefined): SchedulePreset {
  if (!cron) return 'off';
  if (cron === CRON_PRESETS.every6h) return 'every6h';
  if (cron === CRON_PRESETS.daily2am) return 'daily2am';
  return 'custom';
}

const scheduleChipLabel = computed(() => {
  switch (schedulePreset.value) {
    case 'off':
      return 'Schedule: Off';
    case 'every6h':
      return 'Every 6h';
    case 'daily2am':
      return 'Daily 2am';
    case 'custom':
      return 'Custom';
    default:
      return 'Schedule';
  }
});

function applyScheduleFromTrigger(): void {
  // If trigger is disabled, always show 'off' regardless of cron value
  if (props.scheduleTrigger?.enabled !== true) {
    schedulePreset.value = 'off';
    scheduleEnabled.value = false;
    return;
  }
  schedulePreset.value = presetForCron(props.scheduleTrigger?.cron);
  scheduleEnabled.value = props.scheduleTrigger?.enabled === true;
}

onMounted(() => {
  applyScheduleFromTrigger();
});

// Keep local state in sync with upstream trigger changes.
watch(
  () => props.scheduleTrigger,
  () => applyScheduleFromTrigger(),
);

function emitScheduleChange(next: { cron: string | null; enabled: boolean }): void {
  emit('scheduleChange', { flowId: props.flow.id, ...next });
}

function onSchedulePresetChange(nextPresetRaw: string): void {
  const nextPreset = (nextPresetRaw as SchedulePreset) || 'off';

  if (nextPreset === 'off') {
    schedulePreset.value = 'off';
    scheduleEnabled.value = false;
    emitScheduleChange({ cron: null, enabled: false });
    return;
  }

  if (nextPreset === 'custom') {
    // Custom presets are managed via the trigger builder/editor.
    schedulePreset.value = presetForCron(props.scheduleTrigger?.cron);
    return;
  }

  schedulePreset.value = nextPreset;
  scheduleEnabled.value = true;
  emitScheduleChange({ cron: CRON_PRESETS[nextPreset], enabled: true });
}

const hasTags = computed(() => {
  return props.flow.meta?.domain || (props.flow.meta?.tags?.length ?? 0) > 0;
});

const isIngestor = computed(() => {
  const tags = props.flow.meta?.tags || [];
  return tags.some((tag) => tag.toLowerCase() === 'ingestor');
});

// Platform icon detection from tags or domain
const PLATFORM_ICONS: Record<string, { file: string; alt: string }> = {
  chatgpt: { file: 'chatgpt.svg', alt: 'ChatGPT' },
  gemini: { file: 'gemini.svg', alt: 'Gemini' },
  claude: { file: 'claude.png', alt: 'Claude' },
  deepseek: { file: 'deepseek.svg', alt: 'DeepSeek' },
  grok: { file: 'grok.svg', alt: 'Grok' },
  ingestor: { file: 'inbox.svg', alt: 'Ingestor' },
};

const platformIcon = computed(() => {
  const tags = props.flow.meta?.tags || [];
  const domain = props.flow.meta?.domain?.toLowerCase();

  // Check tags first
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    if (PLATFORM_ICONS[lowerTag]) {
      return PLATFORM_ICONS[lowerTag];
    }
  }

  // Check domain
  if (domain && PLATFORM_ICONS[domain]) {
    return PLATFORM_ICONS[domain];
  }

  return null;
});

// Close menu when clicking outside
function handleClickOutside(e: MouseEvent) {
  if (showMoreMenu.value) {
    showMoreMenu.value = false;
  }
  if (showScheduleMenu.value) {
    showScheduleMenu.value = false;
  }
}

function toggleScheduleMenu() {
  showScheduleMenu.value = !showScheduleMenu.value;
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value;
}

function handleDelete() {
  showMoreMenu.value = false;
  emit('delete', props.flow.id);
}

function handleExport() {
  showMoreMenu.value = false;
  emit('export', props.flow.id);
}

// Computed styles using CSS variables
const itemStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  borderRadius: 'var(--ac-radius-card, 12px)',
  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4)',
  transition: 'all var(--ac-motion-fast, 120ms) ease',
}));

const nameStyle = computed(() => ({
  color: 'var(--ac-text, #1a1a1a)',
}));

const descStyle = computed(() => ({
  color: 'var(--ac-text-muted, #6e6e6e)',
}));

const tagDomainStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent-subtle, rgba(217, 119, 87, 0.12))',
  color: 'var(--ac-accent, #d97757)',
}));

const tagStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted, #f2f0eb)',
  color: 'var(--ac-text-muted, #6e6e6e)',
}));

const actionStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted, #f2f0eb)',
  color: 'var(--ac-text-muted, #6e6e6e)',
  borderRadius: 'var(--ac-radius-button, 8px)',
}));

const actionPrimaryStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent, #d97757)',
  color: 'var(--ac-accent-contrast, #ffffff)',
  borderRadius: 'var(--ac-radius-button, 8px)',
}));

const actionDangerStyle = computed(() => ({
  backgroundColor: 'var(--ac-danger, #ef4444)',
  color: 'var(--ac-accent-contrast, #ffffff)',
  borderRadius: 'var(--ac-radius-button, 8px)',
}));

const scheduleSelectStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted, #f2f0eb)',
  color: 'var(--ac-text-muted, #6e6e6e)',
  border: '1px solid var(--ac-border, #e7e5e4)',
}));

const scheduleChipStyle = computed(() => ({
  backgroundColor: scheduleEnabled.value ? 'rgba(217, 119, 87, 0.15)' : 'rgba(59, 130, 246, 0.12)',
  color: scheduleEnabled.value ? 'var(--ac-accent, #d97757)' : 'var(--ac-primary, #3b82f6)',
  borderRadius: '99px',
}));

const scheduleChipDisabledStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted, #f2f0eb)',
  color: 'var(--ac-text-disabled, #a8a8a8)',
  borderRadius: '99px',
  cursor: 'not-allowed',
  opacity: 0.7,
}));

const menuItemActiveStyle = computed(() => ({
  backgroundColor: 'rgba(59, 130, 246, 0.12)',
  color: 'var(--ac-primary, #3b82f6)',
}));

const menuStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface, #ffffff)',
  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4)',
  borderRadius: 'var(--ac-radius-inner, 8px)',
  boxShadow: 'var(--ac-shadow-float, 0 4px 20px -2px rgba(0, 0, 0, 0.1))',
}));

const menuItemStyle = computed(() => ({
  color: 'var(--ac-text, #1a1a1a)',
}));

const menuItemDangerStyle = computed(() => ({
  color: 'var(--ac-danger, #ef4444)',
}));
</script>

<style scoped>
.workflow-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4);
  appearance: none;
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.workflow-checkbox:checked {
  background-color: var(--ac-accent, #d97757);
  border-color: var(--ac-accent, #d97757);
  background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e");
}

.workflow-item {
  padding: 16px;
  cursor: pointer;
}

.workflow-item:hover {
  background-color: var(--ac-hover-bg, #f5f5f4) !important;
  box-shadow: var(--ac-shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.workflow-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workflow-info {
  flex: 1;
  min-width: 0;
}

.workflow-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  margin-bottom: 2px;
  word-break: break-word;
}

.workflow-platform-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: contain;
}

.workflow-desc {
  font-size: 13px;
  line-height: 1.4;
  margin-bottom: 8px;
  word-break: break-word;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.workflow-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.workflow-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Schedule chip */
.workflow-schedule-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
  white-space: nowrap;
}

.workflow-schedule-chip:hover {
  filter: brightness(0.95);
}

.workflow-schedule-chip-active {
  font-weight: 600;
}

.workflow-schedule-chip-disabled {
  cursor: not-allowed;
}

.schedule-chevron {
  transition: transform var(--ac-motion-fast, 120ms) ease;
}

.schedule-chevron-open {
  transform: rotate(180deg);
}

/* Schedule dropdown menu */
.schedule-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 140px;
  padding: 4px;
  z-index: 50;
}

.schedule-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  background: transparent;
  border: none;
  border-radius: var(--ac-radius-button, 8px);
  cursor: pointer;
  transition: background-color var(--ac-motion-fast, 120ms) ease;
  text-align: left;
}

.schedule-menu-item:hover {
  background-color: var(--ac-hover-bg, #f5f5f4);
}

.schedule-menu-item-active {
  font-weight: 500;
}

.workflow-tag {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 99px;
  white-space: nowrap;
  height: 26px;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
}

.workflow-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity var(--ac-motion-fast, 120ms) ease;
  position: relative;
}

.workflow-actions-visible {
  opacity: 1;
}

.workflow-action {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.workflow-action:hover {
  transform: translateY(-1px);
  box-shadow: var(--ac-shadow-float, 0 4px 20px -2px rgba(0, 0, 0, 0.05));
}

.workflow-action-primary:hover {
  background-color: var(--ac-accent-hover, #c4664a) !important;
}

.workflow-more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 140px;
  padding: 4px;
  z-index: 100;
}

.workflow-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  background: transparent;
  border: none;
  border-radius: var(--ac-radius-button, 8px);
  cursor: pointer;
  transition: background-color var(--ac-motion-fast, 120ms) ease;
  text-align: left;
}

.workflow-menu-item:hover {
  background-color: var(--ac-hover-bg, #f5f5f4);
}

.workflow-menu-item-danger:hover {
  background-color: rgba(239, 68, 68, 0.1);
}

/* Menu fade transition */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity var(--ac-motion-fast, 120ms) ease,
    transform var(--ac-motion-fast, 120ms) ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Loading spinner */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 0.75s linear infinite;
}

.workflow-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Status badge */
.workflow-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px 1px 6px;
  border-radius: 10px;
  line-height: 1.6;
}

.workflow-status-launching {
  background-color: var(--ac-warning-light, #fef3c7);
  color: var(--ac-warning, #d97706);
}

.workflow-status-running {
  background-color: var(--ac-primary-light, #dbeafe);
  color: var(--ac-primary, #3b82f6);
}

.workflow-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.workflow-status-dot-pulse {
  animation: status-pulse 1.5s ease-in-out infinite;
}

@keyframes status-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
