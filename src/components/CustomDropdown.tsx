import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import ReactDOM from 'react-dom';
import gsap from 'gsap';
import { DropdownOption } from '../types';

interface CustomDropdownProps {
  options: DropdownOption[];
  selectedValue: string;
  onChange: (value: string) => void;
  customClass?: string;
  label?: string;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  options = [],
  selectedValue,
  onChange,
  customClass = '',
  label = '選択肢',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLIElement>(null);

  const listboxId = useId();
  const safeOptions = Array.isArray(options) ? options : [];
  const selectedOption = safeOptions.find((o) => o.value === selectedValue) || safeOptions[0];

  const handleClose = useCallback((immediate = false) => {
    if (chevronRef.current) {
      gsap.killTweensOf(chevronRef.current);
      gsap.to(chevronRef.current, { rotate: 0, duration: 0.15 });
    }

    if (!menuRef.current || immediate) {
      if (menuRef.current) gsap.killTweensOf(menuRef.current);
      setIsOpen(false);
      setFocusedIndex(-1);
      return;
    }

    gsap.killTweensOf(menuRef.current);
    gsap.to(menuRef.current, {
      opacity: 0,
      scale: 0.95,
      duration: 0.12,
      ease: 'power2.in',
      onComplete: () => {
        setIsOpen(false);
        setFocusedIndex(-1);
      },
    });
  }, []);

  const handleOpen = useCallback(() => {
    if (safeOptions.length === 0) return;
    const initialIndex = safeOptions.findIndex((o) => o.value === selectedValue);
    setFocusedIndex(initialIndex >= 0 ? initialIndex : 0);
    setIsOpen(true);
  }, [safeOptions, selectedValue]);

  // Position and animate menu when opened
  useEffect(() => {
    if (!isOpen || !menuRef.current || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const minWidth = Math.max(rect.width, 140);
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 200;
    const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    const menu = menuRef.current;
    menu.style.minWidth = `${minWidth}px`;

    if (openUpward) {
      menu.style.top = 'auto';
      menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      menu.style.transformOrigin = 'bottom right';
    } else {
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.bottom = 'auto';
      menu.style.transformOrigin = 'top right';
    }

    let leftPos = rect.right - minWidth;
    if (leftPos < 10) leftPos = rect.left;
    menu.style.left = `${Math.max(10, leftPos)}px`;

    gsap.killTweensOf([menu, chevronRef.current]);
    gsap.fromTo(
      menu,
      { opacity: 0, scale: 0.92, y: openUpward ? 6 : -6 },
      { opacity: 1, scale: 1, y: 0, duration: 0.18, ease: 'back.out(1.5)' }
    );

    if (chevronRef.current) {
      gsap.to(chevronRef.current, { rotate: 180, duration: 0.15 });
    }
  }, [isOpen]);

  // Close dropdown on outside click, window resize, or container scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        handleClose(true);
      }
    };

    const handleWindowChange = () => handleClose(true);

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isOpen, handleClose]);

  // Auto-scroll focused item into view during keyboard navigation
  useEffect(() => {
    if (!isOpen || focusedIndex < 0 || !menuRef.current) return;
    const focusedOptionEl = menuRef.current.children[focusedIndex] as HTMLElement | undefined;
    focusedOptionEl?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, focusedIndex]);

  // Cleanup GSAP animations on unmount
  useEffect(() => {
    return () => {
      if (menuRef.current) gsap.killTweensOf(menuRef.current);
      if (chevronRef.current) gsap.killTweensOf(chevronRef.current);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (safeOptions.length === 0) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        handleOpen();
      } else if (focusedIndex >= 0 && safeOptions[focusedIndex]) {
        onChange(safeOptions[focusedIndex].value);
        handleClose(true);
      } else {
        handleClose(true);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        handleClose(true);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        handleOpen();
      } else {
        setFocusedIndex((prev) => (prev + 1) % safeOptions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        handleOpen();
      } else {
        setFocusedIndex((prev) => (prev - 1 + safeOptions.length) % safeOptions.length);
      }
    }
  };

  const handleOptionClick = (value: string) => {
    onChange(value);
    handleClose(true);
  };

  return (
    <div className={`custom-dropdown-container ${customClass}`}>
      <div
        ref={triggerRef}
        className="custom-dropdown-trigger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        role="combobox"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={
          isOpen && focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined
        }
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) handleClose(true);
          else handleOpen();
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="trigger-label truncate">{selectedOption ? selectedOption.label : ''}</span>
        <i
          ref={chevronRef}
          className="fa-solid fa-chevron-down text-xs theme-text-muted transition-transform duration-200 chevron-icon"
        />
      </div>

      {isOpen &&
        typeof document !== 'undefined' &&
        ReactDOM.createPortal(
          <div
            id={listboxId}
            ref={menuRef}
            className="custom-dropdown-menu-portal hide-scrollbar"
            role="listbox"
            aria-label={label}
          >
            {safeOptions.map((opt, index) => {
              const isSelected = opt.value === selectedValue;
              const isFocused = index === focusedIndex;
              return (
                <div
                  id={`${listboxId}-option-${index}`}
                  key={opt.value}
                  className={`custom-dropdown-item ${isSelected ? 'is-selected' : ''} ${
                    isFocused ? 'is-focused' : ''
                  }`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOptionClick(opt.value);
                  }}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <i className="fa-solid fa-check text-xs theme-text-brand" />}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};