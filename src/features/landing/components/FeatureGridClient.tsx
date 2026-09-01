'use client';
import { useScrollReveal } from '../hooks/useScrollReveal';
import Box from '@mui/material/Box';

export function FeatureGridClient({ children, className }: { children: React.ReactNode, className?: string }) {
  const containerRef = useScrollReveal<HTMLDivElement>('[data-reveal-item]');
  return (
    <Box ref={containerRef} className={className}>
      {children}
    </Box>
  );
}
