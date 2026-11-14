import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';

export interface ActionSheetItem {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  badge?: string;
  onClick: () => void;
}

interface ActionSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  items: ActionSheetItem[];
}

export const ActionSheetModal: React.FC<ActionSheetModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  items,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  // Esc key dismiss
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus management: move focus into the sheet on open
  useEffect(() => {
    if (isOpen) {
      setDragOffset(0);
      const timer = setTimeout(() => {
        firstButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Touch drag-to-dismiss handlers (mimics iOS / popular apps swipe-down)
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const deltaY = e.touches[0].clientY - touchStartY;
    if (deltaY > 0) {
      setDragOffset(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (dragOffset > 70) {
      onClose();
    }
    setTouchStartY(null);
    setDragOffset(0);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-splash-backdrop bg-slate-950/65 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset === 0 ? 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
        }}
        className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[28px] p-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-5 shadow-[0_-20px_60px_rgba(15,23,42,0.35)] border-t sm:border border-slate-200/90 animate-splash-up space-y-4 relative overflow-hidden"
      >
        {/* Native-style Grab Handle */}
        <div
          aria-hidden="true"
          className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto mb-2 cursor-grab active:cursor-grabbing hover:bg-slate-400 transition-colors"
        />

        {/* Header with Title, badge, and Close button */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-pulse" />
              <h3 className="text-base font-black text-[#0F172A] tracking-tight">
                {title}
              </h3>
            </div>
            {description && (
              <p className="text-xs text-slate-500 font-semibold truncate mt-0.5 pl-4">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-90"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Two big popular-app styled rows */}
        <div className="space-y-2.5 pt-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={index === 0 ? firstButtonRef : undefined}
              type="button"
              onClick={() => {
                onClose();
                item.onClick();
              }}
              className="w-full min-h-[72px] p-3.5 sm:p-4 rounded-[20px] border border-slate-200/90 hover:border-orange-500/70 bg-gradient-to-r from-slate-50/70 via-white to-white hover:from-orange-50/30 hover:to-white transition-all flex items-center justify-between gap-3.5 text-left cursor-pointer active:scale-[0.98] group shadow-2xs"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div
                  className={`w-12 h-12 rounded-2xl ${item.iconBg} flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 group-active:scale-95 transition-transform`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-[#0F172A] tracking-tight group-hover:text-[#C2410C] transition-colors truncate">
                      {item.title}
                    </h4>
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-100 text-[#C2410C] border border-orange-200/60 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-semibold truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[#C2410C] group-hover:translate-x-1 transition-all shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

