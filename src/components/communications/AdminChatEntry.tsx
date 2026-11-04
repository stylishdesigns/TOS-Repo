import React, { useState } from 'react';
import { ChatManager } from './ChatManager';
import { ChatModeToggle, ChatMode } from './ChatSplash';
import { StaffStatusScreen } from '../student-portal/tabs/StatusTab';
import TutorAiScreen from './TutorAiScreen';

/**
 * Admin chat entry: admins reach chat from their sidebar menu (no bottom
 * nav). The section opens on Status with the Status / Chat / Tutor AI toggle
 * at the top to switch between the three.
 */
export const AdminChatEntry: React.FC = () => {
  const [mode, setMode] = useState<ChatMode>('status');
  return (
    <div>
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur px-4 pt-4 pb-3">
        <ChatModeToggle mode={mode} onChange={setMode} />
      </div>
      {mode === 'status' ? <StaffStatusScreen /> : mode === 'tito' ? <TutorAiScreen /> : <ChatManager />}
    </div>
  );
};
