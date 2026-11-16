import React, { useState } from 'react';
import { ExternalLink, Globe, Inbox, LayoutTemplate } from 'lucide-react';
import { LandingEditor } from '../landing/LandingEditor';
import { LandingEnquiries } from './LandingEnquiries';
import { useApp } from '../../context/AppContext';

/**
 * Website (Landing page) section for facility admins (landing-page piece 4).
 * Two tabs:
 *  - Template design: the facility's own landing-page builder. The server
 *    scopes /api/centre/landing to the signed-in admin's facility, so no
 *    facility picker is shown and no other facility's page is reachable.
 *  - Website enquiries: the same enquiry inbox, now inside this section.
 */

type Tab = 'design' | 'enquiries';

const TABS: Array<{ id: Tab; label: string; Icon: React.FC<{ className?: string }> }> = [
  { id: 'design', label: 'Template design', Icon: LayoutTemplate },
  { id: 'enquiries', label: 'Website enquiries', Icon: Inbox },
];

export const WebsiteLanding: React.FC = () => {
  const [tab, setTab] = useState<Tab>('design');
  const { activeCentreId } = useApp();
  const publicUrl = activeCentreId ? `${window.location.origin}/c/${activeCentreId}` : '';

  return (
    <div className="w-full">
      <div className="p-4 sm:p-6 pb-0 max-w-5xl mx-auto w-full">
        <h1 className="text-xl sm:text-2xl font-black text-white">Website (Landing page)</h1>
        <p className="text-sm text-slate-400 mt-1">
          Design your facility's landing page, publish it, and read the enquiries it brings in.
        </p>
        <div className="flex gap-2 mt-4 flex-wrap" role="tablist" aria-label="Website sections">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-bold border transition-colors ${
                tab === id
                  ? 'bg-[#EA580C] text-white border-[#EA580C]'
                  : 'bg-[#0F1B2E] text-slate-300 border-slate-800 hover:bg-[#15233C]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
          {publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 h-11 rounded-xl text-xs font-bold border border-[#EA580C] text-[#EA580C] bg-transparent hover:bg-[#FFF7ED] transition-colors"
              title="Open this facility's public landing page in a new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open public site
            </a>
          ) : null}
        </div>
      </div>

      {tab === 'design' ? (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full">
          <LandingEditor apiPath="/api/centre/landing" />
        </div>
      ) : (
        <LandingEnquiries />
      )}
    </div>
  );
};
