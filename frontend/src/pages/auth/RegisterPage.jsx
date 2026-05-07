import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Defined outside the component so React never unmounts/remounts on re-render
function Field({ label, type = 'text', value, onChange, placeholder, suffix }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-end mb-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-[#D1FF26] font-label">
          {label}
        </label>
        {suffix}
      </div>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        className="w-full bg-[#262626] border-b-2 border-[#484847]/30 focus:border-[#00e3fd] outline-none px-4 py-4 transition-all duration-300 font-medium text-white placeholder:text-[#adaaaa]/30"
      />
    </div>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  const passwordOk = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(form.password);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!passwordOk) {
      setError('Password must be 8+ characters with an uppercase letter, lowercase letter, and digit.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!agree) {
      setError('Please agree to the Terms of Service');
      return;
    }
    setLoading(true);
    try {
      await register(form.email, form.displayName, form.password, form.confirm);
      navigate('/onboarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
  /* Changed min-h-screen to h-screen and added overflow-hidden to prevent body scroll */
  <div className="h-screen bg-[#0e0e0e] text-white font-body flex flex-col overflow-hidden">
    {/* Ambient glows */}
    <div className="fixed top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#f4ffc9]/5 rounded-full blur-[120px] pointer-events-none -z-10" />
    <div className="fixed bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#00e3fd]/5 rounded-full blur-[150px] pointer-events-none -z-10" />

    {/* Reduced header padding */}
    <header className="w-full sticky top-0 bg-[#0e0e0e] z-50 flex items-center px-6 py-4">
      <Link to="/" className="text-2xl font-black tracking-tighter text-[#D1FF26] italic font-headline">KINETIC</Link>
    </header>

    {/* Reduced py-12 to py-2 to save vertical space */}
    <main className="flex-1 w-full max-w-7xl mx-auto flex items-center justify-center px-6 py-2">
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

        {/* Left: Visual — Height reduced to 480px and text shrunk slightly */}
        <div className="hidden lg:flex flex-col col-span-7 space-y-6">
          <div className="relative group overflow-hidden rounded-xl h-[480px] bg-[#1a1a1a] border border-[#484847]/10">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0e0e0e] via-[#1a1a1a] to-[#0e0e0e]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-transparent to-transparent" />
            <div className="absolute bottom-10 left-10 right-10">
              <h1 className="font-headline text-6xl font-black tracking-tight text-glow mb-3 text-white leading-none">
                FUEL THE<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f4ffc9] to-[#00e3fd]">PULSE.</span>
              </h1>
              <p className="text-[#adaaaa] font-medium text-base max-w-md">
                Join the elite community of athletes pushing the boundaries of human performance.
              </p>
            </div>
            {/* Decorative bars hidden or shortened to save space */}
            <div className="absolute top-6 right-8 flex gap-2">
              {[40, 55, 70, 50, 85].map((h, i) => (
                <div key={i} className="w-1.5 bg-[#D1FF26]/20 rounded-full" style={{ height: `${h * 0.7}px` }} />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Register Form — Reduced padding from p-12 to p-6/8 */}
        <div className="col-span-12 lg:col-span-5 flex flex-col items-center lg:items-start">
          <div className="w-full max-w-md bg-[#1a1a1a] p-6 lg:p-8 rounded-xl border border-[#484847]/5 pulse-shadow">
            <div className="mb-6">
              <h2 className="font-headline text-2xl font-bold tracking-tight mb-1">Create Account</h2>
              <p className="text-[#adaaaa] text-xs">Step into the Kinetic ecosystem.</p>
            </div>

            {error && (
              <div className="mb-4 p-2 rounded bg-[#b92902]/20 border border-[#ff7351]/20 text-[#ff7351] text-xs">
                {error}
              </div>
            )}

            {/* Tightened space-y-6 to space-y-4 */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Field
                label="Full Name"
                value={form.displayName}
                onChange={set('displayName')}
                placeholder="Alex Rivera"
              />
              <Field
                label="Email Address"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="name@kinetic.fit"
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  placeholder="••••••••"
                />
                <Field
                  label="Confirm"
                  type="password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  placeholder="••••••••"
                />
              </div>

              {/* Minimized password helper */}
              {form.password && (
                <p className={`text-[9px] font-bold tracking-wider ${passwordOk ? 'text-[#D1FF26]' : 'text-[#adaaaa]'}`}>
                  {passwordOk ? '✓ Requirements met' : '8+ chars · upper · lower · digit'}
                </p>
              )}

              {/* Terms Section */}
              <div className="flex items-start gap-2 pt-0">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agree}
                  onChange={e => setAgree(e.target.checked)}
                  className="mt-1 w-3 h-3 rounded-sm bg-[#262626] border-[#484847] text-[#cefc22] focus:ring-[#cefc22]/50 cursor-pointer flex-shrink-0"
                />
                <label htmlFor="terms" className="text-[10px] text-[#adaaaa] leading-tight cursor-pointer">
                  I agree to the <span className="text-white underline decoration-[#c1ed00]/50">Terms</span> and <span className="text-white underline decoration-[#c1ed00]/50">Privacy Policy</span>.
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full kinetic-gradient py-3.5 rounded-md text-[#4b5e00] font-black tracking-widest uppercase text-xs hover:opacity-90 active:scale-[0.98] transition-all pulse-shadow disabled:opacity-60"
              >
                {loading ? 'Processing...' : 'Get Started'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-[#adaaaa]">
                Already have an account?{' '}
                <Link to="/login" className="text-[#D1FF26] font-bold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>

      </div>
    </main>
  </div>
);
}
