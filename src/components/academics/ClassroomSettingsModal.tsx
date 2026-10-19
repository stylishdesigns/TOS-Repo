import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Classroom } from '../../types';
import {
  Building2,
  X,
  Plus,
  Users,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Wifi,
  Tv,
  AirVent,
  Sliders,
} from 'lucide-react';

import { useScrollLock } from '../../hooks/useScrollLock';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ClassroomSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { classrooms, addClassroom, updateClassroom, deleteClassroom, addToast } = useApp();
  useScrollLock(isOpen);

  const [editingRoom, setEditingRoom] = useState<Classroom | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    capacity: 40,
    building: 'Main Academic Block',
    features: 'Air Conditioned, Interactive Whiteboard, Projector',
    isAvailable: true,
  });

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const featureList = formData.features
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    if (editingRoom) {
      updateClassroom(editingRoom.id, {
        name: formData.name,
        code: formData.code || formData.name.substring(0, 4).toUpperCase(),
        capacity: Number(formData.capacity) || 30,
        building: formData.building,
        features: featureList,
        isAvailable: formData.isAvailable,
      });
      addToast({
        type: 'success',
        title: 'Classroom Updated',
        description: `${formData.name} settings saved successfully.`,
      });
      setEditingRoom(null);
    } else {
      addClassroom({
        name: formData.name,
        code: formData.code || formData.name.substring(0, 4).toUpperCase(),
        capacity: Number(formData.capacity) || 30,
        building: formData.building,
        features: featureList,
        isAvailable: formData.isAvailable,
      });
      addToast({
        type: 'success',
        title: 'Classroom Added',
        description: `${formData.name} added to school room inventory.`,
      });
      setShowAddForm(false);
    }

    setFormData({
      name: '',
      code: '',
      capacity: 40,
      building: 'Main Academic Block',
      features: 'Air Conditioned, Interactive Whiteboard, Projector',
      isAvailable: true,
    });
  };

  const handleStartEdit = (room: Classroom) => {
    setEditingRoom(room);
    setShowAddForm(true);
    setFormData({
      name: room.name,
      code: room.code,
      capacity: room.capacity,
      building: room.building,
      features: (room.features || []).join(', '),
      isAvailable: room.isAvailable ?? true,
    });
  };

  const handleToggleAvailability = (room: Classroom) => {
    const nextVal = !(room.isAvailable ?? true);
    updateClassroom(room.id, { isAvailable: nextVal });
    addToast({
      type: 'info',
      title: nextVal ? 'Room Activated' : 'Room Under Maintenance',
      description: `${room.name} is now marked as ${nextVal ? 'Available for classes' : 'Under maintenance'}.`,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs overflow-hidden">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 space-y-6 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-orange-50 text-[#EA580C] rounded-xl border border-orange-100">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Classroom & Room Management Settings</h3>
              <p className="text-xs text-slate-500">
                Configure lecture halls, science laboratories, CBT test rooms, and student capacity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action button to reveal add form */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600">
            Current Venues ({classrooms.length})
          </p>
          {!showAddForm && (
            <button
              onClick={() => {
                setEditingRoom(null);
                setFormData({
                  name: '',
                  code: '',
                  capacity: 40,
                  building: 'Main Academic Block',
                  features: '',
                  isAvailable: true,
                });
                setShowAddForm(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Room</span>
            </button>
          )}
        </div>

        {/* Add / Edit Form */}
        {showAddForm && (
          <form
            onSubmit={handleSave}
            className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5 text-xs"
          >
            <div className="flex items-center justify-between font-bold text-slate-900 border-b border-slate-200 pb-2">
              <span>{editingRoom ? 'Edit Room Specifications' : 'New Room Specifications'}</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingRoom(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Room Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physics Demonstration Lab"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:border-orange-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Capacity (Desks) *</label>
                <input
                  type="number"
                  required
                  min={5}
                  max={250}
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:border-orange-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Building / Wing</label>
                <input
                  type="text"
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:border-orange-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
              >
                {editingRoom ? 'Save Room Changes' : 'Create Room'}
              </button>
            </div>
          </form>
        )}

        {/* Classrooms List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
          {classrooms.map((room) => {
            const isAvail = room.isAvailable ?? true;
            return (
              <div
                key={room.id}
                className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2 hover:border-orange-300 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{room.name}</h4>
                    <p className="text-[11px] text-slate-400">{room.building}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-xs text-slate-600">
                  <span className="flex items-center space-x-1 font-semibold text-slate-800">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{room.capacity} Desks Capacity</span>
                  </span>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 text-[11px]">
                  <button
                    onClick={() => handleStartEdit(room)}
                    className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded inline-flex items-center space-x-1 font-medium"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => {
                      if (classrooms.length <= 1) {
                        addToast({
                          type: 'error',
                          title: 'Cannot delete only room',
                          description: 'At least one venue must exist.',
                        });
                        return;
                      }
                      deleteClassroom(room.id);
                      addToast({
                        type: 'info',
                        title: 'Room Removed',
                        description: `${room.name} removed from inventory.`,
                      });
                    }}
                    className="px-2 py-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded inline-flex items-center space-x-1 font-medium"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
};
