import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ToastProvider from './components/ui/Toast';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import HomePage from './pages/home/HomePage';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import PerformanceDashboardPage from './pages/dashboard/PerformanceDashboardPage';
import NutritionDashboardPage from './pages/dashboard/NutritionDashboardPage';
import TrackWorkoutPage from './pages/workout/TrackWorkoutPage';
import WorkoutHistoryPage from './pages/workout/WorkoutHistoryPage';
import WorkoutDetailPage from './pages/workout/WorkoutDetailPage';
import ProgramsListPage from './pages/programs/ProgramsListPage';
import ProgramDetailPage from './pages/programs/ProgramDetailPage';
import CreateProgramPage from './pages/programs/CreateProgramPage';
import AICoachPage from './pages/ai/AICoachPage';
import ProfilePage from './pages/profile/ProfilePage';

function RequireAuth({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <div className="text-[#D1FF26] font-headline font-black text-2xl italic tracking-widest animate-pulse">
          KINETIC
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/" replace />;

  // Once the full profile loads, redirect new users to onboarding.
  // user.onboarding_completed is undefined until apiGetMe resolves, so only
  // redirect when it's explicitly false (not undefined/null).
  if (user?.onboarding_completed === false && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

function PublicOnly({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return children;
  return <Navigate to={user?.onboarding_completed === false ? '/onboarding' : '/dashboard'} replace />;
}

function HomeRoute() {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
      <div className="text-[#D1FF26] font-headline font-black text-2xl italic tracking-widest animate-pulse">
        KINETIC
      </div>
    </div>
  );
  if (isAuthenticated) return <Navigate to={user?.onboarding_completed === false ? '/onboarding' : '/dashboard'} replace />;
  return <HomePage />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
          <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />

          {/* Onboarding — protected but no AppShell */}
          <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />

          {/* Protected — wrapped in AppShell layout */}
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<PerformanceDashboardPage />} />
            <Route path="/track" element={<TrackWorkoutPage />} />
            <Route path="/history" element={<Navigate to="/programs" replace />} />
            <Route path="/history/:id" element={<WorkoutDetailPage />} />
            <Route path="/programs" element={<ProgramsListPage />} />
            <Route path="/programs/new" element={<CreateProgramPage />} />
            <Route path="/programs/:id" element={<ProgramDetailPage />} />
            <Route path="/programs/:id/edit" element={<CreateProgramPage />} />
            <Route path="/nutrition" element={<NutritionDashboardPage />} />
            <Route path="/ai-coach" element={<AICoachPage />} />
            <Route path="/biometrics" element={<Navigate to="/profile" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          {/* Default */}
          <Route path="/" element={<HomeRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
