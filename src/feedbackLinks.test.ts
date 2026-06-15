import { describe, expect, it } from 'vitest';
import { getFeedbackTextParts } from './feedbackLinks';

describe('feedback app links', () => {
  it('returns plain text untouched', () => {
    expect(getFeedbackTextParts('just some feedback')).toEqual([{ kind: 'text', text: 'just some feedback' }]);
  });

  it('splits qdn:// links out of surrounding text', () => {
    expect(getFeedbackTextParts('Try qdn://APP/Help/default now')).toEqual([
      { kind: 'text', text: 'Try ' },
      { address: 'qdn://APP/Help/default', kind: 'app-link', text: 'qdn://APP/Help/default' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('recognizes home:// and core:// schemes', () => {
    expect(getFeedbackTextParts('open home://settings or core://names')).toEqual([
      { kind: 'text', text: 'open ' },
      { address: 'home://settings', kind: 'app-link', text: 'home://settings' },
      { kind: 'text', text: ' or ' },
      { address: 'core://names', kind: 'app-link', text: 'core://names' },
    ]);
  });

  it('keeps trailing punctuation as text', () => {
    expect(getFeedbackTextParts('see qdn://APP/Help/default.')).toEqual([
      { kind: 'text', text: 'see ' },
      { address: 'qdn://APP/Help/default', kind: 'app-link', text: 'qdn://APP/Help/default' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('does not linkify a bare scheme with no host', () => {
    expect(getFeedbackTextParts('qdn://')).toEqual([{ kind: 'text', text: 'qdn://' }]);
  });

  it('does not treat other text as a link', () => {
    expect(getFeedbackTextParts('https://example.com is not an app link')).toEqual([
      { kind: 'text', text: 'https://example.com is not an app link' },
    ]);
  });
});
