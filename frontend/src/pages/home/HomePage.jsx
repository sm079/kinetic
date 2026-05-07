import { Link } from 'react-router-dom';
import Icon from '../../components/ui/Icon';

const features = [
  {
    icon: 'fitness_center',
    title: 'Smart Workout Tracking',
    desc: 'Log every set, rep, and PR. Auto-detect exercise patterns and watch your strength curve over time.',
  },
  {
    icon: 'psychology',
    title: 'AI Coach, Always On',
    desc: 'Get personalised form cues, programming advice, and recovery insights — powered by your own data.',
  },
  {
    icon: 'restaurant',
    title: 'Nutrition at a Glance',
    desc: 'Hit your macro targets daily. Visual calorie rings and compliance charts keep you honest.',
  },
  {
    icon: 'show_chart',
    title: 'Body Composition Trends',
    desc: 'Track weight, body fat, muscle mass, and measurements with multi-metric trend charts.',
  },
  {
    icon: 'calendar_today',
    title: 'Structured Programs',
    desc: 'Build your own periodised plan or import from the starter library — PPL, 5/3/1, GZCLP, and more.',
  },
  {
    icon: 'download',
    title: 'Your Data, Your Way',
    desc: 'Export workouts, nutrition logs, and biometrics to CSV any time — no lock-in.',
  },
];

const stats = [
  { value: '6', label: 'Core Tracking Modules' },
  { value: '∞', label: 'Workouts You Can Log' },
  { value: '100%', label: 'Privacy-First' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-body overflow-x-hidden">
      {/* Ambient blobs */}
      <div className="fixed top-[-15%] right-[-10%] w-[600px] h-[600px] bg-[#f4ffc9]/5 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[700px] h-[700px] bg-[#00e3fd]/4 rounded-full blur-[160px] pointer-events-none -z-10" />

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 w-full bg-[#0e0e0e]/80 backdrop-blur border-b border-[#484847]/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <span className="text-2xl font-black tracking-tighter text-[#D1FF26] italic font-headline select-none">
            KINETIC
          </span>
          <nav className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-bold text-[#adaaaa] hover:text-white transition-colors px-4 py-2"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="text-sm font-black tracking-widest uppercase px-5 py-2.5 rounded-md kinetic-gradient text-[#4b5e00] hover:opacity-90 active:scale-[0.98] transition-all pulse-shadow"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 bg-[#D1FF26]/10 border border-[#D1FF26]/20 rounded-full px-4 py-1.5 mb-8">
          <span className="w-2 h-2 rounded-full bg-[#D1FF26] animate-pulse" />
          <span className="text-[#D1FF26] text-xs font-bold tracking-widest uppercase font-label">
            Performance tracking, reimagined
          </span>
        </div>

        <h1 className="font-headline font-black text-6xl sm:text-7xl lg:text-8xl tracking-tight leading-none mb-6">
          IGNITE THE
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f4ffc9] to-[#00e3fd]">
            DRIVE.
          </span>
        </h1>

        <p className="text-[#adaaaa] text-lg sm:text-xl max-w-2xl mb-10 leading-relaxed">
          Kinetic is your all-in-one performance hub — workout logging, AI coaching, nutrition tracking, and body composition analytics, all in one dark, fast interface.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <Link
            to="/register"
            className="font-black tracking-widest uppercase text-sm px-8 py-4 rounded-md kinetic-gradient text-[#4b5e00] hover:opacity-90 active:scale-[0.98] transition-all pulse-shadow"
          >
            Start for Free
          </Link>
          <Link
            to="/login"
            className="font-bold text-sm px-8 py-4 rounded-md border border-[#484847]/40 text-[#adaaaa] hover:text-white hover:border-[#484847] transition-all"
          >
            Sign In
          </Link>
        </div>

        {/* Stats row */}
        <div className="mt-20 flex flex-wrap justify-center gap-12">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <span className="font-headline font-black text-4xl text-[#D1FF26]">{s.value}</span>
              <span className="text-[#adaaaa] text-xs uppercase tracking-widest font-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── App preview placeholder ── */}
      <section className="max-w-5xl mx-auto px-6 mb-24">
        <div className="relative rounded-2xl overflow-hidden border border-[#484847]/15 bg-[#141414]">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0e0e0e] z-10" />
          {/* Faux UI chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#484847]/15 bg-[#1a1a1a]">
            <span className="w-3 h-3 rounded-full bg-[#484847]/60" />
            <span className="w-3 h-3 rounded-full bg-[#484847]/60" />
            <span className="w-3 h-3 rounded-full bg-[#484847]/60" />
            <span className="ml-3 text-[#484847] text-xs font-mono">kinetic.fit/dashboard</span>
          </div>
          <div className="grid grid-cols-12 min-h-[320px]">
            {/* Sidebar */}
            <div className="col-span-2 border-r border-[#484847]/15 py-6 px-3 space-y-3 hidden sm:block">
              {['dashboard', 'fitness_center', 'restaurant', 'show_chart', 'psychology', 'person'].map((ic, i) => (
                <div
                  key={ic}
                  className={`flex items-center gap-2 px-2 py-2 rounded-md ${i === 0 ? 'bg-[#D1FF26]/10 text-[#D1FF26]' : 'text-[#484847]'}`}
                >
                  <Icon name={ic} style={{ fontSize: '18px' }} />
                </div>
              ))}
            </div>
            {/* Main area */}
            <div className="col-span-12 sm:col-span-10 p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'This Month', value: '12 Sessions', accent: '#D1FF26' },
                { label: 'Total Volume', value: '48 320 kg', accent: '#00e3fd' },
                { label: 'Current Streak', value: '6 Days', accent: '#f4ffc9' },
                { label: 'Calories Today', value: '2 140 kcal', accent: '#D1FF26' },
                { label: 'Protein', value: '178 g', accent: '#00e3fd' },
                { label: 'Body Weight', value: '82.4 kg', accent: '#f4ffc9' },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-[#1a1a1a] border border-[#484847]/10 rounded-xl p-4 flex flex-col gap-1"
                >
                  <span className="text-[#adaaaa] text-[10px] uppercase tracking-widest font-label">
                    {card.label}
                  </span>
                  <span
                    className="font-headline font-black text-xl"
                    style={{ color: card.accent }}
                  >
                    {card.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-7xl mx-auto px-6 pb-28">
        <div className="text-center mb-14">
          <h2 className="font-headline font-black text-4xl sm:text-5xl tracking-tight mb-4">
            Everything you need,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D1FF26] to-[#00e3fd]">
              nothing you don't.
            </span>
          </h2>
          <p className="text-[#adaaaa] text-base max-w-xl mx-auto">
            Built for athletes who take their training seriously. No subscription tiers, no bloat.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="group bg-[#141414] border border-[#484847]/10 rounded-xl p-6 hover:border-[#D1FF26]/20 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-lg bg-[#D1FF26]/10 flex items-center justify-center mb-4 group-hover:bg-[#D1FF26]/20 transition-colors">
                <Icon name={f.icon} className="text-[#D1FF26]" style={{ fontSize: '20px' }} />
              </div>
              <h3 className="font-headline font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-[#adaaaa] text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-7xl mx-auto px-6 pb-28">
        <div className="relative rounded-2xl overflow-hidden border border-[#484847]/15 bg-[#141414] px-8 py-16 text-center">
          <div className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#D1FF26]/6 rounded-full blur-[100px] pointer-events-none" />
          <h2 className="font-headline font-black text-4xl sm:text-5xl tracking-tight mb-4 relative z-10">
            Ready to go kinetic?
          </h2>
          <p className="text-[#adaaaa] text-base mb-8 max-w-md mx-auto relative z-10">
            Create your free account in 30 seconds. No credit card required.
          </p>
          <Link
            to="/register"
            className="relative z-10 inline-block font-black tracking-widest uppercase text-sm px-10 py-4 rounded-md kinetic-gradient text-[#4b5e00] hover:opacity-90 active:scale-[0.98] transition-all pulse-shadow"
          >
            Create Free Account
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#484847]/10 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xl font-black tracking-tighter text-[#D1FF26] italic font-headline">KINETIC</span>
          <p className="text-[#484847] text-xs">
            © {new Date().getFullYear()} Kinetic. Built for the relentless.
          </p>
          <div className="flex gap-6">
            <Link to="/login" className="text-[#484847] hover:text-[#adaaaa] text-xs transition-colors">
              Sign In
            </Link>
            <Link to="/register" className="text-[#484847] hover:text-[#adaaaa] text-xs transition-colors">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
