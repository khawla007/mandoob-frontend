'use client';

import { useRef } from 'react';
import type { PointerEvent } from 'react';
import type { PointerState } from '@/utils/physics';

export function useMouse() {
  const pointer = useRef<PointerState>({ x: 0.5, y: 0.5, active: false });

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      active: true,
    };
  }

  function onPointerLeave() {
    pointer.current.active = false;
  }

  return { pointer, onPointerMove, onPointerLeave };
}
