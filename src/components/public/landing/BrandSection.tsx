import React, { useState } from 'react';
import { BRAND_COLOURS, BRAND_POINTS, DEFAULT_BRAND_NAME, brandDisplayName, brandInitials } from './landingContent';
import { PointList } from './PointList';

export const BrandSection: React.FC = () => {
  const [name, setName] = useState(DEFAULT_BRAND_NAME);
  const [colour, setColour] = useState<(typeof BRAND_COLOURS)[number]>(BRAND_COLOURS[0]);
  const shown = brandDisplayName(name);
  return (
    <section className="mb-16 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center" aria-labelledby="brand-title">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-orange-400">White label</p>
        <h2 id="brand-title" className="text-2xl md:text-3xl font-black tracking-tight mt-1">Your name on everything.</h2>
        <p className="text-slate-400 text-sm mt-3 mb-5 leading-relaxed max-w-md">
          Tutorial OS runs quietly in the background. Your students see your centre, never ours.
        </p>
        <PointList points={BRAND_POINTS} />
        <div className="mt-6">
          <label htmlFor="brand-name" className="block text-xs font-bold text-slate-300 mb-1.5">Try it: type your centre name</label>
          <input
            id="brand-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-sm bg-slate-800/70 border border-white/10 focus:border-orange-500/60 rounded-xl px-4 py-3 text-sm text-white outline-none"
          />
          <div className="flex gap-2.5 mt-3.5" role="group" aria-label="Brand colour">
            {BRAND_COLOURS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.label}
                aria-pressed={colour.id === c.id}
                onClick={() => setColour(c)}
                style={{ backgroundColor: c.hex }}
                className={`w-11 h-11 rounded-full border-[3px] border-slate-900 ${colour.id === c.id ? 'ring-[3px] ring-white' : 'ring-2 ring-slate-600'}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-white text-slate-900 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border-b border-slate-200">
            <i className="w-2.5 h-2.5 rounded-full bg-slate-300" /><i className="w-2.5 h-2.5 rounded-full bg-slate-300" /><i className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="ml-2 flex-1 bg-white rounded-md px-2.5 py-1 text-[11px] text-slate-500">[your centre address]</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200">
            <span className="w-9 h-9 rounded-full text-white text-[13px] font-black flex items-center justify-center shrink-0" style={{ backgroundColor: colour.hex }}>{brandInitials(name)}</span>
            <b className="flex-1 min-w-0 truncate text-sm font-extrabold">{shown}</b>
            <span className="text-xs font-semibold text-slate-500 hidden sm:block">Programmes</span>
            <span className="rounded-lg text-white text-xs font-extrabold px-3 py-1.5" style={{ backgroundColor: colour.hex }}>Enrol now</span>
          </div>
          <div className="px-5 py-8 text-white" style={{ backgroundColor: colour.hex }}>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] opacity-90">Exam preparation</p>
            <p className="text-2xl font-black leading-tight tracking-tight mt-2 mb-4">JAMB, WAEC and NECO classes for serious students.</p>
            <span className="inline-block bg-white text-slate-900 rounded-lg px-4 py-2.5 text-[13px] font-extrabold">Enrol your child</span>
          </div>
          <div className="px-4 py-3.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Follow us</span>
            {['Facebook', 'Instagram', 'TikTok'].map((s) => (
              <span key={s} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">{s}</span>
            ))}
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-3">Example. Your page shows your own name, colours and content.</p>
      </div>
    </section>
  );
};
