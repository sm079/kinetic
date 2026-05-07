import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    // Changed min-h-screen to h-screen and overflow-hidden to prevent body scroll
    <div className="h-screen bg-[#0e0e0e] text-white font-body flex flex-col overflow-hidden">
      <div className="fixed top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#f4ffc9]/5 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#00e3fd]/5 rounded-full blur-[150px] pointer-events-none -z-10" />

      <header className="w-full sticky top-0 bg-[#0e0e0e] z-50 flex items-center px-6 py-4">
        <Link to="/" className="text-2xl font-black tracking-tighter text-[#D1FF26] italic font-headline">KINETIC</Link>
      </header>

      {/* Reduced py-12 to py-4 */}
      <main className="flex-1 w-full max-w-7xl mx-auto flex items-center justify-center px-6 py-4">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

          {/* Reduced height from 600px to 500px */}
          <div className="hidden lg:flex flex-col col-span-7 space-y-6">
            <div className="relative group overflow-hidden rounded-xl h-[500px] bg-[#1a1a1a] border border-[#484847]/10">
              <div className="absolute inset-0 bg-gradient-to-br from-[#0e0e0e] via-[#1a1a1a] to-[#0e0e0e]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-transparent to-transparent" />
              <div className="absolute bottom-12 left-12 right-12">
                <h1 className="font-headline text-6xl font-black tracking-tight text-glow mb-4 text-white">
                  IGNITE THE<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f4ffc9] to-[#00e3fd]">DRIVE.</span>
                </h1>
                <p className="text-[#adaaaa] font-medium text-base max-w-md">
                  Your peak performance begins in the dark. Join the elite kinetic collective.
                </p>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5 flex flex-col items-center lg:items-start">
            {/* Reduced p-12 to p-8 or p-10 */}
            <div className="w-full max-w-md bg-[#1a1a1a] p-8 lg:p-10 rounded-xl border border-[#484847]/5 pulse-shadow">
              <div className="mb-6"> {/* Reduced margin-bottom */}
                <h2 className="font-headline text-3xl font-bold tracking-tight mb-2">Welcome Back</h2>
                <p className="text-[#adaaaa] text-sm">Enter your credentials to access your pulse.</p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded bg-[#b92902]/20 border border-[#ff7351]/20 text-[#ff7351] text-sm">
                  {error}
                </div>
              )}

              {/* Reduced space-y-8 to space-y-5 */}
              <form className="space-y-5" onSubmit={handleSubmit}>
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
                    className="w-full bg-[#262626] border-b-2 border-[#484847]/30 focus:border-[#00e3fd] outline-none px-4 py-3 transition-all duration-300 font-medium text-white placeholder:text-[#adaaaa]/30"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#D1FF26] mb-1 font-label">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-[#262626] border-b-2 border-[#484847]/30 focus:border-[#00e3fd] outline-none px-4 py-3 transition-all duration-300 font-medium text-white placeholder:text-[#adaaaa]/30"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full kinetic-gradient py-4 rounded-md text-[#4b5e00] font-black tracking-widest uppercase text-sm hover:opacity-90 active:scale-[0.98] transition-all pulse-shadow disabled:opacity-60"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>

                <div className="flex justify-end">
                  <Link to="/forgot-password" title="Forgot Password" className="text-[10px] font-bold uppercase tracking-widest text-[#adaaaa] hover:text-white transition-colors">
                    Forgot password?
                  </Link>
                </div>
              </form>

              <div className="mt-8 flex flex-col items-center gap-6"> {/* Reduced margin-top */}
                <p className="text-sm text-[#adaaaa]">
                  New here?{' '}
                  <Link to="/register" className="text-[#D1FF26] font-bold hover:underline">
                    Create an account
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
