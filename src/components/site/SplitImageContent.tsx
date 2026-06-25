import Image from 'next/image';
import type { ReactNode } from 'react';

type SplitImageContentProps = {
  imageSrc?: string;
  imageAlt?: string;
  media?: ReactNode;
  reverse?: boolean;
  children: ReactNode;
  priority?: boolean;
  mediaTone?: 'plain' | 'soft';
};

export function SplitImageContent({
  imageSrc,
  imageAlt,
  media,
  reverse = false,
  children,
  priority = false,
  mediaTone = 'plain',
}: SplitImageContentProps) {
  const wrapperClass = ['split-showcase', 'reveal', reverse && 'split-showcase--reverse']
    .filter(Boolean)
    .join(' ');
  const mediaClass = [
    'split-showcase__media',
    mediaTone === 'soft' && 'split-showcase__media--soft',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClass}>
      <div className={mediaClass}>
        {media ??
          (imageSrc ? (
            <Image
              src={imageSrc}
              alt={imageAlt ?? ''}
              fill
              sizes="(min-width: 768px) 45vw, 100vw"
              priority={priority}
              className="split-showcase__img"
            />
          ) : null)}
      </div>
      <div className="split-showcase__content">{children}</div>
    </div>
  );
}
