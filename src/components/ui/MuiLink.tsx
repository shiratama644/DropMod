'use client';
import { forwardRef } from 'react';
import Link, { type LinkProps } from 'next/link';

// RSC から Client Component である MUI への Next/Link 関数渡しを防ぐラッパー
export const MuiLink = forwardRef<HTMLAnchorElement, Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & LinkProps>(
  function MuiLink(props, ref) {
    return <Link ref={ref} {...props} />;
  }
);
