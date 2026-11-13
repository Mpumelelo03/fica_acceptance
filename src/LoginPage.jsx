import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { apiUrl } from './api';

function getResetTokenFromUrl() {
  if (typeof window === 'undefined') return '';
  const searchParams = new URLSearchParams(window.location.search);
  const queryToken = searchParams.get('token');
  if (queryToken) return queryToken.trim();
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex !== -1) {
    const hashParams = new URLSearchParams(hash.slice(qIndex));
    return (hashParams.get('token') || '').trim();
  }
  return '';
}

function LoginPage({ onLoginSuccess, authStorageError }) {
  const [mode, setMode] = useState(() => (getResetTokenFromUrl() ? 'reset' : 'login'));
  const [resetToken, setResetToken] = useState(() => getResetTokenFromUrl());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requiresCode, setRequiresCode] = useState(false);
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleLocationChange = () => {
      const token = getResetTokenFromUrl();
      if (token) {
        setResetToken(token);
        setMode('reset');
        setError('');
        setStatusMessage('');
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setStatusMessage('');
    if (nextMode === 'login' && resetToken) {
      setResetToken('');
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatusMessage('');
    setIsSubmitting(true);

    try {
      const requestBody = { email, password };
      if (requiresCode) requestBody.totp_code = totpCode.trim();

      const response = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const contentType = response.headers.get('content-type') || '';
      if (!/\bjson\b/i.test(contentType)) {
        throw new Error(
          `Login API returned a non-JSON response (HTTP ${response.status}). Check the API URL and /api/admin/login route.`
        );
      }

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('The login server returned an invalid response.');
      }

      if (result.requires_setup === true) {
        if (typeof result.totp_uri !== 'string' || typeof result.temp_secret !== 'string') {
          throw new Error('The login server did not provide the required authenticator setup details.');
        }
        setSetup({ totpUri: result.totp_uri, tempSecret: result.temp_secret });
        setRequiresCode(true);
        setTotpCode('');
        return;
      }

      if (result.requires_2fa === true) {
        setRequiresCode(true);
        setTotpCode('');
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || 'Unable to sign in. Check your details and try again.');
      }

      if (typeof result.token !== 'string' || !result.token || !result.admin || typeof result.admin !== 'object') {
        throw new Error('The login server response is missing the authentication token or admin details.');
      }

      onLoginSuccess({ token: result.token, admin: result.admin });
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : 'Unable to connect to the login server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatusMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch(apiUrl('/api/admin/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || 'Unable to send reset link. Please try again.');
      }
      setStatusMessage(result.message || 'If an active admin account exists for that email, a password reset link has been sent.');
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : 'Unable to connect to the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatusMessage('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(apiUrl('/api/admin/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: newPassword })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || 'Unable to reset password. The link may have expired.');
      }
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      window.history.replaceState({}, '', window.location.pathname);
      setMode('login');
      setStatusMessage('Password reset successfully. Sign in with your new password.');
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : 'Unable to connect to the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetTwoFactor = () => {
    setRequiresCode(false);
    setSetup(null);
    setTotpCode('');
    setError('');
  };

  const heading = mode === 'forgot'
    ? 'Reset your password'
    : mode === 'reset'
      ? 'Choose a new password'
      : setup
        ? 'Set up authenticator'
        : requiresCode
          ? 'Two-factor verification'
          : 'Verification Portal';

  return (
    <main className="login-shell">
      <div className="login-box">
        <div className="login-brand">
          <div className="mark">EPS</div>
          <h1>{heading}</h1>
          {mode === 'login' && setup && <p>Scan this QR code with your authenticator app.</p>}
          {mode === 'forgot' && <p>Enter your admin email to receive a 15-minute reset link.</p>}
          {mode === 'reset' && <p>Enter a new password of at least 8 characters.</p>}
        </div>

        {mode === 'login' && setup && (
          <div className="authenticator-setup">
            <QRCodeSVG value={setup.totpUri} size={180} level="M" />
            <p>Or enter this setup key manually:</p>
            <code>{setup.tempSecret}</code>
          </div>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotSubmit}>
            <label className="field" aria-label="Email address">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3.5" y="5.5" width="17" height="13" rx="3"></rect>
                <path d="M4.5 7l7.5 6 7.5-6"></path>
              </svg>
              <input
                type="email"
                name="email"
                placeholder="Admin email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <div className="helper-row">
              <span>Reset links expire after 15 minutes</span>
              <button className="text-button" type="button" onClick={() => switchMode('login')}>
                Back to sign in
              </button>
            </div>

            <button className="login-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending link…' : 'Send reset link'}
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetSubmit}>
            <div className="field password-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="4.5" y="10" width="15" height="11" rx="2"></rect>
                <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                name="new_password"
                placeholder="New password (min 8 characters)"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  {showPassword ? (
                    <>
                      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"></path>
                      <circle cx="12" cy="12" r="2.5"></circle>
                    </>
                  ) : (
                    <>
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
                      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.2-2.3 3.2M6.2 6.2C3.8 7.7 2.7 9.8 2.5 12c.4 1.1 1.2 2.2 2.3 3.2A10.6 10.6 0 0 0 12 19c1 0 2-.2 2.9-.5"></path>
                    </>
                  )}
                </svg>
              </button>
            </div>

            <div className="field password-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="4.5" y="10" width="15" height="11" rx="2"></rect>
                <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirm_password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>

            <div className="helper-row">
              <span>Single-use reset link</span>
              <button className="text-button" type="button" onClick={() => switchMode('login')}>
                Back to sign in
              </button>
            </div>

            <button className="login-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Resetting password…' : 'Reset password'}
            </button>
          </form>
        )}

        {mode === 'login' && (
          <form onSubmit={handleSubmit}>
            <label className="field" aria-label="Email address">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3.5" y="5.5" width="17" height="13" rx="3"></rect>
                <path d="M4.5 7l7.5 6 7.5-6"></path>
              </svg>
              <input
                type="email"
                name="email"
                placeholder="Admin email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <div className="field password-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="4.5" y="10" width="15" height="11" rx="2"></rect>
                <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
              </svg>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  {showPassword ? (
                    <>
                      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"></path>
                      <circle cx="12" cy="12" r="2.5"></circle>
                    </>
                  ) : (
                    <>
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
                      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.2-2.3 3.2M6.2 6.2C3.8 7.7 2.7 9.8 2.5 12c.4 1.1 1.2 2.2 2.3 3.2A10.6 10.6 0 0 0 12 19c1 0 2-.2 2.9-.5"></path>
                    </>
                  )}
                </svg>
              </button>
            </div>

            {requiresCode && (
              <label className="field" aria-label="Two factor code">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="7" y="2.5" width="10" height="19" rx="2.5"></rect>
                  <path d="M10 7h4M10 12h4M10 17h3"></path>
                </svg>
                <input
                  type="text"
                  name="totp_code"
                  placeholder="6-digit authenticator code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
                  required
                />
              </label>
            )}

            <div className="helper-row">
              <span>{requiresCode ? 'Enter the code from your authenticator app' : 'Session timeout: 15 minutes'}</span>
              {requiresCode
                ? <button className="text-button" type="button" onClick={resetTwoFactor}>Back</button>
                : <button className="text-button" type="button" onClick={() => switchMode('forgot')}>Forgot password?</button>}
            </div>

            <button className="login-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : requiresCode ? 'Verify & Sign in' : 'Sign in'}
            </button>
          </form>
        )}

        <p className="message" role={error ? 'alert' : 'status'} aria-live="polite">
          {error || statusMessage || (mode === 'forgot'
            ? 'We will email a reset link if your account is active.'
            : mode === 'reset'
              ? 'Choose a strong password you do not use elsewhere.'
              : setup
                ? 'After scanning the code, enter the six-digit code from your authenticator app.'
                : requiresCode
                  ? 'Enter the six-digit code from your authenticator app.'
                  : 'Sign in with your admin email and password.')}
        </p>
        {authStorageError && <p className="dashboard-error" role="alert">{authStorageError}</p>}
      </div>
    </main>
  );
}

export default LoginPage;
