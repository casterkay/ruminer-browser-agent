<template>
  <div class="py-1">
    <div
      class="text-sm leading-relaxed markdown-content"
      :style="{
        color: 'var(--ac-text)',
        fontFamily: 'var(--ac-font-body)',
      }"
    >
      <MarkdownRender
        :content="processedContent"
        :custom-id="AGENTCHAT_MD_SCOPE"
        :custom-html-tags="CUSTOM_HTML_TAGS"
        :max-live-nodes="0"
        :render-batch-size="16"
        :render-batch-delay="8"
      />
    </div>
    <span
      v-if="item.isStreaming"
      class="inline-block w-1.5 h-4 ml-0.5 ac-pulse"
      :style="{ backgroundColor: 'var(--ac-accent)' }"
    />
  </div>
</template>

<script lang="ts" setup>
import MarkdownRender from 'markstream-vue';
import 'markstream-vue/index.css';
import { computed } from 'vue';
import type { TimelineItem } from '../../../composables/useAgentThreads';
// Import to register custom components (side-effect)
import { AGENTCHAT_MD_SCOPE } from './markstream-thinking';
import { formatAssistantMarkdownWithEmosCitations } from '../../../composables/emos-citations';

/** Custom HTML tags to be rendered by registered custom components */
const CUSTOM_HTML_TAGS = ['thinking', 'emos-cite'] as const;

const props = defineProps<{
  item: Extract<TimelineItem, { kind: 'assistant_text' }>;
}>();

const processedContent = computed(() => {
  return formatAssistantMarkdownWithEmosCitations(props.item.text ?? '');
});
</script>

<style scoped>
.markdown-content {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* markstream-vue ships contain-intrinsic-size:800px 600px with a :deep() override that
   is invalid in plain CSS and silently ignored by browsers, leaving ghost 800px widths
   when content-visibility:auto skips off-screen elements. Force visible rendering. */
.markdown-content :deep(.markdown-renderer) {
  content-visibility: visible;
}

.markdown-content :deep(pre) {
  background-color: var(--ac-code-bg);
  border: var(--ac-border-width) solid var(--ac-code-border);
  border-radius: var(--ac-radius-inner);
  padding: 12px;
  overflow-x: auto;
}

.markdown-content :deep(code) {
  font-family: var(--ac-font-mono);
  font-size: 0.875em;
  color: var(--ac-code-text);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown-content :deep(p) {
  margin: 0.5em 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin: 0.75em 0 0.5em;
  font-weight: 600;
}

.markdown-content :deep(h1:first-child),
.markdown-content :deep(h2:first-child),
.markdown-content :deep(h3:first-child),
.markdown-content :deep(h4:first-child) {
  margin-top: 0;
}

.markdown-content :deep(blockquote) {
  border-left: var(--ac-border-width-strong) solid var(--ac-border);
  padding-left: 1em;
  margin: 0.5em 0;
  color: var(--ac-text-muted);
}

.markdown-content :deep(a) {
  color: var(--ac-link);
  text-decoration: underline;
}

.markdown-content :deep(a:hover) {
  color: var(--ac-link-hover);
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
  width: 100%;
  max-width: 100%;
  display: block;
  overflow-x: auto;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: var(--ac-border-width) solid var(--ac-border);
  padding: 0.5em;
  text-align: left;
}

.markdown-content :deep(th) {
  background-color: var(--ac-surface-muted);
}

.markdown-content :deep(hr) {
  border: none;
  border-top: var(--ac-border-width) solid var(--ac-border);
  margin: 1em 0;
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--ac-radius-inner);
}
</style>
