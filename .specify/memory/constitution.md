<!--
Sync Impact Report
===================
Version change: N/A → 1.0.0 (initial ratification)
Modified principles: N/A (first version)
Added sections:
  - Core Principles (6): Code Quality, Pattern Consistency,
    Best Practices, User Experience, Visual Aesthetics,
    Engineering Standards
  - Quality Gates
  - Development Workflow
  - Governance
Removed sections: N/A
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no changes needed
    (Constitution Check section already references this file dynamically)
  - .specify/templates/spec-template.md ✅ no changes needed
    (requirements and success criteria align with principles)
  - .specify/templates/tasks-template.md ✅ no changes needed
    (Polish phase already covers quality, testing, security)
Follow-up TODOs: None
-->

# Ruminer Browser Agent Constitution

## Core Principles

### I. Code Quality First

Every module, function, and type MUST be written to a production-grade
standard from the first commit. "We'll clean it up later" is not
acceptable.

- All TypeScript code MUST compile with `strict: true` unless explicitly
  justified in a code comment with a linked issue or technical rationale.
- Functions MUST have a single, clear responsibility. If a function
  requires more than one sentence to describe what it does, it MUST
  be decomposed.
- Dead code, unused imports, and commented-out blocks MUST be removed
  before merge. Version control is the history mechanism, not comments.
- Error handling MUST be explicit: never swallow exceptions silently.
  Errors MUST be logged with sufficient context (operation, entity ID,
  relevant state) or propagated to a caller that will handle them.
- All public API surfaces (exported functions, MCP tools, message
  handlers) MUST have TypeScript types that fully describe inputs and
  outputs. Prefer discriminated unions over loose string types.

### II. Pattern Consistency

The codebase MUST follow a single, agreed-upon pattern for each
category of concern. When a pattern exists, new code MUST conform
to it rather than inventing alternatives.

- Message passing between extension layers (background SW, content
  scripts, popup/sidepanel, native host) MUST use the project's
  established message protocol and type-safe message definitions.
- State management within each package MUST follow the same approach
  used by existing modules in that package. Do not mix paradigms
  (e.g., raw `chrome.storage` calls alongside a state abstraction).
- File and directory naming MUST follow the conventions already
  established in the monorepo: kebab-case for files, PascalCase for
  React/UI components, barrel exports where the package already uses
  them.
- New MCP tools MUST follow the registration, validation, and
  response patterns of existing tools. Copy the structure of a
  working tool as a starting point.
- Shared types and constants MUST live in the `chrome-mcp-shared`
  package. Duplication of type definitions across packages is
  prohibited.

### III. Best Practices

Development MUST follow industry-recognized best practices for
TypeScript, Chrome Extension MV3, and Node.js server development.

- Dependencies MUST be added intentionally. Every new dependency
  requires a stated reason. Prefer platform APIs and existing
  dependencies over adding new packages for marginal convenience.
- Security boundaries MUST be respected: content scripts are
  untrusted contexts; the background service worker and native
  host are trusted contexts. Data crossing these boundaries MUST
  be validated and sanitized.
- Chrome MV3 service worker lifecycle constraints MUST be respected:
  no assumption of persistent background state, proper use of alarms
  and events for long-running operations, correct handling of
  service worker termination and restart.
- Async operations MUST use async/await with proper error propagation.
  Avoid raw `.then()` chains except where composing parallel
  operations with `Promise.all` / `Promise.allSettled`.
- Configuration and secrets MUST never be hardcoded. Use environment
  variables, Chrome storage APIs, or the native host config layer.

### IV. User Experience

Every user-facing interaction MUST be designed for clarity,
responsiveness, and minimal friction. The user's time and attention
are the scarcest resources.

- UI operations MUST provide immediate visual feedback. Actions that
  take longer than 200ms MUST show a loading or progress indicator.
- Error states MUST be communicated to the user in plain language
  with a suggested next step. Raw error codes or stack traces MUST
  NOT be displayed in the UI.
- Workflows and automation MUST be interruptible. The user MUST be
  able to pause, cancel, or take over any running automation at any
  point.
- The extension MUST NOT degrade the browsing experience: no
  perceptible page load impact, no layout shifts caused by injected
  UI, no excessive memory consumption in idle state.
- Keyboard navigation and accessibility MUST be supported for all
  interactive UI elements (sidepanel, popup, command bar).

### V. Visual Aesthetics

The visual design of all user-facing surfaces MUST be polished,
cohesive, and intentional. Aesthetic quality signals product quality
and builds user trust.

- A consistent design token system (colors, spacing, typography,
  radii, shadows) MUST be used across all UI surfaces. Ad-hoc inline
  styles that deviate from tokens are prohibited.
- Animation and transitions MUST be purposeful: they communicate
  state changes, guide attention, or provide spatial context. Purely
  decorative animation without functional purpose MUST be avoided.
- Layout MUST be responsive and adapt gracefully to sidepanel,
  popup, and in-page overlay contexts without breakage or overflow.
- Visual hierarchy MUST be clear: primary actions are prominent,
  secondary actions are subdued, destructive actions are visually
  distinct and require confirmation.
- Icon usage MUST be consistent: use a single icon set throughout
  the extension. Do not mix icon libraries or styles.

### VI. Engineering Standards

The engineering process MUST enforce quality systematically through
tooling, automation, and review rather than relying on individual
discipline alone.

- All code MUST pass linting (`eslint`), formatting (`prettier`),
  and type checking (`tsc --noEmit`) before merge. These checks MUST
  run in CI and locally via pre-commit hooks.
- Commit messages MUST follow the Conventional Commits specification
  as enforced by the project's commitlint configuration.
- Each package in the monorepo MUST build independently. Circular
  dependencies between packages are prohibited.
- Breaking changes to MCP tool interfaces, message protocols, or
  shared types MUST be documented in the PR description with a
  migration path.
- Build artifacts MUST be reproducible: given the same source and
  lockfile, the output MUST be identical. Do not rely on ambient
  system state.

## Quality Gates

All code changes MUST pass the following gates before merge:

1. **Type Safety**: `pnpm typecheck` passes with zero errors.
2. **Lint**: `pnpm lint` passes with zero warnings or errors.
3. **Format**: `pnpm format` produces no diff (code is already
   formatted).
4. **Build**: `pnpm build` succeeds for all affected packages.
5. **No Regressions**: Existing functionality verified through
   manual smoke test or automated tests where available.
6. **PR Review**: At least one review approval before merge.
   Reviewer MUST verify adherence to these constitutional
   principles.

## Development Workflow

### Branch Strategy

- `master` is the stable branch. Direct pushes to `master` are
  prohibited.
- Feature work MUST occur on branches named per convention (e.g.,
  `feat/description`, `fix/description`).
- PRs MUST target `master` and pass all quality gates before merge.

### Code Review Standards

- Reviewers MUST evaluate against the six constitutional principles,
  not just functional correctness.
- Review comments citing a specific principle (e.g., "Principle II:
  this deviates from the existing message pattern") are encouraged
  for clarity.
- Nit-level feedback MUST be clearly marked as non-blocking.

### Monorepo Coordination

- Changes to `chrome-mcp-shared` MUST be built and verified against
  all dependent packages before merge.
- Cross-package refactors MUST be atomic (single PR) to avoid
  broken intermediate states.

## Governance

This constitution is the authoritative source of engineering
standards for the Ruminer Browser project. It supersedes informal
conventions, ad-hoc decisions, and individual preferences where
they conflict.

### Amendment Procedure

1. Propose amendment via PR modifying this file.
2. PR description MUST state: what changes, why, and impact on
   existing code.
3. Amendment MUST be approved by the project lead.
4. Version MUST be incremented per semantic versioning:
   - **MAJOR**: Principle removed, redefined, or made backward
     incompatible.
   - **MINOR**: New principle or section added, or existing
     guidance materially expanded.
   - **PATCH**: Clarifications, typo fixes, non-semantic
     refinements.
5. `LAST_AMENDED_DATE` MUST be updated to the merge date.

### Compliance Review

- Every PR review SHOULD include a constitution compliance check.
- Quarterly review of this constitution is recommended to ensure
  principles remain relevant as the project evolves.
- Violations discovered post-merge MUST be tracked as issues and
  remediated in a follow-up PR.

**Version**: 1.0.0 | **Ratified**: 2026-02-25 | **Last Amended**: 2026-02-25
