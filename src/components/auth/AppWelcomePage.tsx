import React from 'react';
import { brandVars } from '../../lib/brand';

interface AppWelcomePageProps {
  centreName: string;
  accent?: string;
  logoUrl?: string;
  welcomeImageUrl?: string;
  onGetStarted: () => void;
  onLogin: () => void;
}

// The facility app's own home screen: shown when the installed app launches
// while nobody is signed in. A photo of the centre (or its own welcome image),
// then Get Started (student sign-up) and Log In, all in the facility's brand.
export const AppWelcomePage: React.FC<AppWelcomePageProps> = ({ centreName, accent, logoUrl, welcomeImageUrl, onGetStarted, onLogin }) => {
  const img = welcomeImageUrl || '/welcome-default.jpg';
  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col" style={brandVars(accent)}>
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          {logoUrl ? (
            <img src={logoUrl} alt={`${centreName} logo`} className="w-16 h-16 rounded-2xl object-contain bg-white p-1.5 mx-auto mb-4 shadow-lg" />
          ) : null}
          <div className="rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-slate-900">
            <img src={img} alt="Students learning" className="w-full aspect-[3/4] object-cover" />
            <div className="p-5 space-y-1.5">
              <h1 className="text-xl font-black leading-tight">Welcome to {centreName}</h1>
              <p className="text-xs text-slate-400 font-medium">Learn, practise and stay on top of your exams.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGetStarted}
            className="w-full mt-6 py-4 rounded-xl bg-orange-500 text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all"
          >
            Get Started
          </button>
          <button
            type="button"
            onClick={onLogin}
            className="w-full mt-3 py-4 rounded-xl border border-slate-700 text-slate-200 font-bold text-sm active:scale-[0.98] transition-all"
          >
            Log In
          </button>
        </div>
      </div>
    </div>
  );
};
