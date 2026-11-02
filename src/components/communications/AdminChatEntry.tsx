import React, { useState } from 'react';
import { ChatManager } from './ChatManager';
import { ChatModeToggle } from './ChatSplash';
import { StaffStatusScreen } from '../student-portal/tabs/StatusTab';

/**
 * Admin chat entry: admins reach chat from their sidebar menu (no bottom
 * nav). The section opens on Status with the Status/Chat toggle at the top
 * to switch over to chat.
 */
export const AdminChatEntry: React.FC = () => {
  const [mode, setMode] = useState<'status' | 'chat'>('status');
  return (
    <div>
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur px-4 pt-4 pb-2">
        <ChatModeToggle mode={mode} onChange={setMode} />
      </div>
      {mode === 'status' ? <StaffStatusScreen /> : <ChatManager />}
    </div>
  );
};
