'use client';

import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import type { ModrinthGalleryImage } from '@/types';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useModalRegistration } from '@/hooks/useModalUi';
import { shouldUnoptimizeImage } from '@/lib/utils/image';

interface ScreenshotGalleryModalProps {
  isOpen: boolean;
  images: ModrinthGalleryImage[];
  initialIndex?: number;
  onClose: () => void;
}

export const ScreenshotGalleryModal: React.FC<ScreenshotGalleryModalProps> = ({
  isOpen,
  images,
  initialIndex = 0,
  onClose
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(0);

  useModalA11y(isOpen, onClose, dialogRef);
  // モーダル open 中は BottomNav を隠す (2026-08-27)
  useModalRegistration(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const last = Math.max(images.length - 1, 0);
    const next = Number.isFinite(initialIndex) ? Math.trunc(initialIndex) : 0;
    setIndex(Math.min(Math.max(next, 0), last));
  }, [isOpen, initialIndex, images.length]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [isOpen]);

  const goPrev = useCallback(() => {
    setIndex((current) => {
      if (images.length === 0) return 0;
      return (current - 1 + images.length) % images.length;
    });
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex((current) => {
      if (images.length === 0) return 0;
      return (current + 1) % images.length;
    });
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, goPrev, goNext]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const current = images[index];
  const hasMany = images.length > 1;

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景 (Escape で閉じる)
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
    <div
      className="modal-overlay fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 "
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-card glass-panel w-full max-w-6xl h-[min(92%,56rem)] rounded-3xl border shadow-2xl relative flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-500/20 px-4 sm:px-6 py-3 shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="font-extrabold text-sm sm:text-base truncate">
              ギャラリー・スクリーンショット
            </h2>
            <p className="text-[11px] theme-text-muted truncate">
              {current?.title
                ? `${current.title} ・ ${index + 1} / ${images.length}`
                : `${index + 1} / ${images.length}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ギャラリーを閉じる"
            className="theme-text-muted hover:text-emerald-500 p-2 rounded-xl focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0"
          >
            <i className="fa-solid fa-xmark text-lg" aria-hidden />
          </button>
        </div>

        <div className="relative flex-1 min-h-0 bg-slate-950/40">
          {current ? (
            <Image
              src={current.raw_url || current.url}
              alt={current.title || 'ギャラリー画像'}
              fill
              sizes="100vw"
              className="object-contain p-2 sm:p-4"
              unoptimized={shouldUnoptimizeImage(current.raw_url || current.url)}
              priority
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center theme-text-muted text-sm">
              表示できる画像がありません
            </div>
          )}

          {hasMany && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="前の画像"
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-950/70 hover:bg-emerald-600 text-white shadow-lg flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-arrow-left" aria-hidden />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="次の画像"
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-950/70 hover:bg-emerald-600 text-white shadow-lg flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-arrow-right" aria-hidden />
              </button>
            </>
          )}
        </div>

        {current?.description && (
          <p className="px-4 sm:px-6 py-2 text-xs theme-text-secondary border-t border-slate-500/15 shrink-0">
            {current.description}
          </p>
        )}

        {hasMany && (
          <div className="shrink-0 border-t border-slate-500/15 px-3 sm:px-4 py-2.5 overflow-x-auto hide-scrollbar">
            <div className="flex items-center gap-2">
              {images.map((img, i) => {
                const active = i === index;
                return (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`${img.title || '画像'} ${i + 1} を表示`}
                    aria-current={active ? 'true' : undefined}
                    className={`relative w-16 h-10 sm:w-20 sm:h-12 rounded-lg overflow-hidden shrink-0 border transition ${
                      active
                        ? 'border-emerald-500 ring-2 ring-emerald-500/40'
                        : 'border-slate-700/50 hover:border-emerald-500/50'
                    }`}
                  >
                    <Image
                      src={img.url}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                      unoptimized={shouldUnoptimizeImage(img.url)}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
