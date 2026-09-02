import React from "react";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Shield, Lock, User, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'اطلاعات ورود نامعتبر است');
      }
      
      login(data.token, data.user);
      if (data.user.role === 'Doctor') {
        navigate('/doctor-panel', { replace: true });
      } else {
        navigate('/admin', { replace: true });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col p-6 pt-12 bg-slate-900"
    >
      <button 
        onClick={() => navigate('/login')}
        className="self-start text-slate-400 hover:text-white transition-colors mb-8 flex items-center gap-2 text-sm"
      >
        <ArrowRight size={16} />
        بازگشت به ورود بیماران
      </button>
<div className="flex flex-col items-center mb-10 text-blue-500">
        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-black/20 overflow-hidden">
          <img src="/logo.png" alt="لوگو" className="w-full h-full object-contain p-2" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.style.display = 'block'; }} />
          <Shield size={40} className="text-blue-500" style={{ display: 'none' }} />
        </div>
        <h1 className="text-2xl font-bold text-white">ورود پرسنل و پزشکان</h1>
        <p className="text-slate-400 mt-2 text-sm text-center" style={{display: "none"}}>
          تنها برای پزشکان، پرسنل و مدیران سیستم
        </p>
      </div>

      <div className="flex-1 max-w-sm w-full mx-auto">
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                <User size={20} />
              </div>
              <input
                type="text"
                dir="ltr"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder=""
                className="block w-full pr-10 pl-3 py-3 border-0 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-800 text-white placeholder-slate-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">رمز عبور</label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                <Lock size={20} />
              </div>
              <input
                type="password"
                dir="ltr"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder=""
                className="block w-full pr-10 pl-3 py-3 border-0 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-800 text-white placeholder-slate-600 transition-colors"
              />
            </div>
          </div>
          
          {error && <p className="text-red-400 text-sm text-center bg-red-900/20 py-2 rounded-lg">{error}</p>}
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-bold hover:bg-blue-500 transition-colors disabled:opacity-70 flex justify-center items-center shadow-lg shadow-blue-900/20 mt-8"
          >
            {loading ? 'درحال بررسی...' : 'ورود به پنل'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

