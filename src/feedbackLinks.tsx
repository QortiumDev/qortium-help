import { type ReactNode } from 'react';
import { qdnRequest } from './qdnRequest';

// Matches qdn://, home:// and core:// app addresses inside free text. These are
// the schemes Qortium Home's OPEN_NEW_TAB action accepts.
const APP_LINK_PATTERN = /\b(?:qdn|home|core):\/\/[^\s<>"'`]+/gi;
const TRAILING_SIMPLE_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);
const CLOSING_PAIRS: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{',
};

export type FeedbackTextPart =
  | {
      kind: 'text';
      text: string;
    }
  | {
      address: string;
      kind: 'app-link';
      text: string;
    };

function countCharacter(value: string, character: string) {
  let count = 0;

  for (const candidate of value) {
    if (candidate === character) {
      count += 1;
    }
  }

  return count;
}

// URLs are commonly followed by punctuation ("see qdn://APP/Foo.") or wrapped in
// brackets. Peel trailing punctuation off the match so it stays as plain text and
// the link target is clean.
function splitTrailingPunctuation(value: string) {
  let address = value;
  let trailing = '';

  while (address) {
    const lastCharacter = address[address.length - 1];
    const matchingOpening = CLOSING_PAIRS[lastCharacter];
    const shouldTrimClosing =
      matchingOpening !== undefined &&
      countCharacter(address, lastCharacter) > countCharacter(address, matchingOpening);

    if (!TRAILING_SIMPLE_PUNCTUATION.has(lastCharacter) && !shouldTrimClosing) {
      break;
    }

    trailing = `${lastCharacter}${trailing}`;
    address = address.slice(0, -1);
  }

  return { address, trailing };
}

export function getFeedbackTextParts(text: string): FeedbackTextPart[] {
  const parts: FeedbackTextPart[] = [];
  let previousIndex = 0;
  const appendText = (textPart: string) => {
    if (!textPart) {
      return;
    }

    const previousPart = parts[parts.length - 1];

    if (previousPart?.kind === 'text') {
      previousPart.text += textPart;
    } else {
      parts.push({ kind: 'text', text: textPart });
    }
  };

  for (const match of text.matchAll(APP_LINK_PATTERN)) {
    const rawAddress = match[0];
    const matchIndex = match.index ?? 0;
    const { address, trailing } = splitTrailingPunctuation(rawAddress);

    if (!address) {
      continue;
    }

    if (matchIndex > previousIndex) {
      appendText(text.slice(previousIndex, matchIndex));
    }

    parts.push({ address, kind: 'app-link', text: address });

    if (trailing) {
      appendText(trailing);
    }

    previousIndex = matchIndex + rawAddress.length;
  }

  if (previousIndex < text.length) {
    appendText(text.slice(previousIndex));
  }

  return parts.length > 0 ? parts : [{ kind: 'text', text }];
}

export async function openAppLinkInHomeTab(address: string) {
  return qdnRequest<boolean>({ action: 'OPEN_NEW_TAB', address });
}

// Renders post / comment bodies, turning app addresses into links that open in a
// new Qortium Home tab. Falls back gracefully outside the Home bridge.
export function renderFeedbackText(text: string): ReactNode {
  return getFeedbackTextParts(text).map((part, index) => {
    if (part.kind === 'text') {
      return part.text;
    }

    return (
      <a
        className="app-link"
        href={part.address}
        key={`${part.address}-${index}`}
        onClick={(event) => {
          event.preventDefault();

          void openAppLinkInHomeTab(part.address).catch((error) => {
            console.warn('Unable to open app link.', error);
          });
        }}
        rel="noopener noreferrer"
        target="_blank"
      >
        {part.text}
      </a>
    );
  });
}
