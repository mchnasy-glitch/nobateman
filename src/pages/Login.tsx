import React from "react";
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, ArrowRight, User as UserIcon, Phone, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toEnglishNumbers } from '../lib/utils';
import { Settings } from '../types';

export default function Login() {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Phone, 2: OTP, 3: Register Details
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(120);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    let timer: any;
    if (step === 2 && countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!/^09[0-9]{9}$/.test(phone)) return setError('شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود');
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطا در ارسال پیامک');
      setStep(2);
      setCountdown(120);
      setOtp('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return setError('کد تایید نامعتبر است');
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otp })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (data.needsRegistration) {
          setStep(3);return;
        }
        throw new Error(data.error || 'کد نامعتبر است');
      }
      
      login(data.token, data.user);
      const redirectUrl = localStorage.getItem('redirectAfterLogin') || (data.user.role === 'Admin' ? '/admin' : '/dashboard');
      localStorage.removeItem('redirectAfterLogin');
      navigate(redirectUrl, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return setError('لطفاً نام و نام خانوادگی را وارد کنید');
    setLoading(true);
    setError('');
    try {
      const name = `${firstName.trim()} ${lastName.trim()}`;
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otp, userData: { name } })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت‌نام');
      
      login(data.token, data.user);
      const redirectUrl = localStorage.getItem('redirectAfterLogin') || '/dashboard';
      localStorage.removeItem('redirectAfterLogin');
      navigate(redirectUrl, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 relative">
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-br from-blue-600 to-blue-700 rounded-b-[40px]"></div>
      
      <div className="relative z-10 flex-1 flex flex-col p-6 pt-10">
        <button 
          onClick={() => navigate(-1)} 
          className="absolute top-6 right-6 p-2 bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors backdrop-blur-sm z-20"
        >
          <ArrowRight size={20} />
        </button>
        
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center mt-4 mb-8 text-white"
        >
          <div className="w-20 h-20 rounded-full bg-white text-blue-600 flex items-center justify-center mb-4 shadow-lg overflow-hidden">
            <img src="/logo.png" alt="لوگو" className="w-full h-full object-contain p-2" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.style.display = 'block'; }} />
            <Activity size={36} style={{ display: 'none' }} />
          </div>
          <h1 className="text-2xl font-bold">ورود به سیستم</h1>
          <p className="text-blue-100 text-sm mt-2 font-medium">لطفاً شماره موبایل خود را وارد کنید</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 flex-1 flex flex-col mb-4"
        >
          <div className="flex-1">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.form 
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleSendOtp}
              className="space-y-6"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">شماره موبایل</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Phone size={20} />
                  </div>
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    maxLength={11}
                    onChange={e => setPhone(toEnglishNumbers(e.target.value).replace(/\D/g, ''))}
                    placeholder=""
                    className="block w-full pr-10 pl-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left bg-slate-50 transition-colors"
                  />
                </div>
              </div>
              
              {error && <p className="text-red-500 text-sm">{error}</p>}
              
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-medium hover:bg-blue-700 transition-colors disabled:opacity-70 flex justify-center items-center"
              >
                {loading ? 'درحال ارسال...' : 'دریافت کد تایید'}
              </button>
            </motion.form>
          )}

          {step === 2 && (
            <motion.form 
              key="step2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleVerifyOtp}
              className="space-y-6"
            ><div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">کد تایید پیامک شده</label>
                  <button type="button" onClick={() => {setStep(1); setOtp('');}} className="text-xs text-blue-600 hover:text-blue-700">
                    اصلاح شماره
                  </button>
                </div>
                <input
                  type="text"
                  dir="ltr"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(toEnglishNumbers(e.target.value).replace(/\D/g, ''))}
                  placeholder=""
                  className="block w-full text-center tracking-widest text-xl px-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 transition-colors"
                />
                
                <div className="mt-3 flex justify-between items-center text-sm">
                  {countdown > 0 ? (
                    <span className="text-slate-500 text-xs font-medium">ارسال مجدد کد در {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</span>
                  ) : (
                    <button type="button" onClick={() => handleSendOtp()} className="text-blue-600 font-bold hover:text-blue-700 transition-colors">
                      ارسال مجدد کد
                    </button>
                  )}
                </div>

              </div>

              {error && <p className="text-red-500 text-sm bg-red-50 p-2 rounded-lg">{error}</p>}

              <button 
                type="submit" 
                disabled={loading || otp.length !== 6}
                className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-lg shadow-blue-600/20"
              >
                {loading ? 'درحال بررسی...' : 'تایید و ورود'}
              </button>
            </motion.form>
          )}

          {step === 3 && (
            <motion.form 
              key="step3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleRegister}
              className="space-y-5"
            >
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm mb-6 border border-blue-100">
                شما هنوز ثبت‌نام نکرده‌اید. لطفاً اطلاعات خود را برای ایجاد حساب تکمیل کنید.
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نام</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon size={20} />
                  </div>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder=""
                    className="block w-full pr-10 pl-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نام خانوادگی</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon size={20} />
                  </div>
                  <input
                    type="text"value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder=""
                    className="block w-full pr-10 pl-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 transition-colors"
                  />
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 text-white rounded-xl py-3.5 mt-4 font-medium hover:bg-blue-700 transition-colors disabled:opacity-70 flex justify-center items-center"
              >
                {loading ? 'درحال ثبت...' : 'تکمیل ثبت‌نام'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
        </div>
        
        <div className="mt-8 text-center pb-2">
          <button onClick={() => navigate('/admin-login')} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            ورود پرسنل و مدیریت
          </button>
        </div>
        </motion.div>
      </div>
    </div>
  );
}


