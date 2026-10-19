import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { 
  UserCheck, 
  Search, 
  Save, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Filter
} from 'lucide-react';

export const RollCallTab: React.FC = () => {
  const { students, addToast } = useApp();
  const [search, setSearch] = useState('');
  
  const [attendance, setAttendance] = useState<
    Record<string, 'Present' | 'Late' | 'Absent'>
  >(() => {
    const initial: Record<string, 'Present' | 'Late' | 'Absent'> = {};
    (students || []).forEach((s, idx) => {
      initial[s.id] = idx === 3 ? 'Late' : idx === 4 ? 'Absent' : 'Present';
    });
    return initial;
  });

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.id.toLowerCase().includes(search.toLowerCase())
  );

  const handleUpdate = (id: string, status: 'Present' | 'Late' | 'Absent') => {
    setAttendance(prev => ({ ...prev, [id]: status }));
  };

  const handleSave = () => {
    addToast({
      type: 'success',
      title: 'Roll Call Synced',
      description: 'Class attendance has been successfully uploaded to the central database.',
    });
  };

  return (
    <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Daily Roll Call</h2>
          <p className="text-[11px] text-slate-500 font-medium">Mark attendance for General Mathematics (9:00 AM)</p>
        </div>
        <button 
          onClick={handleSave}
          className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm"
        >
          <Save className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find student..." 
            className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:border-orange-500 shadow-2xs"
          />
        </div>
        <button className="p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-400">
          <Filter className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {filteredStudents.map((student) => {
          const status = attendance[student.id] || 'Present';
          
          return (
            <div key={student.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between transition-all hover:border-orange-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-100 shrink-0">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${student.name}`} alt={student.name} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 leading-tight">{student.name}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{student.id}</p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <button 
                  onClick={() => handleUpdate(student.id, 'Present')}
                  className={`p-2 rounded-xl transition-all ${
                    status === 'Present' 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' 
                      : 'bg-slate-50 text-slate-400 hover:text-emerald-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleUpdate(student.id, 'Late')}
                  className={`p-2 rounded-xl transition-all ${
                    status === 'Late' 
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-200' 
                      : 'bg-slate-50 text-slate-400 hover:text-amber-500'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleUpdate(student.id, 'Absent')}
                  className={`p-2 rounded-xl transition-all ${
                    status === 'Absent' 
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' 
                      : 'bg-slate-50 text-slate-400 hover:text-rose-500'
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="pt-4">
        <button 
          onClick={handleSave}
          className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-slate-200 flex items-center justify-center space-x-2 active:scale-[0.98] transition-all"
        >
          <Save className="w-4 h-4 text-orange-400" />
          <span>Finalize Class Attendance</span>
        </button>
      </div>
    </div>
  );
};
