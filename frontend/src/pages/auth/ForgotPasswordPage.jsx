import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPasswordResetRequest, apiPasswordResetConfirm } from '../../lib/api';
import Icon from '../../components/ui/Icon';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequestReset(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiPasswordResetRequest(email);
      setToken(data.token);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await apiPasswordResetConfirm(token, password, confirm);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen bg-[#0e0e0e] text-white font-body flex flex-col overflow-hidden">
      <div className="fixed top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#f4ffc9]/5 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#00e3fd]/5 rounded-full blur-[150px] pointer-events-none -z-10" />

      <header className="w-full bg-[#0e0e0e] z-50 flex justify-between items-center px-6 py-3">
        <Link to="/login" className="text-2xl font-black tracking-tighter text-[#D1FF26] italic font-headline">
          KINETIC
        </Link>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto flex items-center justify-center px-6 py-2">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left: Visual - Reduced height to 450px */}
          <div className="hidden lg:flex flex-col col-span-7 space-y-6">
            <div className="relative overflow-hidden rounded-xl h-[450px] bg-[#1a1a1a] border border-[#484847]/10">
              <div className="absolute inset-0 bg-gradient-to-br from-[#0e0e0e] via-[#1a1a1a] to-[#0e0e0e]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-transparent to-transparent" />
              
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-[#D1FF26]/5 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-[#D1FF26]/10 flex items-center justify-center">
                      <Icon
                        name={step === 3 ? 'lock_open' : 'lock'}
                        className="text-5xl text-[#D1FF26]/40"
                      />
                    </div>
                  </div>
                  {step === 3 && (
                    <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-[#c1ed00] flex items-center justify-center shadow-[0_0_12px_rgba(209,255,38,0.4)]">
                      <Icon name="check" fill className="text-zinc-950 text-sm" />
                    </div>
                  )}
                </div>
              </div>

              <div className="absolute bottom-8 left-10 right-10">
                <h1 className="font-headline text-5xl font-black tracking-tight text-glow mb-2 whitespace-pre-line">
                  {step === 3 ? 'ACCESS\nRESTORED.' : 'RESET YOUR\nACCESS.'}
                </h1>
                <p className="text-[#adaaaa] font-medium text-sm max-w-sm">
                  {step === 1 && 'Enter your email to receive a password reset link.'}
                  {step === 2 && 'Set a new password for your Kinetic account.'}
                  {step === 3 && 'Your password has been updated. Sign in to continue.'}
                </p>
              </div>

              <div className="absolute top-8 left-10 flex items-center gap-2">
                {[1, 2, 3].map(s => (
                  <div
                    key={s}
                    className={`h-1 rounded-full transition-all duration-500 ${
                      s < step ? 'w-6 bg-[#D1FF26]' :
                      s === step ? 'w-10 bg-[#D1FF26]' :
                      'w-6 bg-[#484847]/30'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Form - Reduced padding from p-12 to p-8 */}
          <div className="col-span-12 lg:col-span-5 flex flex-col items-center lg:items-start">
            <div className="w-full max-w-md bg-[#1a1a1a] p-8 lg:p-10 rounded-xl border border-[#484847]/5 pulse-shadow">
              {step === 1 && <StepEmail
                email={email}
                setEmail={setEmail}
                onSubmit={handleRequestReset}
                error={error}
                loading={loading}
              />}

              {step === 2 && <StepNewPassword
                password={password}
                setPassword={setPassword}
                confirm={confirm}
                setConfirm={setConfirm}
                onSubmit={handleConfirmReset}
                error={error}
                loading={loading}
              />}

              {step === 3 && <StepSuccess onLogin={() => navigate('/login')} />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StepEmail({ email, setEmail, onSubmit, error, loading }) {
  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-6 h-6 rounded bg-[#D1FF26]/10 flex items-center justify-center">
            <Icon name="mail" className="text-[#D1FF26] text-xs" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">Step 1 of 2</span>
        </div>
        <h2 className="font-headline text-2xl font-bold tracking-tight mb-1">Forgot Password?</h2>
        <p className="text-[#adaaaa] text-xs">Enter your account email to continue.</p>
      </div>

      {error && <ErrorBanner message={error} />}

      <form className="space-y-6" onSubmit={onSubmit}>
        <div className="space-y-1">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[#D1FF26] mb-1 font-label">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@kinetic.fit"
            required
            autoFocus
            className="w-full bg-[#262626] border-b-2 border-[#484847]/30 focus:border-[#00e3fd] outline-none px-4 py-3 transition-all duration-300 font-medium text-white placeholder:text-[#adaaaa]/30"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full kinetic-gradient py-3.5 rounded-md text-[#4b5e00] font-black tracking-widest uppercase text-xs hover:opacity-90 active:scale-[0.98] transition-all pulse-shadow disabled:opacity-60"
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <p className="mt-6 text-xs text-center text-[#adaaaa]">
        Remembered it?{' '}
        <Link to="/login" className="text-[#D1FF26] font-bold hover:underline">Sign in</Link>
      </p>
    </>
  );
}

function StepNewPassword({ password, setPassword, confirm, setConfirm, onSubmit, error, loading }) {
  const [showPw, setShowPw] = useState(false);
  const strength = getStrength(password);

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-6 h-6 rounded bg-[#D1FF26]/10 flex items-center justify-center">
            <Icon name="lock_reset" className="text-[#D1FF26] text-xs" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#adaaaa]">Step 2 of 2</span>
        </div>
        <h2 className="font-headline text-2xl font-bold tracking-tight mb-1">New Password</h2>
        <p className="text-[#adaaaa] text-xs">Choose a strong password.</p>
      </div>

      {error && <ErrorBanner message={error} />}

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[#D1FF26] font-label">
            New Password
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-[#262626] border-b-2 border-[#484847]/30 focus:border-[#00e3fd] outline-none px-4 py-3 pr-12 transition-all duration-300 font-medium text-white placeholder:text-[#adaaaa]/30"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#adaaaa] hover:text-white"
            >
              <Icon name={showPw ? 'visibility_off' : 'visibility'} className="text-base" />
            </button>
          </div>
          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="flex-1 h-1 rounded-full transition-all duration-300"
                    style={{ background: i < strength.score ? strength.color : '#262626' }}
                  />
                ))}
              </div>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: strength.color }}>
                {strength.label}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[#D1FF26] font-label">
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-[#262626] border-b-2 border-[#484847]/30 focus:border-[#00e3fd] outline-none px-4 py-3 pr-12 transition-all duration-300 font-medium text-white placeholder:text-[#adaaaa]/30"
            />
            {confirm.length > 0 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Icon
                  name={password === confirm ? 'check_circle' : 'cancel'}
                  className="text-base"
                  style={{ color: password === confirm ? '#c1ed00' : '#d53d18' }}
                />
              </div>
            )}
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
          {[
            { label: '8+ chars', met: password.length >= 8 },
            { label: 'Uppercase', met: /[A-Z]/.test(password) },
            { label: 'Lowercase', met: /[a-z]/.test(password) },
            { label: 'One digit', met: /\d/.test(password) },
          ].map(req => (
            <li key={req.label} className="flex items-center gap-1.5">
              <Icon
                name={req.met ? 'check' : 'remove'}
                className="text-[10px]"
                style={{ color: req.met ? '#c1ed00' : '#484847' }}
              />
              <span className={`text-[10px] ${req.met ? 'text-[#adaaaa]' : 'text-zinc-600'}`}>
                {req.label}
              </span>
            </li>
          ))}
        </ul>

        <button
          type="submit"
          disabled={loading || strength.score < 3}
          className="w-full kinetic-gradient py-3.5 rounded-md text-[#4b5e00] font-black tracking-widest uppercase text-xs hover:opacity-90 active:scale-[0.98] transition-all pulse-shadow disabled:opacity-40"
        >
          {loading ? 'Updating...' : 'Set Password'}
        </button>
      </form>
    </>
  );
}

function StepSuccess({ onLogin }) {
  return (
    <div className="flex flex-col items-center text-center py-2">
      <div className="w-16 h-16 rounded-full bg-[#c1ed00]/10 flex items-center justify-center mb-4 shadow-[0_0_24px_rgba(193,237,0,0.15)]">
        <Icon name="check" fill className="text-[#c1ed00] text-3xl" />
      </div>
      <h2 className="font-headline text-2xl font-bold tracking-tight mb-2">All Done!</h2>
      <p className="text-[#adaaaa] text-xs mb-8 max-w-[200px]">
        Your password has been successfully updated.
      </p>
      <button
        onClick={onLogin}
        className="w-full kinetic-gradient py-3.5 rounded-md text-[#4b5e00] font-black tracking-widest uppercase text-xs hover:opacity-90 active:scale-[0.98] transition-all pulse-shadow"
      >
        Sign In
      </button>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="mb-4 p-2.5 rounded bg-[#b92902]/20 border border-[#ff7351]/20 text-[#ff7351] text-[11px] flex items-start gap-2">
      <Icon name="error_outline" className="text-xs mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['#ff7351', '#ffe56b', '#00e3fd', '#c1ed00'];
  return { score, label: labels[score - 1] ?? 'Weak', color: colors[score - 1] ?? '#484847' };
}