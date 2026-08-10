import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ApiRequestError } from '../api/client';
import { useTranslation } from 'react-i18next';

type Mode = 'login' | 'register';

export default function Login() {
  const { login, verifyTwoFactor, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const from =
    (location.state as { from?: string } | null)?.from ?? '/assistant';

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (result.kind === 'two-factor-required') {
          setTempToken(result.tempToken);
          return;
        }
      } else {
        await register(name, email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(
          err.status === 401
            ? t('auth.loginFailed')
            : err.status === 409
              ? t('auth.registerFailed')
              : err.message,
        );
      } else {
        setError(t('error.networkError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleTwoFactorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tempToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyTwoFactor(tempToken, twoFactorToken);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setError('english_texterrorenglish_text，english_textinput。');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('error.networkError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FF] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#EEF0FA] bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6C63FF] text-white">
            <Sparkles size={24} />
          </div>
          <h1 className="text-xl font-semibold text-[#1A1A2E]">ShopMate AI</h1>
          <p className="text-sm text-[#8B93B5]">{t('topbar.pageSubtitleDefault')}</p>
        </div>

        {!tempToken && (
        <div className="mb-6 flex rounded-lg bg-[#F8F9FF] p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setTempToken(null);
                setTwoFactorToken('');
              }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-white text-[#6C63FF] shadow-sm'
                  : 'text-[#8B93B5] hover:text-[#4A5578]'
              }`}
            >
              {m === 'login' ? t('auth.login') : t('auth.register')}
            </button>
          ))}
        </div>
        )}

        {tempToken ? (
          <form onSubmit={handleTwoFactorSubmit} className="flex flex-col gap-4">
            <div className="rounded-lg border border-[#E3E7FF] bg-[#F8F9FF] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
                <ShieldCheck size={18} className="text-[#6C63FF]" />
                english_text
              </div>
              <p className="text-sm leading-6 text-[#66708F]">
                textinputenglish_text 6 english_text。
              </p>
            </div>

            <div>
              <label
                htmlFor="two-factor-token"
                className="mb-1.5 block text-sm font-medium text-[#4A5578]"
              >
                english_text
              </label>
              <input
                id="two-factor-token"
                type="text"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={twoFactorToken}
                onChange={(e) =>
                  setTwoFactorToken(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="w-full rounded-lg border border-[#EEF0FA] px-3.5 py-3 text-center text-xl font-semibold tracking-[0.35em] text-[#1A1A2E] outline-none transition-colors focus:border-[#6C63FF]"
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>

            {error && (
              <p id="login-error" className="rounded-lg bg-[#FFF0F1] px-3.5 py-2.5 text-sm text-[#FF5A6A]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || twoFactorToken.length !== 6}
              className="mt-2 rounded-lg bg-[#6C63FF] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5B52EE] disabled:opacity-60"
            >
              {submitting ? t('common.loading') : 'english_text'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTempToken(null);
                setTwoFactorToken('');
                setError(null);
              }}
              className="flex items-center justify-center gap-1.5 py-1 text-sm font-medium text-[#66708F] hover:text-[#4A5578]"
            >
              <ArrowLeft size={15} />
              english_text
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-medium text-[#4A5578]"
              >
                {t('auth.name')}
              </label>
              <input
                id="name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#EEF0FA] px-3.5 py-2.5 text-sm text-[#1A1A2E] outline-none transition-colors focus:border-[#6C63FF]"
                placeholder={t('auth.namePlaceholder')}
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-[#4A5578]"
            >
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#EEF0FA] px-3.5 py-2.5 text-sm text-[#1A1A2E] outline-none transition-colors focus:border-[#6C63FF]"
              placeholder={t('auth.emailPlaceholder')}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-[#4A5578]"
            >
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#EEF0FA] px-3.5 py-2.5 text-sm text-[#1A1A2E] outline-none transition-colors focus:border-[#6C63FF]"
              placeholder={t('auth.passwordPlaceholder')}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-[#FFF0F1] px-3.5 py-2.5 text-sm text-[#FF5A6A]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-[#6C63FF] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5B52EE] disabled:opacity-60"
          >
            {submitting
              ? t('common.loading')
              : mode === 'login'
                ? t('auth.loginBtn')
                : t('auth.registerBtn')}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
