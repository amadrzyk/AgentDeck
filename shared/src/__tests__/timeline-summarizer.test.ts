import { describe, it, expect } from 'vitest';
import {
  extractTopicHint,
  extractTopicHintWithKind,
  promptSnippetFallback,
} from '../timeline-summarizer.js';

describe('extractTopicHintWithKind — Korean polite-closer robustness', () => {
  it('returns the cleaned topic when the response opens with "네, …"', () => {
    const r = extractTopicHintWithKind('네, AgentDeck 빌드 완료. 5개 디바이스에 배포 OK.');
    expect(r.kind).toBe('topic');
    expect(r.hint).toBe('AgentDeck 빌드 완료. 5개 디바이스에 배포 OK.');
  });

  it('returns the original (kind=fallback) when the entire response is just a polite closer', () => {
    // "네, 확인했습니다." used to strip to empty → null → "Completed".
    // Now we keep the original so the row reads something meaningful.
    const r = extractTopicHintWithKind('네, 확인했습니다.');
    expect(r.kind).toBe('fallback');
    expect(r.hint).toBe('네, 확인했습니다.');
  });

  it('returns null for empty / very short text (still)', () => {
    expect(extractTopicHintWithKind('').hint).toBeNull();
    expect(extractTopicHintWithKind('네').hint).toBeNull();
    expect(extractTopicHintWithKind('OK').hint).toBeNull();
  });

  it('skips lone heading markers and code fences', () => {
    // "##" with no text after is skipped; "Real content here." is taken.
    const r = extractTopicHintWithKind(
      '##\n\n```\ncode block\n```\n\nReal content here.',
    );
    expect(r.kind).toBe('topic');
    expect(r.hint).toBe('Real content here.');
  });

  it('a heading WITH text becomes the topic (heading is the title)', () => {
    // "# Header only" → cleaned to "Header only", that's the topic.
    const r = extractTopicHintWithKind('# Header only\n\nbody text');
    expect(r.kind).toBe('topic');
    expect(r.hint).toBe('Header only');
  });

  it('strips list bullet markers', () => {
    const r = extractTopicHintWithKind('- 첫 항목 정리');
    expect(r.kind).toBe('topic');
    expect(r.hint).toBe('첫 항목 정리');
  });

  it('extractTopicHint convenience returns just the hint string', () => {
    expect(extractTopicHint('confirmed test passes')).toBe('confirmed test passes');
    expect(extractTopicHint('')).toBeNull();
  });
});

describe('promptSnippetFallback', () => {
  it('returns first sentence trimmed', () => {
    expect(promptSnippetFallback('Fix the bug. Then update tests.', 60)).toBe('Fix the bug');
  });

  it('returns whole string when no sentence terminator', () => {
    expect(promptSnippetFallback('quick fix needed', 60)).toBe('quick fix needed');
  });

  it('truncates to maxLen with ellipsis', () => {
    const long = 'a'.repeat(100);
    const out = promptSnippetFallback(long, 20);
    expect(out!.length).toBeLessThanOrEqual(20);
    expect(out!.endsWith('…')).toBe(true);
  });

  it('cuts at first newline if no sentence terminator', () => {
    expect(promptSnippetFallback('Line one\nLine two', 60)).toBe('Line one');
  });

  it('returns null for empty / very short input', () => {
    expect(promptSnippetFallback('', 60)).toBeNull();
    expect(promptSnippetFallback(null, 60)).toBeNull();
    expect(promptSnippetFallback('ab', 60)).toBeNull();
  });

  it('handles Korean prompts', () => {
    const out = promptSnippetFallback('TIMELINE 문제를 해결해주세요. 자세히는 …', 60);
    expect(out).toBe('TIMELINE 문제를 해결해주세요');
  });
});
