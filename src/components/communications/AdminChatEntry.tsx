import React, { useState } from 'react';
import { ChatManager } from './ChatManager';
import { ChatSplash } from './ChatSplash';
import { StaffStatusScreen } from '../student-portal/tabs/StatusTab';

/**
 * Admin chat entry: admins reach chat from their sidebar menu (no bottom
 * nav), and the same bottom splash tutors get opens first with Status and
 * Chat. Leaving the section and coming back shows the splash again.
 */
export const AdminChatEntry: React.FC = () => {
  const [mode, setMode] = useState<'choose' | 'status' | 'chat'>('choose');
  if (mode === 'status') return <StaffStatusScreen />;
  if (mode === 'chat') return <ChatManager />;
  return (
    <ChatSplash
      onStatus={() => setMode('status')}
      onChat={() => setMode('chat')}
      onClose={() => setMode('chat')}
    />
  );
};
