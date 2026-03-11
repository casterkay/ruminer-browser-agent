import { describe, expect, test } from 'vitest';

import {
  squashBlankLinesInsideThinkingTags,
  wrapThoughtCalloutsAsThinking,
} from '../../entrypoints/sidepanel/components/agent-chat/timeline/normalize-thinking';

describe('wrapThoughtCalloutsAsThinking', () => {
  test('converts info callout with thought-like title', () => {
    const input = [
      '> [!info] Deciding on a plan',
      '> I will do step 1.',
      '> Then step 2.',
      '',
      'Normal text.',
    ].join('\n');

    const out = wrapThoughtCalloutsAsThinking(input);

    expect(out).toContain('<thinking>**Deciding on a plan**');
    expect(out).toContain('I will do step 1.');
    expect(out).toContain('Normal text.');
    expect(out).not.toContain('[!info]');
  });

  test('absorbs the next block as the thinking body', () => {
    const input = [
      '> [!info] Summarizing web content',
      '',
      'The user is on a page. I should fetch the visible text and summarize it.',
      '',
      'Here is the final answer.',
    ].join('\n');

    const out = wrapThoughtCalloutsAsThinking(input);

    expect(out).toContain('<thinking>**Summarizing web content**');
    expect(out).toContain('I should fetch the visible text');
    expect(out).toContain('Here is the final answer.');
    expect(out).not.toContain('[!info]');
  });

  test('keeps non-supported callout kinds unchanged', () => {
    const input = ['> [!warning] FYI', '> This should stay a callout.'].join('\n');
    const out = wrapThoughtCalloutsAsThinking(input);
    expect(out).toBe(input);
  });
});

describe('squashBlankLinesInsideThinkingTags', () => {
  test('squashes blank lines inside <thinking> blocks', () => {
    const input = '<thinking>Line 1\n\nLine 2\n\n\nLine 3</thinking>';
    expect(squashBlankLinesInsideThinkingTags(input)).toBe(
      '<thinking>Line 1\nLine 2\nLine 3</thinking>',
    );
  });

  test('preserves content outside thinking tags', () => {
    const input = ['Before', '<thinking>A\n\nB</thinking>', 'After'].join('\n\n');
    const out = squashBlankLinesInsideThinkingTags(input);
    expect(out).toContain('Before');
    expect(out).toContain('<thinking>A\nB</thinking>');
    expect(out).toContain('After');
  });
});
