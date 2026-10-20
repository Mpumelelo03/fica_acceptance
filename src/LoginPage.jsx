import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requiresCode, setRequiresCode] = useState(false);
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const requestBody = { email, password };
      if (requiresCode) requestBody.totp_code = totpCode.trim();

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
      const loginEndpoint = import.meta.env.DEV || !apiBaseUrl
        ? '/api/admin/login'
        : `${apiBaseUrl}/api/admin/login`;
      const response = await fetch(loginEndpoint, {
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

  const resetTwoFactor = () => {
    setRequiresCode(false);
    setSetup(null);
    setTotpCode('');
    setError('');
  };

  return (
    <main className="login-shell">
      <div className="login-box">
        <div className="login-brand">
          <div className="mark">EPS</div>
          <h1>{setup ? 'Set up authenticator' : requiresCode ? 'Two-factor verification' : 'Verification Portal'}</h1>
          {setup && <p>Scan this QR code with your authenticator app.</p>}
        </div>

        {setup && (
          <div className="authenticator-setup">
            <QRCodeSVG value={setup.totpUri} size={180} level="M" />
            <p>Or enter this setup key manually:</p>
            <code>{setup.tempSecret}</code>
          </div>
        )}

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
              : <a href="#recover">Need help?</a>}
          </div>

          <button className="login-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : requiresCode ? 'Verify & Sign in' : 'Sign in'}
          </button>
        </form>

        <p className="message" role={error ? 'alert' : 'status'} aria-live="polite">
          {error || (setup
            ? 'After scanning the code, enter the six-digit code from your authenticator app.'
            : requiresCode
              ? 'Enter the six-digit code from your authenticator app.'
              : 'Sign in with your admin email and password.')}
        </p>
      </div>
    </main>
  );
}

export default LoginPage;
