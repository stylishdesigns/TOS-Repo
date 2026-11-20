import React from 'react';
import { Upload, X } from 'lucide-react';

// Proof of payment (optional): the admin recording a payment attaches the
// receipt screenshot or photo; it uploads straight away and shows as a small
// preview with a remove button until the payment is posted.
export const ProofOfPaymentUpload: React.FC<{
  url: string;
  name?: string;
  busy: boolean;
  onPick: (file: File | null) => void;
  onClear: () => void;
}> = ({ url, name, busy, onPick, onClear }) => (
  <div>
    <label className="block text-[11px] font-bold text-slate-700 mb-1">
      Proof of payment (optional)
    </label>
    {url ? (
      <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50">
        <img src={url} alt="Proof of payment" className="w-10 h-10 rounded-md object-cover shrink-0" />
        <span className="text-[11px] font-semibold text-slate-600 truncate flex-1 min-w-0">
          {name || 'Attached image'}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer shrink-0"
          title="Remove proof"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    ) : (
      <label
        className={`flex items-center justify-center gap-2 h-16 border-2 border-dashed rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
          busy
            ? 'border-slate-200 text-slate-400 cursor-wait'
            : 'border-slate-300 text-slate-500 hover:border-orange-400 hover:text-orange-600'
        }`}
      >
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            onPick(f);
            e.target.value = '';
          }}
        />
        <Upload className="w-4 h-4 shrink-0" />
        {busy ? 'Uploading…' : 'Upload receipt screenshot or photo'}
      </label>
    )}
  </div>
);
