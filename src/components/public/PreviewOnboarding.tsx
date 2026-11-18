import React from 'react';
import { FirebaseProvider } from '../../context/FirebaseContext';
import { AppProvider } from '../../context/AppContext';
import { AppWelcomePage } from '../auth/AppWelcomePage';
import { AuthPortal } from '../auth/AuthPortal';
import { StudentSignupFlow } from '../auth/StudentSignupFlow';

// Throwaway design preview of the student onboarding flow: the app welcome
// screen, then the student sign-up and login pages, with dummy branding.
// Nothing on this link signs in or creates anything; the forms are read-only.
const DEMO = {
  centreId: 'bright-minds-academy',
  centreName: 'Bright Minds Academy',
  accent: '#7C3AED',
  logoUrl: '',
  welcomeImageUrl: '/welcome-default.jpg',
};

const PreviewInner: React.FC = () => {
  const [step, setStep] = React.useState<'welcome' | 'signup' | 'login'>('welcome');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  if (step === 'welcome') {
    return (
      <AppWelcomePage
        centreName={DEMO.centreName}
        accent={DEMO.accent}
        logoUrl={DEMO.logoUrl}
        welcomeImageUrl={DEMO.welcomeImageUrl}
        onGetStarted={() => setStep('signup')}
        onLogin={() => setStep('login')}
      />
    );
  }
  if (step === 'signup') {
    return (
      <StudentSignupFlow
        centreName={DEMO.centreName}
        centreId={DEMO.centreId}
        accent={DEMO.accent}
        logoUrl={DEMO.logoUrl}
        previewOnly
        onGoToDashboard={() => setStep('welcome')}
        onBack={() => setStep('welcome')}
        onSwitchToLogin={() => setStep('login')}
      />
    );
  }
  return (
    <AuthPortal
      portalType="student"
      title={DEMO.centreName}
      subtitle=""
      accent={DEMO.accent}
      logoUrl={DEMO.logoUrl}
      entryMode="login"
      onSuccess={() => {}}
      onBack={() => setStep('welcome')}
      centreId={DEMO.centreId}
      previewOnly
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
    />
  );
};

export const PreviewOnboarding: React.FC = () => (
  <FirebaseProvider>
    <AppProvider>
      <PreviewInner />
    </AppProvider>
  </FirebaseProvider>
);
