import type { PropsWithChildren } from 'react';
import { AuthProvider } from './auth/AuthContext';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import './i18n';
import { I18nProvider } from './i18n/I18nProvider';

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
