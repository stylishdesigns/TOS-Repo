import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PlaySquare, ScrollText } from 'lucide-react';
import { VideoTermsModal } from '../public/legal/TermsPrivacy';
import { getAuth } from 'firebase/auth';
import { useApp } from '../../context/AppContext';
import { Tutor } from '../../types';
import { TutorMaterialsSection } from '../tutor-portal/tabs/TutorMaterialsSection';

/**
 * Batch 44: the facility admin's Resources section. Two parts:
 *
 * 1. Tutorial OS video classes switch. Every facility decides whether its
 *    students see the TOS video class library at all. The switch is stored
 *    on the centre's document and read on every student fetch, so it takes
 *    effect the moment it is flipped.
 * 2. Facility uploads. The admin uploads PDFs, images and video links for
 *    their students through the same surface tutors use, so admins are no
 *    longer locked out of study materials.
 */

const authCall = async (path: string, method: 'GET' | 'POST', body?: unknown) => {
  const token = (await getAuth().currentUser?.getIdToken()) || '';
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

const brandTint = 'color-mix(in srgb, var(--brand, #0F172A) 12%, white)';

export const ResourcesManager: React.FC = () => {
  const { activeCentreId, subjects } = useApp() as any;

  // Tutorial OS video classes switch
  const [vcEnabled, setVcEnabled] = useState<boolean | null>(null);
  const [vcBusy, setVcBusy] = useState(false);
  const [vcError, setVcError] = useState('');
  // Batch 57: the video-classes terms. The switch's card carries a
  // View-terms button so the admin reads the legal side before flipping it.
  const [vcTermsOpen, setVcTermsOpen] = useState(false);

  const loadVc = useCallback(async () => {
    if (!activeCentreId) return;
    try {
      const data = await authCall(`/api/centre/video-classes?centreId=${encodeURIComponent(activeCentreId)}`, 'GET');
      setVcEnabled(data.enabled !== false);
      setVcError('');
    } catch (e: any) {
      setVcError(e.message || 'Could not load the video classes setting.');
    }
  }, [activeCentreId]);

  useEffect(() => { loadVc(); }, [loadVc]);

  const setVc = async (on: boolean) => {
    setVcBusy(true);
    setVcError('');
    try {
      await authCall('/api/centre/video-classes', 'POST', { centreId: activeCentreId, enabled: on });
      setVcEnabled(on);
    } catch (e: any) {
      setVcError(e.message || 'Could not save the video classes setting.');
    } finally {
      setVcBusy(false);
    }
  };

  // The admin uploads with the same form tutors use. Their uploads land in
  // the facility's shared material list, and students see everything in it.
  const adminTutor = {
    id: getAuth().currentUser?.uid || 'facility-admin',
    name: getAuth().currentUser?.displayName || 'Facility admin',
    subjects: (Array.isArray(subjects) ? subjects : [])
      .map((s: any) => (typeof s === 'string' ? s : String(s?.name || '')))
      .filter(Boolean),
  } as unknown as Tutor;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Resources</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Video classes and study materials for your students.
        </p>
      </div>

      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur rounded-2xl border border-slate-200/60 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: brandTint }}>
              <PlaySquare className="w-4 h-4" style={{ color: 'var(--brand, #0F172A)' }} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Tutorial OS video classes</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                The ready-made video lesson library from Tutorial OS.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={vcEnabled !== false}
            aria-label="Tutorial OS video classes"
            disabled={vcEnabled === null || vcBusy}
            onClick={() => setVc(!(vcEnabled !== false))}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${vcEnabled !== false ? '' : 'bg-slate-300 dark:bg-slate-600'}`}
            style={vcEnabled !== false ? { background: 'var(--brand, #0F172A)' } : undefined}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${vcEnabled !== false ? 'translate-x-5' : ''}`} />
            {vcBusy && <Loader2 className="w-3 h-3 text-white animate-spin absolute inset-0 m-auto" />}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
          {vcEnabled === false
            ? 'Off: your students never see the Tutorial OS video classes in their app.'
            : 'On: your students see the Tutorial OS video classes in their app, arranged by subject and topic.'}
          {' '}Your own uploaded resources are always visible either way. The switch works instantly.
        </p>
        <button
          type="button"
          onClick={() => setVcTermsOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--brand, #0F172A)] dark:text-slate-200 hover:underline"
        >
          <ScrollText className="w-3.5 h-3.5" />
          View terms &amp; conditions
        </button>
        {vcError && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-2">{vcError}</p>}
      </div>
      {vcTermsOpen && <VideoTermsModal onClose={() => setVcTermsOpen(false)} />}

      <div>
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-1">Facility uploads</h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
          Upload PDFs, images and video links for your students, the same way tutors do. Students see everything uploaded here in their app.
        </p>
        <TutorMaterialsSection tutor={adminTutor} />
      </div>
    </div>
  );
};

export default ResourcesManager;
