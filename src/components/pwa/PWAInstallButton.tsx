import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  X,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full' | 'banner' | 'pill' | 'icon';
  className?: string;
  onInstalled?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  className = '',
  onInstalled,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already installed and running standalone, suppress prompt
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      setInstalling(true);
      const success = await install();
      setInstalling(false);
      if (success && onInstalled) {
        onInstalled();
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // In desktop preview or browser where beforeinstallprompt hasn't fired yet
      setShowIOSGuide(true);
    }
  };

  // Render modal for iOS or manual install guidance
  const renderGuideModal = () => {
    if (!showIOSGuide) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 text-slate-900">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-[#EA580C] text-white flex items-center justify-center font-black text-xs shadow-xs">
                EX
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Install Excellence App</h3>
                <p className="text-[10px] text-slate-500 font-semibold">Standalone PWA Mobile Experience</p>
              </div>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 text-xs text-slate-600">
            <p className="font-medium">
              Install the app directly to your device home screen for fullscreen access, faster load times, and offline mock exams:
            </p>

            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-2.5">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs">
                  <span className="font-bold text-slate-900 block">
                    {isIOS ? 'Tap the Safari Share button' : 'Open Browser Menu'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {isIOS ? (
                      <span className="inline-flex items-center gap-1">
                        Tap <Share className="w-3.5 h-3.5 text-blue-600 inline" /> at bottom of screen
                      </span>
                    ) : (
                      'Click the three dots ⋮ or install icon in the address bar'
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs">
                  <span className="font-bold text-slate-900 block">Select "Add to Home Screen"</span>
                  <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                    Tap <PlusSquare className="w-3.5 h-3.5 text-slate-700 inline" /> <strong>Add to Home Screen</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Launches instantly in standalone app mode with zero URL bar.</span>
            </div>
          </div>

          <button
            onClick={() => setShowIOSGuide(false)}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-xs"
          >
            Got it, Close
          </button>
        </div>
      </div>
    );
  };

  // 1. Compact button (Ideal for TopNav)
  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          disabled={installing}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-orange-200 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-xs ${className}`}
          title="Install Excellence PWA on your device"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
        {renderGuideModal()}
      </>
    );
  }

  // 2. Pill variant (Ideal for header badges or student portal bottom)
  if (variant === 'pill') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          disabled={installing}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition-all ${className}`}
        >
          <Download className="w-3 h-3" />
          <span>Install App</span>
        </button>
        {renderGuideModal()}
      </>
    );
  }

  // 3. Icon variant (Ideal for minimal headers)
  if (variant === 'icon') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          disabled={installing}
          className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10 shadow-xs ${className}`}
          title="Install Excellence App"
        >
          <Download className="w-4 h-4" />
        </button>
        {renderGuideModal()}
      </>
    );
  }

  // 4. Banner variant (Ideal for top of Student Portal or Home Tab)
  if (variant === 'banner') {
    return (
      <>
        <div
          className={`rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-[#0F172A] border border-orange-500/30 p-3.5 text-white shadow-md flex items-center justify-between gap-3 ${className}`}
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#EA580C] text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-black text-white truncate">Install Student App</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  PWA
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Add to your home screen for offline access & faster CBT drills
              </p>
            </div>
          </div>

          <button
            onClick={handleInstallClick}
            disabled={installing}
            className="shrink-0 px-3.5 py-2 rounded-xl bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        </div>
        {renderGuideModal()}
      </>
    );
  }

  // 4. Full button
  return (
    <>
      <button
        onClick={handleInstallClick}
        disabled={installing}
        className={`w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#EA580C] to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center space-x-2 ${className}`}
      >
        <Download className="w-4 h-4" />
        <span>Install Excellence Portal to Home Screen</span>
      </button>
      {renderGuideModal()}
    </>
  );
};
