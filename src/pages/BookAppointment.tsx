import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Schedule, Settings, Doctor } from '../types';
import { isHoliday } from '@jalali-js/holidays';
import { toPersianNumbers, getLocalISODate } from '../lib/utils';

// Helper to generate the next 14 days
function getNextDays(count = 14) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function BookAppointment() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(1); // 1: Select, 2: Confirm
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/doctors`)
      .then(r => r.json())
      .then((docs: Doctor[]) => {
        if (docs.length > 0) {
          const docId = localStorage.getItem('selectedDoctorId');
          const doc = docs.find(d => d.id === docId);
          setSelectedDoctor(doc || docs[0]);
        }
      });
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/settings`)
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(console.error);
  }, []);useEffect(() => {
    if (selectedDoctor) {
      fetch(`/api/schedules?doctorId=${selectedDoctor.id}`)
        .then(res => res.json())
        .then(data => {
            setSchedules(data);
            const now = new Date();
            const currentDateStr = getLocalISODate(now);
            const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            
            const availableDates = Array.from(new Set(data.map((s: any) => s.date)));
            
            let firstValidDate = availableDates.find((date: any) => {
                if (date > currentDateStr) return true;
                if (date === currentDateStr) {
                    const hasFutureSlots = data.some((s: any) => s.date === date && s.startTime >= currentTimeStr && s.booked < s.capacity);
                    return hasFutureSlots;
                }
                return false;
            });
            
            if (firstValidDate) {
                setSelectedDate(firstValidDate as string);
            }
        })
        .catch(console.error);
    }
  }, [selectedDoctor]);

  const days = getNextDays(14);
  
  const now = new Date();
  const currentDateStr = getLocalISODate(now);
  const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const availableSlotsForDate = schedules.filter(s => {
      if (s.date !== selectedDate) return false;
      if (s.date === currentDateStr && s.startTime < currentTimeStr) return false;
      return true;
  });
  
  const allAvailableDates = Array.from(new Set(schedules.map(s => s.date)));

  const handleBook = async () => {
    if (!selectedDate || !selectedTime) return;
    setLoading(true);
    setError('');
    try {
      const bookingMode = localStorage.getItem('bookingMode');
      const patientName = localStorage.getItem('bookingPatientName');
      const patientPhone = localStorage.getItem('bookingPatientPhone');
      const nationalCode = localStorage.getItem('bookingPatientNationalCode');
      
      const payload = {
        date: selectedDate,
        time: selectedTime,
        doctorId: selectedDoctor.id,
        bookingFor: bookingMode || 'self',
        patientName: patientName || '',
        patientPhone: patientPhone || '',
        nationalCode: nationalCode || ''
      };

      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/appointments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت نوبت');
      
      setSuccess(true);
      setTimeout(() => navigate('/dashboard', { replace: true }), 3000);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };if (success) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white p-6">
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }}
          className="text-emerald-500 mb-6"
        >
          <CheckCircle size={80} strokeWidth={1.5} />
        </motion.div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">ثبت موفق</h2>
        <p className="text-slate-600 text-center font-medium">نوبت شما با موفقیت ثبت شد.</p>
        <p className="text-sm text-slate-500 mt-2 text-center bg-slate-50 p-3 rounded-lg border border-slate-100">
          پیامک تایید حاوی کد پیگیری و اطلاعات نوبت به زودی برای شما ارسال خواهد شد.
        </p>
        <p className="text-xs text-slate-400 mt-6">در حال انتقال به صفحه اصلی...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col bg-slate-50"
    >
      <div className="bg-white px-4 py-4 flex items-center gap-4 sticky top-0 z-10 border-b border-slate-100 shadow-sm">
        <button onClick={() => step === 2 ? setStep(1) : navigate(-1)} className="p-2 -mr-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
          <ChevronRight size={24} />
        </button>
        <div>
          <h1 className="font-bold text-lg text-slate-800">
            {step === 1 ? 'انتخاب زمان نوبت' : 'تایید نوبت'}
          </h1>
          {selectedDoctor && (
            <p className="text-xs text-slate-500 mt-0.5">{selectedDoctor.name} - {selectedDoctor.specialty}</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Date Selection */}
              <div>
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <CalendarIcon size={20} className="text-blue-600" />
                  انتخاب تاریخ
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-6 px-6">
                  {days.map((d, i) => {
                    const dateStr = getLocalISODate(d);
                    const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' });
                    const parts = formatter.formatToParts(d);
                    const pYear = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
                    const pMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10);
                    const pDay = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
                    const isPublicHoliday = isHoliday({ year: pYear, month: pMonth, day: pDay });
                    const isFriday = d.getDay() === 5;
                    const isHolidayDay = isFriday || isPublicHoliday;
                    const isAvailable = !isHolidayDay && allAvailableDates.includes(dateStr);
                    const isSelected = selectedDate === dateStr;
                    
                    const dayName = new Intl.DateTimeFormat('fa-IR', { weekday: 'short' }).format(d);
                    const dayNum = new Intl.DateTimeFormat('fa-IR', { day: 'numeric' }).format(d);
                    const monthName = new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(d);
return (
                      <button
                        key={i}
                        disabled={!isAvailable}
                        onClick={() => { setSelectedDate(dateStr); setSelectedTime(''); }}
                        className={`shrink-0 flex flex-col items-center justify-center w-20 h-24 rounded-2xl border transition-all relative ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200' 
                            : isAvailable 
                              ? 'bg-white border-slate-200 text-slate-700 hover:border-blue-300' 
                              : isHolidayDay
                                ? 'bg-red-50/50 border-red-100 text-red-500/80 cursor-not-allowed'
                                : 'bg-slate-50 border-slate-100 text-slate-400 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-xs mb-1 font-medium">{dayName}</span>
                        <span className="text-2xl font-bold mb-1">{dayNum}</span>
                        <span className="text-xs">{isHolidayDay ? 'تعطیل' : monthName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Selection */}
              {selectedDate && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Clock size={20} className="text-blue-600" />
                    انتخاب ساعت
                  </h3>
                  {availableSlotsForDate.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      {availableSlotsForDate.map(slot => {
                        const isFull = slot.booked >= slot.capacity;
                        const isSelected = selectedTime === slot.startTime;
                        return (
                          <button
                            key={slot.id}
                            disabled={isFull}
                            onClick={() => setSelectedTime(slot.startTime)}
                            className={`py-3 rounded-xl border text-center font-medium transition-colors ${
                              isSelected 
                                ? 'bg-blue-600 border-blue-600 text-white' 
                                : isFull 
                                  ? 'bg-slate-50 border-slate-100 text-slate-400 opacity-50 cursor-not-allowed line-through' 
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                            }`}
                            dir="ltr"
                          >
                            {toPersianNumbers(slot.startTime)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm text-center py-8 bg-slate-100/50 rounded-xl">
                      زمانی برای این تاریخ یافت نشد
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}{step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <span className="text-slate-500">پزشک</span>
                  <span className="font-bold text-slate-800">{selectedDoctor?.name || 'پزشک'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <span className="text-slate-500">بیمار</span>
                  <span className="font-bold text-slate-800">
                    {localStorage.getItem('bookingMode') === 'others' 
                      ? (localStorage.getItem('bookingPatientName') || 'بیمار ناشناس')
                      : user?.name}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <span className="text-slate-500">تاریخ</span>
                  <span className="font-bold text-slate-800">
                    {new Date(selectedDate).toLocaleDateString('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2">
                  <span className="text-slate-500">ساعت</span>
                  <span className="font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg" dir="ltr">
                    {toPersianNumbers(selectedTime)}
                  </span>
                </div>
                {(selectedDoctor?.visitFee || settings?.visitFee) && (
                  <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">مبلغ ویزیت</span>
                      <span className="font-bold text-slate-800">{toPersianNumbers((selectedDoctor?.visitFee || settings?.visitFee).toLocaleString())} تومان</span>
                    </div>
                  </div>
                )}
              </div>
              
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <button 
          disabled={step === 1 ? (!selectedDate || !selectedTime) : loading}
          onClick={() => step === 1 ? setStep(2) : handleBook()}
          className="w-full bg-blue-600 text-white rounded-xl py-4 font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >{step === 1 ? 'ادامه' : loading ? 'درحال ثبت...' : 'تایید نهایی و ثبت نوبت'}
        </button>
      </div>
    </motion.div>
  );
}
