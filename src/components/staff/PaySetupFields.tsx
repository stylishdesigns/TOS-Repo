import React, { useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ModernSelect } from '../ui/ModernSelect';
import { getAuth } from 'firebase/auth';

export interface PaySetupState {
  frequency: '' | 'daily' | 'weekly' | 'monthly';
  day: string;
  ratePerPeriod: string;
  payAmount: string;
}

export const emptyPaySetup: PaySetupState = { frequency: '', day: '', ratePerPeriod: '', payAmount: '' };

export const payFromDoc = (doc: any): PaySetupState => ({
  frequency: (doc?.payFrequency || '') as PaySetupState['frequency'],
  day: doc?.payDay != null ? String(doc.payDay) : '',
  ratePerPeriod: doc?.ratePerPeriod != null ? String(doc.ratePerPeriod) : '',
  payAmount: doc?.payAmount != null ? String(doc.payAmount) : '',
});

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WEEKDAY_OPTIONS = WEEKDAY_NAMES.map((label, i) => ({ value: String(i), label }));

const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// A short human line for a staff member's pay setup, e.g.
// "Weekly, every Friday · ₦10,000 a week".
export const formatPayInfo = (doc: any, isTutor: boolean): string => {
  const freq = doc?.payFrequency;
  if (!freq) return 'Not set yet';
  const dayNum = Number(doc?.payDay);
  let cycle = 'Daily';
  if (freq === 'weekly') cycle = `Weekly, every ${WEEKDAY_NAMES[dayNum] || 'day'}`;
  if (freq === 'monthly') cycle = `Monthly, on the ${dayNum >= 1 && dayNum <= 28 ? ordinal(dayNum) : 'same date'}`;
  const naira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`;
  if (isTutor) {
    const r = Number(doc?.ratePerPeriod);
    return r > 0 ? `${cycle} · ${naira(r)} per class` : cycle;
  }
  const a = Number(doc?.payAmount);
  const per = freq === 'daily' ? 'a day' : freq === 'weekly' ? 'a week' : 'a month';
  return a > 0 ? `${cycle} · ${naira(a)} ${per}` : cycle;
};

const inputClass =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none';

export const PaySetupFields: React.FC<{
  pay: PaySetupState;
  setPay: (p: PaySetupState) => void;
  showRatePerClass: boolean;
}> = ({ pay, setPay, showRatePerClass }) => (
  <div className="space-y-3">
    <ModernSelect
      label="Pay Frequency"
      value={pay.frequency}
      onChange={(val) => setPay({ ...pay, frequency: val as PaySetupState['frequency'], day: '' })}
      options={[
        { value: '', label: 'Not set' },
        { value: 'daily', label: 'Daily' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
      ]}
    />
    {pay.frequency === 'weekly' && (
      <ModernSelect
        label="Pay Day"
        value={pay.day}
        onChange={(val) => setPay({ ...pay, day: val })}
        options={WEEKDAY_OPTIONS}
        placeholder="Choose the pay day"
      />
    )}
    {pay.frequency === 'monthly' && (
      <ModernSelect
        label="Pay Date"
        value={pay.day}
        onChange={(val) => setPay({ ...pay, day: val })}
        options={MONTH_DAY_OPTIONS}
        placeholder="Choose the date each month"
      />
    )}
    {showRatePerClass ? (
      <div>
        <label className="block font-semibold text-slate-700 mb-1">Amount Per Class (₦)</label>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="e.g. 2000"
          value={pay.ratePerPeriod}
          onChange={(e) => setPay({ ...pay, ratePerPeriod: e.target.value })}
          className={inputClass}
        />
        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
          A record of how much one class is worth. The exact amount you pay each time stays your call.
        </p>
      </div>
    ) : (
      pay.frequency !== '' && (
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Amount Per {pay.frequency === 'daily' ? 'Day' : pay.frequency === 'weekly' ? 'Week' : 'Month'} (₦)
          </label>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="e.g. 50000"
            value={pay.payAmount}
            onChange={(e) => setPay({ ...pay, payAmount: e.target.value })}
            className={inputClass}
          />
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">What they receive each time you pay them.</p>
        </div>
      )
    )}
  </div>
);

export const PayEditModal: React.FC<{
  staffId: string;
  staffName: string;
  isTutor: boolean;
  collection: 'tutors' | 'admins';
  centreId: string;
  initial: PaySetupState;
  onClose: () => void;
}> = ({ staffId, staffName, isTutor, collection, centreId, initial, onClose }) => {
  const { addToast } = useApp();
  const [pay, setPay] = useState<PaySetupState>(initial);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch('/api/centre/staff/pay', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          centreId,
          collection,
          staffId,
          payFrequency: pay.frequency,
          payDay: pay.day,
          ratePerPeriod: pay.ratePerPeriod,
          payAmount: pay.payAmount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save the pay setup.');
      addToast({ type: 'success', title: 'Pay Setup Saved', description: `${staffName}'s pay details have been updated.` });
      onClose();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save Failed', description: err?.message || 'Could not save the pay setup.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center space-x-2">
              <Wallet className="w-5 h-5 text-orange-600" />
              <span>Edit Pay</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{staffName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSave} className="mt-4 space-y-3.5 text-xs">
          <PaySetupFields pay={pay} setPay={setPay} showRatePerClass={isTutor} />
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Pay Setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
