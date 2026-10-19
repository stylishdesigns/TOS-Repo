import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string | number;
  label: string;
}

interface ModernSelectProps {
  value: any; // Can be string, number, or array for multiple
  onChange: (value: any) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  label?: string;
  multiple?: boolean;
}

export const ModernSelect: React.FC<ModernSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className = '',
  label,
  multiple = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isSelected = (val: string | number) => {
    if (multiple && Array.isArray(value)) {
      return value.includes(val);
    }
    return value === val;
  };

  const getLabel = () => {
    if (multiple && Array.isArray(value)) {
      if (value.length === 0) return placeholder;
      if (value.length === 1) return options.find(opt => opt.value === value[0])?.label || placeholder;
      return `${value.length} items selected`;
    }
    const selectedOption = options.find(opt => opt.value === value);
    return selectedOption ? selectedOption.label : placeholder;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string | number) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? [...value] : [];
      const index = currentValues.indexOf(optionValue);
      if (index > -1) {
        currentValues.splice(index, 1);
      } else {
        currentValues.push(optionValue);
      }
      onChange(currentValues);
    } else {
      onChange(optionValue);
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none focus:bg-white focus:border-orange-500 transition-all flex items-center justify-between shadow-sm hover:shadow-md active:scale-[0.98]"
      >
        <span className={`truncate mr-2 ${((multiple && Array.isArray(value) && value.length > 0) || (!multiple && value)) ? 'text-slate-900' : 'text-slate-400'}`}>
          {getLabel()}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[100] mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
          <div className="p-1.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm rounded-xl transition-all ${
                  isSelected(option.value)
                    ? 'bg-orange-50 text-[#EA580C] font-black'
                    : 'text-slate-700 hover:bg-slate-50 font-bold'
                }`}
              >
                <span>{option.label}</span>
                {isSelected(option.value) && (
                  <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
