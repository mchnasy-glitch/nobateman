import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Splash from './pages/Splash';
import Login from './pages/Login';
import DoctorProfilePublic from './pages/DoctorProfilePublic';
import Dashboard from './pages/Dashboard';
import BookAppointment from './pages/BookAppointment';
import Appointments from './pages/Appointments';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import DoctorPanel from './pages/DoctorPanel';
import { motion, AnimatePresence } from 'motion/react';

function ProtectedRoute({ children, role }: { children: React.ReactNode, role?: 'Patient' | 'Admin' | 'Doctor' | 'Receptionist' }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="h-screen flex items-center justify-center">درحال بارگذاری...</div>;
  if (!user) {
    if (role === 'Admin' || role === 'Doctor') return <Navigate to="/admin-login" replace />;
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role && !(role === 'Doctor' && user.role === 'Receptionist')) {
    if (user.role === 'Admin') return <Navigate to="/admin" replace />;
    if (user.role === 'Doctor' || user.role === 'Receptionist') return <Navigate to="/doctor-panel" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.divkey={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Routes location={location}>
          <Route path="/" element={<Splash />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/doctor-profile/:id" element={<DoctorProfilePublic />} />
          
          {/* Patient Routes */}
          <Route path="/dashboard" element={<ProtectedRoute role="Patient"><Dashboard /></ProtectedRoute>} />
          <Route path="/book" element={<ProtectedRoute role="Patient"><BookAppointment /></ProtectedRoute>} />
          <Route path="/appointments" element={<ProtectedRoute role="Patient"><Appointments /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute role="Patient"><Profile /></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route path="/admin" element={<ProtectedRoute role="Admin"><AdminDashboard /></ProtectedRoute>} />
          
          {/* Doctor Routes */}
          <Route path="/doctor-panel" element={<ProtectedRoute role="Doctor"><DoctorPanel /></ProtectedRoute>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
      }export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-slate-50 flex justify-center text-slate-900 overflow-x-hidden font-sans">
          <div className="w-full max-w-md bg-white shadow-xl min-h-screen relative flex flex-col">
            <AppRoutes />
          </div>
        </div>
      </Router>
    </AuthProvider>
  );
}

