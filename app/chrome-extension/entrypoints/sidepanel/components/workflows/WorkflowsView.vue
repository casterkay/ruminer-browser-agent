<template>
  <div ref="rootRef" class="h-full flex flex-col" :style="containerStyle">
    <!-- Fixed Header: Search + Actions -->
    <div class="flex-shrink-0 px-4 py-3 border-b" :style="headerStyle">
      <div class="flex items-center gap-2">
        <!-- Search Input -->
        <div class="flex-1 relative">
          <svg
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            :style="{ color: 'var(--ac-text-subtle)' }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search workflows..."
            class="w-full pl-9 pr-3 py-2 text-sm"
            :style="inputStyle"
          />
        </div>

        <!-- Refresh Button -->
        <button
          class="flex-shrink-0 p-2"
          :style="refreshButtonStyle"
          :disabled="props.refreshing"
          @click="$emit('refresh')"
          title="Refresh"
        >
          <svg
            class="w-4 h-4 transition-transform"
            :class="{ 'animate-spin-slow': props.refreshing }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        <!-- New Workflow Button -->
        <button
          class="flex-shrink-0 px-3 py-2 text-sm font-medium"
          :style="newButtonStyle"
          @click="$emit('create')"
        >
          <span class="flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            New
          </span>
        </button>
      </div>

      <!-- Filter Bar -->
      <div class="flex items-center justify-between mt-3">
        <label
          class="flex items-center gap-2 text-sm cursor-pointer"
          :style="{ color: 'var(--ac-text-muted)' }"
          :title="'Filter workflows by active tab domain'"
        >
          <input
            type="checkbox"
            :checked="onlyBound"
            @change="$emit('update:onlyBound', ($event.target as HTMLInputElement).checked)"
            class="workflow-checkbox"
          />
          <span>{{ 'Filter by active tab domain' }}</span>
        </label>
        <span class="text-xs" :style="{ color: 'var(--ac-text-subtle)' }">
          {{ filteredFlows.length }} workflow{{ filteredFlows.length !== 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto ac-scroll">
      <!-- Queue Progress (hidden when queue is empty) -->
      <div v-if="queueProgress?.queueSize && queueProgress.queueSize > 0" class="px-4 pt-3">
        <div class="rounded-xl p-3 border" :style="sectionStyle">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-medium" :style="{ color: 'var(--ac-text)' }">Queue</div>
              <div class="text-xs mt-0.5" :style="{ color: 'var(--ac-text-subtle)' }">
                {{ queueProgress.running }} running • {{ queueProgress.queued }} queued •
                {{ queueProgress.paused }} paused
              </div>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                class="p-2 rounded transition-colors disabled:opacity-50"
                :style="queueButtonStyle"
                :disabled="queueProgress.running === 0 && queueProgress.paused === 0"
                @click="toggleQueuePauseResume"
                :title="
                  queueProgress.running > 0 ? 'Pause all running runs' : 'Resume all paused runs'
                "
              >
                <ILucidePause v-if="queueProgress.running > 0" class="w-4 h-4" />
                <ILucidePlay v-else class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded transition-colors disabled:opacity-50"
                :style="queueStopButtonStyle"
                @click="$emit('stopQueue')"
                title="Stop all queued/running/paused runs"
              >
                <ILucideSquare class="w-4 h-4 fill-current" />
              </button>
            </div>
          </div>

          <div class="mt-3">
            <div
              class="flex items-center justify-between text-xs"
              :style="{ color: 'var(--ac-text-muted)' }"
            >
              <span>Progress</span>
              <span>{{ queueProgress.done }}/{{ queueProgress.total }}</span>
            </div>
            <div
              class="mt-2 h-2 rounded-full overflow-hidden"
              :style="{ backgroundColor: 'var(--ac-surface-muted)' }"
            >
              <div
                class="h-full transition-all"
                :style="{
                  width:
                    queueProgress.total > 0
                      ? `${Math.round((queueProgress.done / queueProgress.total) * 100)}%`
                      : '0%',
                  backgroundColor: 'var(--ac-accent)',
                }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="filteredFlows.length === 0"
        class="flex flex-col items-center justify-center py-12 px-4"
      >
        <div
          class="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          :style="{ backgroundColor: 'var(--ac-surface-muted)' }"
        >
          <svg
            class="w-8 h-8"
            :style="{ color: 'var(--ac-text-subtle)' }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
            />
          </svg>
        </div>
        <div class="text-sm font-medium mb-1" :style="{ color: 'var(--ac-text)' }">
          {{ searchQuery ? 'No matching workflows' : 'No workflows yet' }}
        </div>
        <div class="text-xs text-center mb-4" :style="{ color: 'var(--ac-text-muted)' }">
          {{
            searchQuery ? 'Try a different search term' : 'Record your first automation workflow'
          }}
        </div>
        <button
          v-if="!searchQuery"
          class="px-4 py-2 text-sm font-medium"
          :style="newButtonStyle"
          @click="$emit('create')"
        >
          Create Workflow
        </button>
      </div>

      <!-- Workflow List -->
      <div v-else class="px-4 py-3 space-y-3">
        <WorkflowListItem
          v-for="flow in filteredFlows"
          :key="flow.id"
          :flow="flow"
          :active-run="activeRunByFlowId.get(flow.id) ?? null"
          :active-run-progress="activeRunProgressByFlowId.get(flow.id) ?? null"
          :schedule-trigger="scheduleTriggerByFlowId.get(flow.id) ?? null"
          :is-launching="props.runningFlowIds?.has(flow.id) ?? false"
          @run="$emit('run', $event)"
          @stop-run="$emit('stopRun', $event)"
          @edit="$emit('edit', $event)"
          @delete="$emit('delete', $event)"
          @export="$emit('export', $event)"
          @schedule-change="$emit('scheduleChange', $event)"
        />
      </div>

      <!-- Run History Section -->
      <div class="advanced-section m-4" :style="sectionStyle">
        <button
          class="advanced-section-header"
          :style="sectionHeaderStyle"
          @click="toggleSection('runs')"
        >
          <div class="flex items-center gap-2">
            <svg
              class="w-4 h-4 transition-transform"
              :class="{ 'rotate-90': expandedSections.has('runs') }"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span>Run History</span>
          </div>
          <span class="text-xs" :style="{ color: 'var(--ac-text-subtle)' }">{{ runs.length }}</span>
        </button>

        <Transition name="section-expand">
          <div v-if="expandedSections.has('runs')" class="advanced-section-content">
            <div
              v-if="runs.length === 0"
              class="text-sm py-3"
              :style="{ color: 'var(--ac-text-muted)' }"
            >
              No run history yet
            </div>
            <div v-else class="space-y-2 py-2">
              <div
                v-for="run in runs.slice(0, 5)"
                :key="run.id"
                class="run-item"
                :style="runItemStyle"
                @click="$emit('toggleRun', run.id)"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span
                      class="w-2 h-2 rounded-full"
                      :class="{ 'animate-pulse': run.isInProgress }"
                      :style="{ backgroundColor: getRunStatusColor(run) }"
                    ></span>
                    <span class="text-sm" :style="{ color: 'var(--ac-text)' }">{{
                      getFlowName(run.flowId)
                    }}</span>
                    <span
                      v-if="run.status"
                      class="text-xs px-1.5 py-0.5 rounded"
                      :style="{
                        backgroundColor: run.isInProgress
                          ? 'var(--ac-primary-light, #dbeafe)'
                          : run.success
                            ? 'var(--ac-success-light, #dcfce7)'
                            : 'var(--ac-danger-light, #fee2e2)',
                        color: getRunStatusColor(run),
                      }"
                    >
                      {{ getRunStatusText(run) }}
                    </span>
                  </div>
                  <span class="text-xs" :style="{ color: 'var(--ac-text-subtle)' }">
                    {{ formatTime(run.startedAt) }}
                  </span>
                </div>
                <!-- Run details (if expanded) -->
                <div
                  v-if="openRunId === run.id"
                  class="mt-2 pt-2 border-t"
                  :style="{ borderColor: 'var(--ac-border)' }"
                >
                  <!-- V3: Show status info when no entries -->
                  <div
                    v-if="run.entries.length === 0 && run.status"
                    class="text-xs py-1"
                    :style="{ color: 'var(--ac-text-muted)' }"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2">
                        <span>状态: {{ getRunStatusText(run) }}</span>
                        <span v-if="run.finishedAt"
                          >• 耗时:
                          {{
                            Math.round(
                              (new Date(run.finishedAt).getTime() -
                                new Date(run.startedAt).getTime()) /
                                1000,
                            )
                          }}s</span
                        >
                        <span v-if="run.currentNodeId">• 当前节点: {{ run.currentNodeId }}</span>
                        <span
                          v-if="run.flowVersionHash"
                          :title="run.flowVersionHash"
                          class="truncate"
                          >• hash: {{ formatHash(run.flowVersionHash) }}</span
                        >
                      </div>

                      <button
                        v-if="run.isInProgress"
                        class="text-xs px-2 py-1 rounded"
                        :style="{
                          backgroundColor: 'var(--ac-danger-light, #fee2e2)',
                          color: 'var(--ac-danger, #ef4444)',
                        }"
                        @click.stop="$emit('stopRun', { runId: run.id, status: run.status })"
                        title="Stop this run"
                      >
                        Stop
                      </button>
                    </div>

                    <div
                      v-if="run.repair?.needed"
                      class="mt-2 text-xs px-2 py-1 rounded"
                      :style="{
                        backgroundColor: 'var(--ac-warning-light, #fef3c7)',
                        color: 'var(--ac-warning, #d97706)',
                      }"
                    >
                      Needs repair • node={{ run.repair.nodeId }}
                    </div>

                    <div
                      v-if="run.error?.message"
                      class="mt-2 text-xs px-2 py-1 rounded"
                      :style="{
                        backgroundColor: 'var(--ac-danger-light, #fee2e2)',
                        color: 'var(--ac-danger, #ef4444)',
                      }"
                    >
                      {{ run.error.message }}
                    </div>

                    <div
                      v-if="openRunProcessedCounts"
                      class="mt-2 text-xs px-2 py-1 rounded"
                      :style="{
                        backgroundColor: 'var(--ac-surface-muted)',
                        color: 'var(--ac-text-muted)',
                        border: '1px solid var(--ac-border)',
                      }"
                    >
                      <div class="flex flex-wrap gap-x-2 gap-y-1">
                        <span v-if="openRunProcessedCounts.mode"
                          >Mode: {{ openRunProcessedCounts.mode }}</span
                        >
                        <span v-if="openRunProcessedCounts.scanned !== undefined"
                          >Scanned: {{ openRunProcessedCounts.scanned }}</span
                        >
                        <span v-if="openRunProcessedCounts.fetched !== undefined"
                          >Fetched: {{ openRunProcessedCounts.fetched }}</span
                        >
                      </div>
                      <div class="mt-1">
                        <span class="font-medium" :style="{ color: 'var(--ac-text)' }"
                          >Conversations</span
                        >:
                        <span v-if="openRunProcessedCounts.convIngested !== undefined"
                          >{{ openRunProcessedCounts.convIngested }} ingested</span
                        >
                        <span v-if="openRunProcessedCounts.convSkipped !== undefined"
                          >, {{ openRunProcessedCounts.convSkipped }} skipped</span
                        >
                        <span v-if="openRunProcessedCounts.convFailed !== undefined"
                          >, {{ openRunProcessedCounts.convFailed }} failed</span
                        >
                      </div>
                      <div class="mt-0.5">
                        <span class="font-medium" :style="{ color: 'var(--ac-text)' }"
                          >Messages</span
                        >:
                        <span v-if="openRunProcessedCounts.messagesPlus !== undefined"
                          >+{{ openRunProcessedCounts.messagesPlus }}</span
                        >
                        <span v-if="openRunProcessedCounts.msgSkipped !== undefined"
                          >, {{ openRunProcessedCounts.msgSkipped }} skipped</span
                        >
                        <span v-if="openRunProcessedCounts.msgFailed !== undefined"
                          >, {{ openRunProcessedCounts.msgFailed }} failed</span
                        >
                        <span
                          v-if="
                            openRunProcessedCounts.msgIngested !== undefined ||
                            openRunProcessedCounts.msgUpdated !== undefined
                          "
                          :style="{ color: 'var(--ac-text-subtle)' }"
                        >
                          ({{ openRunProcessedCounts.msgIngested ?? 0 }} ingested,
                          {{ openRunProcessedCounts.msgUpdated ?? 0 }} updated)
                        </span>
                      </div>
                    </div>

                    <div class="mt-2">
                      <div
                        v-if="openRunEventsLoading"
                        class="text-xs py-1"
                        :style="{ color: 'var(--ac-text-subtle)' }"
                      >
                        Loading events…
                      </div>
                      <div
                        v-else-if="openRunEvents.length === 0"
                        class="text-xs py-1"
                        :style="{ color: 'var(--ac-text-subtle)' }"
                      >
                        No events yet
                      </div>
                      <div v-else class="space-y-1">
                        <div
                          v-for="(event, idx) in openRunEvents"
                          :key="eventKey(event, idx)"
                          class="text-xs px-2 py-1 rounded"
                          :style="{
                            backgroundColor: 'var(--ac-surface-muted)',
                            color: 'var(--ac-text-muted)',
                          }"
                        >
                          <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                              <div class="truncate">{{ formatEventLabel(event) }}</div>
                              <div
                                v-if="event.type === 'log' && event.message"
                                class="mt-0.5"
                                :style="{ color: 'var(--ac-text-subtle)' }"
                              >
                                {{ event.message }}
                              </div>
                            </div>
                            <div class="flex-shrink-0" :style="{ color: 'var(--ac-text-subtle)' }">
                              {{ formatEventTime(event) }}
                            </div>
                          </div>

                          <div
                            v-if="event.type === 'artifact.screenshot' && event.data"
                            class="mt-2"
                          >
                            <img
                              :src="screenshotSrc(event.data)"
                              alt="artifact screenshot"
                              class="w-full rounded"
                              style="max-height: 220px; object-fit: cover"
                            />
                          </div>

                          <details
                            v-if="event.type === 'artifact.html_snippet' && event.data"
                            class="mt-2"
                          >
                            <summary class="cursor-pointer">HTML snippet</summary>
                            <pre class="mt-2 whitespace-pre-wrap break-words">{{ event.data }}</pre>
                          </details>
                        </div>
                      </div>
                    </div>

                    <div v-if="run.args?.conversationUrl" class="mt-2">
                      <button
                        class="text-xs px-2 py-1 rounded"
                        :style="{
                          backgroundColor: 'var(--ac-surface-muted)',
                          color: 'var(--ac-text-muted)',
                          border: '1px solid var(--ac-border)',
                        }"
                        @click.stop="openRunUrl(run.args.conversationUrl)"
                        title="Open the failing page in a new tab"
                      >
                        Open page
                      </button>
                    </div>
                  </div>
                  <!-- V2: Show entries -->
                  <div
                    v-for="(entry, idx) in run.entries"
                    :key="idx"
                    class="text-xs py-1"
                    :style="{
                      color:
                        entry.status === 'failed' ? 'var(--ac-danger)' : 'var(--ac-text-muted)',
                    }"
                  >
                    #{{ idx + 1 }} {{ entry.status }} - step={{ entry.stepId }}
                    <span v-if="entry.tookMs" class="ml-2">{{ entry.tookMs }}ms</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>

  <!-- Manual run result modal -->
  <Teleport :to="overlayTarget" :disabled="!overlayTarget">
    <div
      v-if="resultModalRunId"
      class="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Workflow result"
    >
      <div class="absolute inset-0 bg-black/60" @click="closeResultModal" />

      <div
        class="relative w-[92vw] max-w-2xl max-h-[88vh] overflow-hidden"
        :style="{
          backgroundColor: 'var(--ac-surface, #ffffff)',
          border: '1px solid var(--ac-border, #e5e5e5)',
          borderRadius: 'var(--ac-radius-card, 12px)',
          boxShadow: 'var(--ac-shadow-float, 0 4px 20px -2px rgba(0,0,0,0.2))',
        }"
      >
        <div class="px-4 py-3 border-b" :style="{ borderColor: 'var(--ac-border)' }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-medium truncate" :style="{ color: 'var(--ac-text)' }">
                {{ resultModalFlow?.name || resultModalRun?.flowId || 'Workflow' }}
              </div>
              <div class="text-xs mt-0.5" :style="{ color: 'var(--ac-text-subtle)' }">
                Status: {{ resultModalRun ? getRunStatusText(resultModalRun) : '' }}
              </div>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                v-if="isIngestorResult && resultModalSessionId && resultModalSessionExists"
                class="text-xs px-2 py-1 rounded"
                :style="newButtonStyle"
                @click="openChatSessionById(resultModalSessionId)"
                title="Open saved session in Chat"
              >
                Open in Chat
              </button>
              <button
                class="text-xs px-2 py-1 rounded"
                :style="queueButtonStyle"
                @click="closeResultModal"
                title="Close"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <div class="p-4 overflow-y-auto ac-scroll max-h-[78vh]">
          <div v-if="resultModalLoading" class="text-sm" :style="{ color: 'var(--ac-text-muted)' }">
            Loading…
          </div>

          <template v-else>
            <div
              v-if="resultModalRun?.error?.message"
              class="mb-3 text-xs px-2 py-1 rounded"
              :style="{
                backgroundColor: 'var(--ac-danger-light, #fee2e2)',
                color: 'var(--ac-danger, #ef4444)',
              }"
            >
              {{ resultModalRun.error.message }}
            </div>

            <!-- Ingestor result -->
            <div v-if="isIngestorResult" class="space-y-3">
              <div
                v-if="!resultModalIngest && resultModalSessionId"
                class="text-xs px-2 py-1 rounded"
                :style="{
                  backgroundColor: 'var(--ac-surface-muted, #f5f5f4)',
                  color: 'var(--ac-text-muted, #6b7280)',
                  border: '1px solid var(--ac-border, #e5e5e5)',
                }"
              >
                Ingest telemetry missing for this run; showing best-effort session derived from the
                conversation URL.
              </div>
              <div class="text-xs" :style="{ color: 'var(--ac-text-muted)' }">
                <div>
                  <span class="font-medium" :style="{ color: 'var(--ac-text)' }">Session</span>:
                  <span class="ml-1">{{ resultModalSessionId || '—' }}</span>
                </div>
                <div v-if="resultModalIngest?.conversationTitle">
                  <span class="font-medium" :style="{ color: 'var(--ac-text)' }">Title</span>:
                  <span class="ml-1">{{ resultModalIngest.conversationTitle }}</span>
                </div>
                <div v-if="resultModalIngest?.conversationUrl" class="mt-1">
                  <button
                    class="text-xs px-2 py-1 rounded"
                    :style="queueButtonStyle"
                    @click="openRunUrl(String(resultModalIngest.conversationUrl))"
                    title="Open source page"
                  >
                    Open source page
                  </button>
                </div>
              </div>

              <div class="rounded-lg p-3 border" :style="sectionStyle">
                <div class="text-sm font-medium" :style="{ color: 'var(--ac-text)' }">Results</div>
                <div class="text-xs mt-1" :style="{ color: 'var(--ac-text-muted)' }">
                  EMOS: upserted {{ resultModalIngest?.emos?.upserted ?? 0 }}, skipped
                  {{ resultModalIngest?.emos?.skipped ?? 0 }}, failed
                  {{ resultModalIngest?.emos?.failed ?? 0 }}
                </div>
                <div class="text-xs mt-1" :style="{ color: 'var(--ac-text-muted)' }">
                  Saved messages:
                  {{
                    resultModalSessionId
                      ? (sessionSummariesById[resultModalSessionId]?.messageCount ?? '—')
                      : '—'
                  }}
                </div>

                <div
                  v-if="resultModalIngest && resultModalIngest.sessionSaveOk === false"
                  class="mt-2 text-xs px-2 py-1 rounded"
                  :style="{
                    backgroundColor: 'var(--ac-danger-light, #fee2e2)',
                    color: 'var(--ac-danger, #ef4444)',
                  }"
                >
                  Failed to save session:
                  {{ resultModalIngest.sessionSaveError || 'Unknown error' }}
                </div>
              </div>
            </div>

            <!-- Scanner result -->
            <div v-else-if="isScannerResult" class="space-y-3">
              <div class="text-sm font-medium" :style="{ color: 'var(--ac-text)' }">
                Conversations ({{ resultModalScannerConversations.length }})
              </div>

              <div
                v-if="resultModalScannerConversations.length === 0"
                class="text-xs"
                :style="{ color: 'var(--ac-text-muted)' }"
              >
                No enqueued conversations found in progress events.
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="conv in resultModalScannerConversations"
                  :key="conv.sessionId"
                  class="flex items-center justify-between gap-3 p-3 rounded-lg border"
                  :style="{
                    borderColor: 'var(--ac-border)',
                    backgroundColor: 'var(--ac-surface)',
                  }"
                >
                  <div class="min-w-0">
                    <div class="text-sm truncate" :style="{ color: 'var(--ac-text)' }">
                      {{ conv.title || conv.conversationId || conv.sessionId }}
                    </div>
                    <div class="text-xs mt-0.5" :style="{ color: 'var(--ac-text-subtle)' }">
                      <span v-if="conv.platform">{{ conv.platform }} • </span>
                      <span
                        >{{
                          sessionSummariesById[conv.sessionId]?.messageCount ?? '—'
                        }}
                        messages</span
                      >
                      <span class="mx-1">•</span>
                      <span>{{
                        sessionSummariesById[conv.sessionId]?.exists ? 'Saved' : 'Pending'
                      }}</span>
                    </div>
                    <div v-if="conv.url" class="mt-1">
                      <button
                        class="text-xs px-2 py-1 rounded"
                        :style="queueButtonStyle"
                        @click="openRunUrl(String(conv.url))"
                        title="Open source page"
                      >
                        Open source page
                      </button>
                    </div>
                  </div>

                  <button
                    class="text-xs px-2 py-1 rounded flex-shrink-0"
                    :style="newButtonStyle"
                    :disabled="sessionSummariesById[conv.sessionId]?.exists !== true"
                    @click="openChatSessionById(conv.sessionId)"
                    title="Open saved session in Chat"
                  >
                    Open in Chat
                  </button>
                </div>
              </div>
            </div>

            <!-- Generic result fallback -->
            <div v-else class="space-y-2 text-xs" :style="{ color: 'var(--ac-text-muted)' }">
              <div>Flow ID: {{ resultModalRun?.flowId }}</div>
              <div>Run ID: {{ resultModalRunId }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import WorkflowListItem from './WorkflowListItem.vue';
import { STORAGE_KEYS } from '@/common/constants';
import ILucidePause from '~icons/lucide/pause';
import ILucidePlay from '~icons/lucide/play';
import ILucideSquare from '~icons/lucide/square';

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

interface RunLite {
  id: string;
  flowId: string;
  flowVersionHash?: string;
  startedAt: string;
  finishedAt?: string;
  success?: boolean;
  /** Whether the run is still in progress (queued/running/paused) */
  isInProgress: boolean;
  /** V3 run status */
  status: 'queued' | 'running' | 'paused' | 'succeeded' | 'failed' | 'canceled';
  args?: any;
  error?: any;
  repair?: any;
  currentNodeId?: string;
  entries: any[];
}

interface Trigger {
  id: string;
  type: string;
  kind?: string;
  flowId: string;
  enabled?: boolean;
  [key: string]: any;
}

type QueueProgressLite = {
  done: number;
  total: number;
  queued: number;
  running: number;
  paused: number;
  queueSize: number;
};

type SessionSummary = {
  sessionId: string;
  exists: boolean;
  projectId?: string;
  name?: string;
  messageCount?: number;
};

type ScannerConversationLite = {
  platform?: string;
  sessionId: string;
  conversationId?: string;
  title?: string | null;
  url?: string | null;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const props = defineProps<{
  isActive: boolean;
  flows: FlowLite[];
  runs: RunLite[];
  triggers: Trigger[];
  progressByRunId?: Record<string, string>;
  queueProgress?: QueueProgressLite;
  manualRunIds?: Set<string>;
  onlyBound: boolean;
  openRunId: string | null;
  refreshing?: boolean;
  runningFlowIds?: Set<string>;
  activeHostname?: string;
  getRunEvents: (runId: string) => Promise<unknown[]>;
  onRunEvent?: (listener: (event: any) => void) => () => void;
}>();

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'create'): void;
  (e: 'run', id: string): void;
  (e: 'stopRun', payload: { runId: string; status: string }): void;
  (e: 'edit', id: string): void;
  (e: 'delete', id: string): void;
  (e: 'export', id: string): void;
  (e: 'scheduleChange', payload: { flowId: string; cron: string | null; enabled: boolean }): void;
  (e: 'update:onlyBound', value: boolean): void;
  (e: 'toggleRun', id: string): void;
  (e: 'createTrigger'): void;
  (e: 'editTrigger', id: string): void;
  (e: 'removeTrigger', id: string): void;
  (e: 'pauseQueue'): void;
  (e: 'resumeQueue'): void;
  (e: 'stopQueue'): void;
  (e: 'manualRunHandled', runId: string): void;
  (e: 'openChatSession', payload: { sessionId: string }): void;
}>();

// Local state
const rootRef = ref<HTMLElement | null>(null);
const overlayTarget = ref<Element | null>(null);

onMounted(() => {
  overlayTarget.value =
    rootRef.value?.closest('.agent-theme') ?? rootRef.value?.ownerDocument?.body ?? null;
});

const searchQuery = ref('');
const expandedSections = ref<Set<string>>(new Set());

const activeRunByFlowId = computed(() => {
  const map = new Map<string, RunLite>();
  const inProgress = props.runs.filter((run) => run.isInProgress);
  for (const run of inProgress) {
    const existing = map.get(run.flowId);
    if (!existing) {
      map.set(run.flowId, run);
      continue;
    }
    if (new Date(run.startedAt).getTime() > new Date(existing.startedAt).getTime()) {
      map.set(run.flowId, run);
    }
  }
  return map;
});

const activeRunProgressByFlowId = computed(() => {
  const progress = props.progressByRunId ?? {};
  const out = new Map<string, string>();
  for (const [flowId, run] of activeRunByFlowId.value.entries()) {
    const msg = progress[run.id];
    if (typeof msg === 'string' && msg.trim()) {
      out.set(flowId, msg.trim());
    }
  }
  return out;
});

const scheduleTriggerByFlowId = computed(() => {
  const map = new Map<string, Trigger>();
  for (const trigger of props.triggers) {
    if (trigger.kind !== 'cron' && trigger.type !== 'cron') continue;
    if (!trigger.flowId) continue;
    const desiredId = `cron:${trigger.flowId}`;
    if (trigger.id === desiredId) {
      map.set(trigger.flowId, trigger);
    }
  }
  return map;
});

const openRunEvents = ref<any[]>([]);
const openRunEventsLoading = ref(false);
let openRunEventsPoll: ReturnType<typeof setInterval> | null = null;
let openRunEventsToken = 0;
let openRunEventsUnsubscribe: (() => void) | null = null;
let openRunMaxSeq = 0;

type ProcessedCounts = {
  mode?: string;
  scanned?: number;
  fetched?: number;
  convIngested?: number;
  convSkipped?: number;
  convFailed?: number;
  msgIngested?: number;
  msgUpdated?: number;
  msgSkipped?: number;
  msgFailed?: number;
  messagesPlus?: number;
};

function asFiniteInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function maxDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function parseChatgptImportAllCountsFromMessage(message: string): Partial<ProcessedCounts> {
  const out: Partial<ProcessedCounts> = {};
  const src = String(message || '');

  const scanned = src.match(/\bscanned=(\d+)\b/);
  const fetched = src.match(/\bfetched=(\d+)\b/);
  const conv = src.match(/\bconv=(\d+)\b/);
  const convFailed = src.match(/\bfailed=(\d+)\b/);
  const msgsPlus = src.match(/\bmsgs\+(\d+)\b/);
  const msgSkipped = src.match(/\bskipped=(\d+)\b/);
  const msgFailed = src.match(/\bfailed_msgs=(\d+)\b/);

  if (scanned) out.scanned = Number(scanned[1]);
  if (fetched) out.fetched = Number(fetched[1]);
  if (conv) out.convIngested = Number(conv[1]);
  if (convFailed) out.convFailed = Number(convFailed[1]);
  if (msgsPlus) out.messagesPlus = Number(msgsPlus[1]);
  if (msgSkipped) out.msgSkipped = Number(msgSkipped[1]);
  if (msgFailed) out.msgFailed = Number(msgFailed[1]);

  return out;
}

function deriveProcessedCounts(events: any[]): ProcessedCounts | null {
  const counts: ProcessedCounts = {};

  // Progress/log events are typically appended near the end of the run.
  // Bound scanning to keep UI responsive on very long runs.
  const tail = events.length > 500 ? events.slice(events.length - 500) : events;

  for (const event of tail) {
    if (event?.type !== 'log') continue;

    const data = event?.data;
    if (isPlainRecord(data)) {
      const mode = typeof data.mode === 'string' && data.mode.trim() ? data.mode.trim() : undefined;
      if (mode) counts.mode = mode;

      counts.scanned = maxDefined(counts.scanned, asFiniteInt(data.scanned));
      counts.fetched = maxDefined(counts.fetched, asFiniteInt(data.fetched));

      counts.convIngested = maxDefined(
        counts.convIngested,
        asFiniteInt(data.convIngested ?? data.conversationsIngested),
      );
      counts.convSkipped = maxDefined(
        counts.convSkipped,
        asFiniteInt(data.convSkipped ?? data.conversationsSkipped),
      );
      counts.convFailed = maxDefined(
        counts.convFailed,
        asFiniteInt(data.convFailed ?? data.conversationsFailed),
      );

      counts.msgIngested = maxDefined(
        counts.msgIngested,
        asFiniteInt(data.msgIngested ?? data.messagesIngested),
      );
      counts.msgUpdated = maxDefined(
        counts.msgUpdated,
        asFiniteInt(data.msgUpdated ?? data.messagesUpdated),
      );
      counts.msgSkipped = maxDefined(
        counts.msgSkipped,
        asFiniteInt(data.msgSkipped ?? data.messagesSkipped),
      );
      counts.msgFailed = maxDefined(
        counts.msgFailed,
        asFiniteInt(data.msgFailed ?? data.messagesFailed),
      );
    } else if (
      typeof event?.message === 'string' &&
      event.message.includes('ChatGPT Import All:')
    ) {
      const parsed = parseChatgptImportAllCountsFromMessage(event.message);
      counts.scanned = maxDefined(counts.scanned, asFiniteInt(parsed.scanned));
      counts.fetched = maxDefined(counts.fetched, asFiniteInt(parsed.fetched));
      counts.convIngested = maxDefined(counts.convIngested, asFiniteInt(parsed.convIngested));
      counts.convFailed = maxDefined(counts.convFailed, asFiniteInt(parsed.convFailed));
      counts.msgSkipped = maxDefined(counts.msgSkipped, asFiniteInt(parsed.msgSkipped));
      counts.msgFailed = maxDefined(counts.msgFailed, asFiniteInt(parsed.msgFailed));
      counts.messagesPlus = maxDefined(counts.messagesPlus, asFiniteInt(parsed.messagesPlus));
    }
  }

  const hasAny =
    counts.scanned !== undefined ||
    counts.fetched !== undefined ||
    counts.convIngested !== undefined ||
    counts.convSkipped !== undefined ||
    counts.convFailed !== undefined ||
    counts.msgIngested !== undefined ||
    counts.msgUpdated !== undefined ||
    counts.msgSkipped !== undefined ||
    counts.msgFailed !== undefined ||
    counts.messagesPlus !== undefined;

  if (!hasAny) return null;

  if (counts.messagesPlus === undefined) {
    const plus = (counts.msgIngested ?? 0) + (counts.msgUpdated ?? 0);
    if (plus > 0) counts.messagesPlus = plus;
  }

  return counts;
}

const openRunProcessedCounts = computed(() => deriveProcessedCounts(openRunEvents.value));

async function loadOpenRunEvents(runId: string): Promise<void> {
  const token = (openRunEventsToken += 1);
  openRunEventsLoading.value = true;
  openRunEvents.value = [];
  openRunMaxSeq = 0;

  try {
    const events = await props.getRunEvents(runId);
    if (token !== openRunEventsToken) return;
    openRunEvents.value = Array.isArray(events) ? (events as any[]) : [];
    openRunMaxSeq = openRunEvents.value.reduce((max, e) => {
      const seq = typeof e?.seq === 'number' ? e.seq : 0;
      return Math.max(max, seq);
    }, 0);
  } finally {
    if (token === openRunEventsToken) {
      openRunEventsLoading.value = false;
    }
  }
}

function clearOpenRunEventsPoll(): void {
  if (openRunEventsPoll) {
    clearInterval(openRunEventsPoll);
    openRunEventsPoll = null;
  }
}

function clearOpenRunEventsStream(): void {
  if (openRunEventsUnsubscribe) {
    openRunEventsUnsubscribe();
    openRunEventsUnsubscribe = null;
  }
}

function appendOpenRunEvent(event: any): void {
  const seq = typeof event?.seq === 'number' ? event.seq : null;
  if (typeof seq === 'number') {
    if (seq <= openRunMaxSeq) return;
    openRunMaxSeq = seq;
  }
  const next = [...openRunEvents.value, event];
  openRunEvents.value = next.length > 200 ? next.slice(next.length - 200) : next;
}

watch(
  () => props.openRunId,
  async (runId) => {
    clearOpenRunEventsPoll();
    clearOpenRunEventsStream();
    openRunEventsToken += 1;
    openRunEvents.value = [];
    openRunMaxSeq = 0;

    if (!runId) return;
    await loadOpenRunEvents(runId);

    const run = props.runs.find((r) => r.id === runId);
    if (run?.isInProgress) {
      if (props.onRunEvent) {
        openRunEventsUnsubscribe = props.onRunEvent((event) => {
          if (event?.runId !== runId) return;
          appendOpenRunEvent(event);
        });
        // Reconcile periodically in case the port reconnects and events are missed.
        openRunEventsPoll = setInterval(() => {
          void loadOpenRunEvents(runId);
        }, 10_000);
      } else {
        openRunEventsPoll = setInterval(() => {
          void loadOpenRunEvents(runId);
        }, 2_000);
      }
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  clearOpenRunEventsPoll();
  clearOpenRunEventsStream();
});

// Filtered flows based on search
const filteredFlows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.flows;

  return props.flows.filter((flow) => {
    const name = (flow.name || '').toLowerCase();
    const desc = (flow.description || '').toLowerCase();
    const domain = (flow.meta?.domain || '').toLowerCase();
    const tags = (flow.meta?.tags || []).join(' ').toLowerCase();

    return (
      name.includes(query) || desc.includes(query) || domain.includes(query) || tags.includes(query)
    );
  });
});

// Helper functions
function getFlowName(flowId: string): string {
  const flow = props.flows.find((f) => f.id === flowId);
  return flow?.name || flowId;
}

function eventKey(event: any, idx: number): string {
  const seq = typeof event?.seq === 'number' ? String(event.seq) : '';
  const ts = typeof event?.ts === 'number' ? String(event.ts) : '';
  return seq || `${event?.type || 'evt'}:${ts}:${idx}`;
}

function formatEventTime(event: any): string {
  const ts = event?.ts;
  if (typeof ts !== 'number') return '';
  return formatTime(new Date(ts).toISOString());
}

function formatEventLabel(event: any): string {
  const type = String(event?.type || '');
  if (!type) return 'event';
  const nodeId = typeof event?.nodeId === 'string' ? event.nodeId : null;
  if (nodeId && (type.startsWith('node.') || type.startsWith('artifact.'))) {
    return `${type} • ${nodeId}`;
  }
  return type;
}

function screenshotMime(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0')) return 'image/png';
  return 'image/png';
}

function screenshotSrc(base64: string): string {
  const mime = screenshotMime(String(base64 || ''));
  return `data:${mime};base64,${base64}`;
}

function openRunUrl(url: string): void {
  const next = String(url || '').trim();
  if (!next) return;
  void chrome.tabs.create({ url: next });
}

function formatHash(hash: string): string {
  const value = String(hash || '').trim();
  if (!value) return '';
  return value.length <= 12 ? value : value.slice(0, 12);
}

/**
 * Get the status color for a run
 * - In progress (queued/running/paused): blue/primary
 * - Succeeded: green/success
 * - Failed/canceled: red/danger
 */
function getRunStatusColor(run: RunLite): string {
  // V3 style: check isInProgress first
  if (run.isInProgress) {
    return 'var(--ac-primary, #3b82f6)';
  }
  // V3 style: check status
  if (run.status) {
    if (run.status === 'succeeded') return 'var(--ac-success, #22c55e)';
    if (run.status === 'failed' || run.status === 'canceled') return 'var(--ac-danger, #ef4444)';
    // queued/running/paused - should be caught by isInProgress but just in case
    return 'var(--ac-primary, #3b82f6)';
  }
  // V2 fallback: use success boolean
  return run.success ? 'var(--ac-success, #22c55e)' : 'var(--ac-danger, #ef4444)';
}

/**
 * Get the status text for a run
 */
function getRunStatusText(run: RunLite): string {
  if (run.status) {
    const statusMap: Record<string, string> = {
      queued: '排队中',
      running: '运行中',
      paused: '已暂停',
      succeeded: '成功',
      failed: '失败',
      canceled: '已取消',
    };
    return statusMap[run.status] || run.status;
  }
  // V2 fallback
  return run.success ? '成功' : '失败';
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function toggleSection(section: string) {
  if (expandedSections.value.has(section)) {
    expandedSections.value.delete(section);
  } else {
    expandedSections.value.add(section);
  }
  expandedSections.value = new Set(expandedSections.value);
}

// Computed styles
const containerStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
}));

const headerStyle = computed(() => ({
  borderColor: 'var(--ac-border)',
  backgroundColor: 'var(--ac-surface)',
}));

const inputStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-button)',
  color: 'var(--ac-text)',
  outline: 'none',
}));

const refreshButtonStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text-muted)',
  borderRadius: 'var(--ac-radius-button)',
  border: 'none',
}));

const newButtonStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent)',
  color: 'var(--ac-accent-contrast)',
  borderRadius: 'var(--ac-radius-button)',
}));

const dividerStyle = computed(() => ({
  borderColor: 'var(--ac-border)',
}));

const sectionStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-inner)',
}));

const sectionHeaderStyle = computed(() => ({
  color: 'var(--ac-text)',
}));

const runItemStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  borderRadius: 'var(--ac-radius-button)',
}));

const triggerItemStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  borderRadius: 'var(--ac-radius-button)',
}));

const triggerAddStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent-subtle)',
  color: 'var(--ac-accent)',
  borderRadius: '50%',
}));

const triggerActionStyle = computed(() => ({
  color: 'var(--ac-text-muted)',
}));

const triggerActionDangerStyle = computed(() => ({
  color: 'var(--ac-danger)',
}));

const queueButtonStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text)',
  border: '1px solid var(--ac-border)',
}));

const queueStopButtonStyle = computed(() => ({
  backgroundColor: 'var(--ac-danger-light, #fee2e2)',
  color: 'var(--ac-danger, #ef4444)',
  border: '1px solid var(--ac-danger-light, #fee2e2)',
}));

// ==================== Manual Run Result Modal ====================

const resultModalRunId = ref<string | null>(null);
const resultModalEvents = ref<any[]>([]);
const resultModalLoading = ref(false);
const sessionSummariesById = ref<Record<string, SessionSummary>>({});
const seenManualRunIds = ref<Set<string>>(new Set());

function toggleQueuePauseResume(): void {
  const qp = props.queueProgress;
  if (!qp || (qp.running === 0 && qp.paused === 0)) return;
  if (qp.running > 0) {
    emit('pauseQueue');
    return;
  }
  emit('resumeQueue');
}

const resultModalRun = computed(() => {
  const rid = resultModalRunId.value;
  if (!rid) return null;
  return props.runs.find((r) => r.id === rid) ?? null;
});

const resultModalFlow = computed(() => {
  const flowId = resultModalRun.value?.flowId;
  if (!flowId) return null;
  return props.flows.find((f) => f.id === flowId) ?? null;
});

const resultModalTags = computed(() => {
  const tags = resultModalFlow.value?.meta?.tags;
  return Array.isArray(tags) ? tags : [];
});

const isIngestorResult = computed(() => resultModalTags.value.includes('ingestor'));
const isScannerResult = computed(() => resultModalTags.value.includes('scanner'));

type IngestPlatform = 'chatgpt' | 'gemini' | 'claude' | 'deepseek';

function inferPlatformFromTags(tags: string[]): IngestPlatform | null {
  if (tags.includes('chatgpt')) return 'chatgpt';
  if (tags.includes('gemini')) return 'gemini';
  if (tags.includes('claude')) return 'claude';
  if (tags.includes('deepseek')) return 'deepseek';
  return null;
}

function inferPlatformFromUrl(urlString: string): IngestPlatform | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  const host = String(u.hostname || '').toLowerCase();
  if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
  if (host === 'claude.ai') return 'claude';
  if (host === 'gemini.google.com') return 'gemini';
  if (host === 'chat.deepseek.com') return 'deepseek';
  return null;
}

function parseConversationIdFromUrl(platform: IngestPlatform, urlString: string): string | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }

  const pathname = String(u.pathname || '');

  if (platform === 'chatgpt') {
    const m = pathname.match(/\/(?:c|chat)\/([^/?#]+)/i);
    return m ? String(m[1] || '').trim() || null : null;
  }

  if (platform === 'claude') {
    const m = pathname.match(/^\/chat\/([^/?#]+)/i);
    return m ? String(m[1] || '').trim() || null : null;
  }

  if (platform === 'gemini') {
    const m = pathname.match(/^\/app\/([^/?#]+)/i);
    return m ? String(m[1] || '').trim() || null : null;
  }

  if (platform === 'deepseek') {
    const m = pathname.match(/\/(?:chat|c)\/([^/?#]+)/i);
    if (m) return String(m[1] || '').trim() || null;
    for (const key of ['conversationId', 'chatId', 'id']) {
      const v = u.searchParams.get(key);
      if (v && v.trim()) return v.trim();
    }
    const seg = pathname.split('/').filter(Boolean).pop();
    return seg ? String(seg).trim() || null : null;
  }

  return null;
}

function deriveSessionIdFromRunArgs(run: RunLite | null, tags: string[]): string | null {
  const rawUrl =
    typeof run?.args?.ruminerConversationUrl === 'string' ? run!.args!.ruminerConversationUrl : '';
  const urlString = String(rawUrl || '').trim();
  if (!urlString) return null;
  const platform = inferPlatformFromTags(tags) ?? inferPlatformFromUrl(urlString);
  if (!platform) return null;
  const conversationId = parseConversationIdFromUrl(platform, urlString);
  if (!conversationId) return null;
  return `${platform}:${conversationId}`;
}

function findLatestIngestResult(events: any[]): Record<string, unknown> | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type !== 'log') continue;
    if (String(e?.message || '') !== 'ruminer.ingest.result') continue;
    if (!isPlainRecord(e?.data)) continue;
    return e.data as Record<string, unknown>;
  }
  return null;
}

function extractScannerConversations(events: any[]): ScannerConversationLite[] {
  const out: ScannerConversationLite[] = [];
  for (const e of events) {
    if (e?.type !== 'log') continue;
    if (String(e?.message || '') !== 'workflow.progress') continue;
    const data = e?.data;
    if (!isPlainRecord(data)) continue;
    const payload = (data as any).payload;
    if (!isPlainRecord(payload)) continue;
    const kind = String((payload as any).kind || '');
    if (!kind.endsWith('.scanner.enqueued')) continue;
    const convs = (payload as any).conversations;
    if (!Array.isArray(convs)) continue;
    for (const c of convs) {
      if (!isPlainRecord(c)) continue;
      const sessionId = String((c as any).sessionId || '').trim();
      if (!sessionId) continue;
      out.push({
        platform: typeof (c as any).platform === 'string' ? String((c as any).platform) : undefined,
        sessionId,
        conversationId:
          typeof (c as any).conversationId === 'string'
            ? String((c as any).conversationId)
            : undefined,
        title: typeof (c as any).title === 'string' ? String((c as any).title) : null,
        url: typeof (c as any).url === 'string' ? String((c as any).url) : null,
      });
    }
  }
  // Deduplicate by sessionId (keep first occurrence with best metadata)
  const byId = new Map<string, ScannerConversationLite>();
  for (const c of out) {
    const existing = byId.get(c.sessionId);
    if (!existing) {
      byId.set(c.sessionId, c);
      continue;
    }
    byId.set(c.sessionId, {
      ...existing,
      title: existing.title || c.title,
      url: existing.url || c.url,
      conversationId: existing.conversationId || c.conversationId,
      platform: existing.platform || c.platform,
    });
  }
  return Array.from(byId.values());
}

const resultModalScannerConversations = computed(() =>
  extractScannerConversations(resultModalEvents.value),
);

const resultModalIngest = computed<any | null>(() =>
  findLatestIngestResult(resultModalEvents.value),
);

function ingestFieldText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function ingestFieldBool(value: unknown): boolean {
  return value === true;
}

const resultModalSessionId = computed(() => {
  const ingest = resultModalIngest.value;
  if (ingest && typeof ingest.sessionId === 'string' && ingest.sessionId.trim())
    return ingest.sessionId.trim();
  const platform = ingestFieldText(resultModalIngest.value?.platform);
  const conversationId = ingestFieldText(resultModalIngest.value?.conversationId);
  if (platform && conversationId) return `${platform}:${conversationId}`;
  const fallback = deriveSessionIdFromRunArgs(resultModalRun.value, resultModalTags.value);
  if (fallback) return fallback;
  return null;
});

const resultModalSessionExists = computed(() => {
  const sid = resultModalSessionId.value;
  if (!sid) return false;
  return sessionSummariesById.value[sid]?.exists === true;
});

async function getNativeServerPort(): Promise<number | null> {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.SERVER_STATUS]);
    const status = stored?.[STORAGE_KEYS.SERVER_STATUS] as
      | { isRunning?: boolean; port?: unknown }
      | undefined;
    if (!status?.isRunning) return null;
    const raw = status.port;
    const port = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;
    return Math.floor(port);
  } catch {
    return null;
  }
}

async function fetchSessionSummaries(sessionIds: string[]): Promise<void> {
  const ids = Array.from(new Set(sessionIds.map((s) => String(s || '').trim()).filter(Boolean)));
  if (ids.length === 0) return;

  const port = await getNativeServerPort();
  if (!port) return;

  try {
    const url = `http://127.0.0.1:${port}/agent/sessions/summaries`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionIds: ids }),
    });
    if (!resp.ok) return;
    const payload = (await resp.json().catch(() => null)) as any;
    if (!payload || payload.ok !== true || !Array.isArray(payload.summaries)) return;

    const next: Record<string, SessionSummary> = { ...sessionSummariesById.value };
    for (const s of payload.summaries as any[]) {
      if (!isPlainRecord(s)) continue;
      const sessionId = String((s as any).sessionId || '').trim();
      if (!sessionId) continue;
      next[sessionId] = {
        sessionId,
        exists: (s as any).exists === true,
        projectId:
          typeof (s as any).projectId === 'string' ? String((s as any).projectId) : undefined,
        name: typeof (s as any).name === 'string' ? String((s as any).name) : undefined,
        messageCount:
          typeof (s as any).messageCount === 'number' ? (s as any).messageCount : undefined,
      };
    }
    sessionSummariesById.value = next;
  } catch {
    // ignore
  }
}

async function openResultModal(runId: string): Promise<void> {
  const rid = String(runId || '').trim();
  if (!rid) return;
  resultModalRunId.value = rid;
  resultModalLoading.value = true;
  resultModalEvents.value = [];
  sessionSummariesById.value = {};

  try {
    const events = await props.getRunEvents(rid);
    resultModalEvents.value = Array.isArray(events) ? (events as any[]) : [];

    const scannerConvs = extractScannerConversations(resultModalEvents.value);
    if (scannerConvs.length > 0) {
      await fetchSessionSummaries(scannerConvs.map((c) => c.sessionId));
    } else {
      const ingest = findLatestIngestResult(resultModalEvents.value);
      const sid = ingest && typeof ingest.sessionId === 'string' ? ingest.sessionId.trim() : '';
      const fallbackSid = deriveSessionIdFromRunArgs(
        props.runs.find((r) => r.id === rid) ?? null,
        resultModalTags.value,
      );
      const targetSid = sid || fallbackSid || '';
      if (targetSid) await fetchSessionSummaries([targetSid]);
    }
  } finally {
    resultModalLoading.value = false;
  }
}

function closeResultModal(): void {
  resultModalRunId.value = null;
  resultModalEvents.value = [];
  resultModalLoading.value = false;
  sessionSummariesById.value = {};
}

function openChatSessionById(sessionId: string): void {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  emit('openChatSession', { sessionId: sid });
}

function isTerminalStatus(status: string | undefined): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function maybeHandleManualTerminalRun(runId: string): void {
  const rid = String(runId || '').trim();
  const manual = props.manualRunIds;
  if (!rid || !manual || !manual.has(rid)) return;
  if (!props.isActive) return;
  if (seenManualRunIds.value.has(rid)) return;
  if (resultModalRunId.value) return;

  seenManualRunIds.value = new Set([...seenManualRunIds.value, rid]);
  emit('manualRunHandled', rid);
  void openResultModal(rid);
}

let manualRunUnsubscribe: (() => void) | null = null;

onMounted(() => {
  if (!props.onRunEvent) return;
  manualRunUnsubscribe = props.onRunEvent((event: any) => {
    const rid = String(event?.runId || '').trim();
    if (!rid) return;
    if (
      event?.type === 'run.succeeded' ||
      event?.type === 'run.failed' ||
      event?.type === 'run.canceled'
    ) {
      maybeHandleManualTerminalRun(rid);
    }
  });
});

onUnmounted(() => {
  manualRunUnsubscribe?.();
  manualRunUnsubscribe = null;
});

watch(
  [() => props.isActive, () => props.manualRunIds, () => props.runs],
  () => {
    if (!props.isActive) return;
    const manual = props.manualRunIds;
    if (!manual || manual.size === 0) return;
    for (const rid of manual) {
      const run = props.runs.find((r) => r.id === rid);
      if (run && isTerminalStatus(run.status)) {
        maybeHandleManualTerminalRun(rid);
      }
    }
  },
  { immediate: true, deep: false },
);
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

.advanced-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 20px 0 16px;
  font-size: 12px;
  font-weight: 500;
}

.advanced-divider::before,
.advanced-divider::after {
  content: '';
  flex: 1;
  border-bottom: var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4);
}

.advanced-section {
  margin-bottom: 8px;
  overflow: hidden;
}

.advanced-section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color var(--ac-motion-fast, 120ms) ease;
}

.advanced-section-header:hover {
  background-color: var(--ac-hover-bg, #f5f5f4);
}

.advanced-section-content {
  padding: 0 12px 12px;
}

.run-item,
.trigger-item {
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color var(--ac-motion-fast, 120ms) ease;
}

.run-item:hover,
.trigger-item:hover {
  background-color: var(--ac-hover-bg, #f5f5f4) !important;
}

.trigger-add-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.trigger-add-btn:hover {
  transform: scale(1.1);
}

.trigger-action {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--ac-radius-button, 8px);
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.trigger-action:hover {
  background-color: var(--ac-hover-bg, #f5f5f4);
}

.trigger-action-danger:hover {
  background-color: rgba(239, 68, 68, 0.1);
}

/* Section expand transition */
.section-expand-enter-active,
.section-expand-leave-active {
  transition: all var(--ac-motion-normal, 180ms) ease;
  overflow: hidden;
}

.section-expand-enter-from,
.section-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.section-expand-enter-to,
.section-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* Refresh spin animation */
@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin-slow {
  animation: spin-slow 0.8s linear infinite;
}
</style>
