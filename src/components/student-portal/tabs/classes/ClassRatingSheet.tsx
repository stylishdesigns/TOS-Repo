import React, { useState, useEffect } from 'react';
import { X, Star, ShieldCheck } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../firebase';
import { TimetableSlot } from '../../../../types';
import { useApp } from '../../../../context/AppContext';

interface ClassRatingSheetProps {
  slot: TimetableSlot;
  studentId: string;
  onClose: () => void;
  onRatingSaved: (slotId: string, stars: number) => void;
}

const RATING_LABELS: Record<number, string> = {
  1: '1 of 5 · Poor',
  2: '2 of 5 · Fair',
  3: '3 of 5 · Average',
  4: '4 of 5 · Good',
  5: '5 of 5 · Excellent',
};

export const ClassRatingSheet: React.FC<ClassRatingSheetProps> = ({
  slot,
  studentId,
  onClose,
  onRatingSaved,
}) => {
  const { addClassRating } = useApp();
  const [selectedStars, setSelectedStars] = useState<number | null>(null);
  const [hoveredStars, setHoveredStars] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [existingCreatedAt, setExistingCreatedAt] = useState<string | null>(null);
  const [isPast24Hours, setIsPast24Hours] = useState<boolean>(false);

  const ratingDocId = `${slot.id}__${studentId}`;

  useEffect(() => {
    let isMounted = true;
    const fetchExisting = async () => {
      try {
        const snap = await getDoc(doc(db, 'classRatings', ratingDocId));
        if (snap.exists() && isMounted) {
          const data = snap.data();
          if (typeof data.stars === 'number') {
            setSelectedStars(data.stars);
          }
          if (data.createdAt) {
            setExistingCreatedAt(data.createdAt);
            const createdTime = new Date(data.createdAt).getTime();
            const now = Date.now();
            if (now - createdTime > 24 * 60 * 60 * 1000) {
              setIsPast24Hours(true);
            }
          }
        }
      } catch (err) {
        console.warn('Error reading class rating:', err);
      }
    };

    fetchExisting();

    return () => {
      isMounted = false;
    };
  }, [ratingDocId]);

  const handleSubmit = async () => {
    if (selectedStars === null || isPast24Hours) {
      if (selectedStars === null) return;
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await addClassRating({
        slotId: slot.id,
        tutorId: slot.tutorId || '',
        tutorName: slot.tutorName || '',
        studentId,
        stars: selectedStars,
      });
      onRatingSaved(slot.id, selectedStars);
      onClose();
    } catch (err) {
      console.error('Failed to submit class rating:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const activeStars = hoveredStars ?? selectedStars;
  const ratingText = activeStars ? (RATING_LABELS[activeStars] || `${activeStars} of 5`) : 'Tap a star to rate';
  const tutorDisplayName = slot.tutorName || 'Your tutor';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rate this class"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-[28px] sm:rounded-3xl max-w-sm w-full p-5 pt-3 pb-6 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom duration-200 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab bar */}
        <div className="w-10 h-1 rounded-full bg-[#CBD5E1] mx-auto mb-2" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-extrabold uppercase text-[#C2410C] tracking-[0.1em] block">
              Class finished
            </span>
            <h2 className="text-xl font-extrabold text-[#0F172A] tracking-tight leading-snug mt-0.5 truncate">
              {slot.subject} {slot.topic ? `· ${slot.topic}` : ''}
            </h2>
            <p className="text-xs text-[#64748B] font-medium mt-0.5">
              {tutorDisplayName} · today, {slot.time?.split(' - ')[0] || slot.time}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mt-1 -mr-1 rounded-xl bg-[#F1F5F9] text-[#334155] hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Question */}
        <p className="text-sm font-bold text-center text-[#0F172A] pt-1">
          How was the class?
        </p>

        {/* Star Rating Buttons (52px tap targets) */}
        <div className="space-y-2 py-0.5 text-center">
          <div
            role="radiogroup"
            aria-label="Rating from 1 to 5 stars"
            className="flex items-center justify-center space-x-1.5"
          >
            {[1, 2, 3, 4, 5].map((star) => {
              const isSelected = selectedStars === star;
              const isHighlighted = activeStars !== null && star <= activeStars;
              return (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  disabled={isPast24Hours}
                  onMouseEnter={() => setHoveredStars(star)}
                  onMouseLeave={() => setHoveredStars(null)}
                  onClick={() => setSelectedStars(star)}
                  className={`w-[52px] h-[52px] rounded-[14px] flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed ${
                    isSelected ? 'bg-[#FFFBEB] text-[#F59E0B]' : 'bg-transparent text-slate-300 hover:text-amber-400'
                  }`}
                >
                  <Star
                    className={`w-9 h-9 transition-colors ${
                      isHighlighted
                        ? 'fill-[#F59E0B] text-[#F59E0B]'
                        : 'text-[#CBD5E1] fill-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="text-center mt-1 text-[13px] font-extrabold text-[#B45309]">
            {ratingText}
          </div>
        </div>

        {/* Private Rating Notice */}
        <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-xs text-[#475569] leading-relaxed">
          Your rating is private. {tutorDisplayName} only sees the class average, never your name.
        </div>

        {isPast24Hours && (
          <p className="text-[11px] text-rose-600 font-semibold text-center">
            Ratings can only be updated within 24 hours of submission.
          </p>
        )}

        {/* Buttons */}
        <div className="space-y-1 pt-1">
          <button
            type="button"
            disabled={submitting || isPast24Hours || selectedStars === null}
            onClick={handleSubmit}
            className="w-full h-[52px] bg-[#C2410C] hover:bg-[#EA580C] text-white font-extrabold text-sm rounded-[14px] shadow-sm active:scale-98 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{submitting ? 'Submitting...' : selectedStars === null ? 'Select a rating to submit' : 'Submit rating'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 text-slate-600 hover:text-slate-900 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};
