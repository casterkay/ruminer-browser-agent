import { describe, expect, it } from 'vitest';
import {
  extractEmosCitationMemoriesFromToolResultText,
  formatAssistantMarkdownWithEmosCitations,
} from '../entrypoints/sidepanel/composables/emos-citations';

describe('emos citations', () => {
  it('strips trailing footnote refs and injects emos-cite tags', () => {
    const input = ['Hello [^1]. And [^1,2].', '', '[^1]: id-1', '[^2]: id-2', ''].join('\n');
    const out = formatAssistantMarkdownWithEmosCitations(input);
    expect(out).toContain('Hello ');
    expect(out).toContain('<emos-cite');
    expect(out).not.toContain('[^1]:');
    expect(out).not.toContain('[^2]:');
    expect(out).toContain('message-ids="id-1"');
    expect(out).toContain('message-ids="id-1,id-2"');
  });

  it('does not transform citations inside fenced code blocks', () => {
    const input = [
      '```md',
      'inside fence [^1]',
      '```',
      '',
      'outside fence [^1]',
      '',
      '[^1]: id-1',
    ].join('\n');
    const out = formatAssistantMarkdownWithEmosCitations(input);
    expect(out).toContain('inside fence [^1]');
    expect(out).toContain('outside fence ');
    expect(out).toContain('<emos-cite keys="1" message-ids="id-1"></emos-cite>');
  });

  it('does not transform citations inside inline code', () => {
    const input = ['use `[^1]` literally and cite [^1]', '', '[^1]: id-1'].join('\n');
    const out = formatAssistantMarkdownWithEmosCitations(input);
    expect(out).toContain('`[^1]`');
    expect(out).toContain('<emos-cite keys="1" message-ids="id-1"></emos-cite>');
  });

  it('extracts memories and prefers summary as content', () => {
    const json = JSON.stringify({
      result: { memories: [{ message_id: 'm1', summary: 's1', content: 'c1' }] },
    });
    const items = extractEmosCitationMemoriesFromToolResultText(json);
    expect(items).toHaveLength(1);
    expect(items[0].message_id).toBe('m1');
    expect(items[0].content).toBe('s1');
  });
});
