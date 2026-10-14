import { useState } from 'react';

function LoginPage({ loginError, onSubmit }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-shell">
      <div className="login-box">
        <div className="login-brand">
          <div className="mark">EPS</div>
          <h1>Verification Portal</h1>
        </div>

        <form onSubmit={onSubmit}>
          <label className="field" aria-label="Email address">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3.5" y="5.5" width="17" height="13" rx="3"></rect>
              <path d="M4.5 7l7.5 6 7.5-6"></path>
            </svg>
            <input type="email" name="email" placeholder="Admin email" autoComplete="email" required />
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

          <label className="field" aria-label="Two factor code">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="7" y="2.5" width="10" height="19" rx="2.5"></rect>
              <path d="M10 7h4M10 12h4M10 17h3"></path>
            </svg>
            <input
              type="text"
              name="twofa"
              placeholder="6-digit authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
            />
          </label>

          <div className="helper-row">
            <span>Session timeout: 15 minutes</span>
            <a href="#recover">Need help?</a>
          </div>

          <button className="login-button" type="submit">Sign in</button>
        </form>

        <p className="message" role="status" aria-live="polite">
          {loginError || 'Demo only: credentials are not verified. Use code 123456.'}
        </p>
      </div>
    </main>
  );
}

export default LoginPage;
