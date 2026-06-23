import { useEffect, useState } from 'react';
import { getAvatarFallbackCharacter, getCachedAvatar, resolveAvatar } from './avatar';

// A small circular author avatar. Shows the registered name's initial as an
// immediate fallback and swaps in the QDN THUMBNAIL/avatar image once it
// resolves (cached for the session). Marked aria-hidden because the author's
// name is always rendered as adjacent text, so the avatar is decorative.
export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(() => getCachedAvatar(name) ?? null);

  useEffect(() => {
    const cached = getCachedAvatar(name);

    if (cached !== undefined) {
      setSrc(cached);
      return;
    }

    let active = true;

    void resolveAvatar(name).then((resolvedSrc) => {
      if (active) {
        setSrc(resolvedSrc);
      }
    });

    return () => {
      active = false;
    };
  }, [name]);

  return (
    <span aria-hidden="true" className="avatar" style={{ height: size, width: size }}>
      {src ? (
        <img alt="" className="avatar__img" src={src} />
      ) : (
        <span className="avatar__fallback">{getAvatarFallbackCharacter(name)}</span>
      )}
    </span>
  );
}
