'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './use-reduced-motion';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}

/**
 * Scroll-triggered compositor reveal wrapper using IntersectionObserver.
 * Respects `prefers-reduced-motion` and avoids layout shifts.
 */
export function Reveal({ children, className = '', delayMs = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -12px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const isShown = visible || reducedMotion;

  return (
    <div
      ref={ref}
      style={!reducedMotion && delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={`transition-[opacity,transform] duration-500 ease-out ${
        isShown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      } ${className}`}
    >
      {children}
    </div>
  );
}
