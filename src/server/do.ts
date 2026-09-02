import { isHoliday } from '@jalali-js/holidays';
import { User, Appointment, Schedule, Settings, OtpRecord, SmsLog } from '../types';
import { getLocalISODate } from '../lib/utils';
import { DOCTORS } from '../lib/doctors';
import { db as firestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, addDoc } from './firebase';

const defaultSettings: Settings = {
  doctorName: 'نوبت من',
  specialty: 'سامانه جامع نوبت‌دهی آنلاین',
  phone: '۰۲۱-۸۸۸۸۸۸۸۸',
  address: 'تهران، میدان ونک، برج نگار، طبقه ۵',
  cancellationHours: 24,
  maxBookingDays: 30,
  onlinePaymentEnabled: false,
  requireAuthForBooking: true,
  smsConfig: {
    isActive: false,
    apiKey: '',
    senderNumber: '',
    templates: {
      bookingSuccess: '', otp: '', reminderDayBefore: '', reminderHoursBefore: '',
      
      cancellation: ''
    }
  }
};function seedSchedules(schedules: Schedule[]) {
  if (schedules.length > 0) return schedules;
  const newSchedules: Schedule[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 5) continue;
    const dateStr = getLocalISODate(d);
    
    // Create schedules for each doctor
    for (const doc of DOCTORS) {
      let currentHour = 16;
      let currentMinute = 0;
      while (currentHour < 20) {
        const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
        newSchedules.push({
          id: `sched_${doc.id}_${dateStr}_${timeStr}`,
          doctorId: doc.id,
          date: dateStr,
          startTime: timeStr,
          endTime: timeStr,
          capacity: 1,
          booked: 0,
        });
        currentMinute += 15;
        if (currentMinute >= 60) {
          currentMinute = 0;
          currentHour += 1;}
      }
    }
  }
  return newSchedules;
}

class Database {
  async init() {
    const settingsDoc = await getDoc(doc(firestore, 'system', 'settings'));
    if (!settingsDoc.exists()) {
      await setDoc(doc(firestore, 'system', 'settings'), defaultSettings);
    }
    
    // Seed doctors if empty
    const doctorsSnap = await getDocs(collection(firestore, 'doctors'));
    if (doctorsSnap.empty) {
      await Promise.all(DOCTORS.map(docData => setDoc(doc(firestore, 'doctors', docData.id), docData)));
    }

    const schedulesSnap = await getDocs(collection(firestore, 'schedules'));
    if (schedulesSnap.empty) {
      const newSchedules = seedSchedules([]);
      const chunkSize = 100;
      for (let i = 0; i < newSchedules.length; i += chunkSize) {
        const chunk = newSchedules.slice(i, i + chunkSize);
        await Promise.all(chunk.map(sched => setDoc(doc(firestore, 'schedules', sched.id), sched)));
      }
    }
  }async getDoctors(): Promise<any[]> {
    const snap = await getDocs(collection(firestore, 'doctors'));
    return snap.docs.map(d => d.data());
  }

  async getDoctor(id: string): Promise<any | undefined> {
    const d = await getDoc(doc(firestore, 'doctors', id));
    return d.exists() ? d.data() : undefined;
  }

  async addDoctor(doctor: any) {
    await setDoc(doc(firestore, 'doctors', doctor.id), doctor);
    
    // Seed schedules for new doctor for next 14 days
    const today = new Date();
    const newSchedules: Schedule[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (d.getDay() === 5) continue;
      const dateStr = getLocalISODate(d);
      let currentHour = 16;
      let currentMinute = 0;
      while (currentHour < 20) {
        const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
        newSchedules.push({
          id: `sched_${doctor.id}_${dateStr}_${timeStr}`,
          doctorId: doctor.id,
          date: dateStr,
          startTime: timeStr,
          endTime: timeStr,
          capacity: 1,
          booked: 0,});
        currentMinute += 15;
        if (currentMinute >= 60) {
          currentMinute = 0;
          currentHour += 1;
        }
      }
    }
    for (let i = 0; i < newSchedules.length; i += 100) {
      const chunk = newSchedules.slice(i, i + 100);
      await Promise.all(chunk.map(sched => setDoc(doc(firestore, 'schedules', sched.id), sched)));
    }
  }

  async updateDoctor(id: string, updates: any) {
    await updateDoc(doc(firestore, 'doctors', id), updates);
  }

  async deleteDoctor(id: string) {
    await deleteDoc(doc(firestore, 'doctors', id));
    // Clean up schedules for this doctor
    const q = query(collection(firestore, 'schedules'), where('doctorId', '==', id));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  async getUsers(): Promise<User[]> {
    const snap = await getDocs(collection(firestore, 'users'));
    return snap.docs.map(d => d.data() as User);
  }async getUser(id: string): Promise<User | undefined> {
    const d = await getDoc(doc(firestore, 'users', id));
    return d.exists() ? (d.data() as User) : undefined;
  }
  
  async getUserByPhone(phone: string): Promise<User | undefined> {
    const q = query(collection(firestore, 'users'), where('phone', '==', phone));
    const snap = await getDocs(q);
    return snap.empty ? undefined : (snap.docs[0].data() as User);
  }

  async generateDoctorSchedules(doctorId: string, params: { workingDays?: number[], startTime?: string, endTime?: string, slotDuration?: number, daysAhead?: number }) {
    const workingDays = params.workingDays ?? [6, 0, 1, 2, 3, 4]; // Sat to Wed/Thu (Friday 5 off by default)
    const startTime = params.startTime || '16:00';
    const endTime = params.endTime || '20:00';
    const slotDuration = params.slotDuration || 15;
    const daysAhead = params.daysAhead || 14;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startTotalMinutes = startH * 60 + startM;
    const endTotalMinutes = endH * 60 + endM;

    const today = new Date();
    const newSchedules: Schedule[] = [];

    // Fetch existing schedules for this doctor to avoid overwriting booked slots
    const existingSnap = await getDocs(query(collection(firestore, 'schedules'), where('doctorId', '==', doctorId)));
    const existingSchedules = existingSnap.docs.map(d => d.data() as Schedule);
    const bookedMap = new Map<string, number>();
    existingSchedules.forEach(s => {
      if (s.booked > 0) {
        bookedMap.set(`${s.date}_${s.startTime}`, s.booked);
      }
    });// Delete existing unbooked future schedules for this doctor
    const todayStr = getLocalISODate(today);
    const toDelete = existingSnap.docs.filter(d => {
      const data = d.data() as Schedule;
      return data.date >= todayStr && (data.booked || 0) === 0;
    });
    await Promise.all(toDelete.map(d => deleteDoc(d.ref)));

    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      if (!workingDays.includes(dayOfWeek)) continue;

      const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' });
      const parts = formatter.formatToParts(d);
      const pYear = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
      const pMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10);
      const pDay = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);

      if (isHoliday({ year: pYear, month: pMonth, day: pDay })) {
        continue;
      }

      const dateStr = getLocalISODate(d);
      let currentMinutes = startTotalMinutes;

      while (currentMinutes + slotDuration <= endTotalMinutes) {
        const h = Math.floor(currentMinutes / 60);
        const m = currentMinutes % 60;const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        
        const nextMinutes = currentMinutes + slotDuration;
        const nextH = Math.floor(nextMinutes / 60);
        const nextM = nextMinutes % 60;
        const endTimeStr = `${nextH.toString().padStart(2, '0')}:${nextM.toString().padStart(2, '0')}`;

        const existingBooked = bookedMap.get(`${dateStr}_${timeStr}`) || 0;

        newSchedules.push({
          id: `sched_${doctorId}_${dateStr}_${timeStr}`,
          doctorId,
          date: dateStr,
          startTime: timeStr,
          endTime: endTimeStr,
          capacity: 1,
          booked: existingBooked,
        });

        currentMinutes += slotDuration;
      }
    }

    for (let i = 0; i < newSchedules.length; i += 100) {
      const chunk = newSchedules.slice(i, i + 100);
      await Promise.all(chunk.map(sched => setDoc(doc(firestore, 'schedules', sched.id), sched)));
    }

    return newSchedules;
  }async addSchedule(schedule: Schedule) {
    await setDoc(doc(firestore, 'schedules', schedule.id), schedule);
  }

  async deleteSchedule(scheduleId: string) {
    await deleteDoc(doc(firestore, 'schedules', scheduleId));
  }

  async getAppointments(): Promise<Appointment[]> {
    const snap = await getDocs(collection(firestore, 'appointments'));
    return snap.docs.map(d => d.data() as Appointment);
  }
  
  async getAppointment(id: string): Promise<Appointment | undefined> {
    const d = await getDoc(doc(firestore, 'appointments', id));
    return d.exists() ? (d.data() as Appointment) : undefined;
  }

  async getScheduleBySlot(date: string, time: string, doctorId: string): Promise<Schedule | undefined> {
    const q = query(collection(firestore, 'schedules'), where('date', '==', date), where('startTime', '==', time), where('doctorId', '==', doctorId));
    const snap = await getDocs(q);
    return snap.empty ? undefined : (snap.docs[0].data() as Schedule);
  }
  async getSchedules(doctorId?: string): Promise<Schedule[]> {
    if (doctorId) {
      const q = query(collection(firestore, 'schedules'), where('doctorId', '==', doctorId));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as Schedule);
    }
    const snap = await getDocs(collection(firestore, 'schedules'));
    return snap.docs.map(d => d.data() as Schedule);
  }async getSettings(): Promise<Settings> {
    const d = await getDoc(doc(firestore, 'system', 'settings'));
    return d.exists() ? { ...defaultSettings, ...(d.data() as Settings) } : defaultSettings;
  }

  async addUser(user: User) {
    await setDoc(doc(firestore, 'users', user.id), user);
  }

  async deleteUser(id: string) {
    await deleteDoc(doc(firestore, 'users', id));
  }

  async getOtpRecord(phone: string): Promise<OtpRecord | undefined> {
    const d = await getDoc(doc(firestore, 'otps', phone));
    return d.exists() ? (d.data() as OtpRecord) : undefined;
  }

  async setOtpRecord(record: OtpRecord) {
    await setDoc(doc(firestore, 'otps', record.phone), record);
  }

  async deleteOtpRecord(phone: string) {
    await deleteDoc(doc(firestore, 'otps', phone));
  }

  async addSmsLog(log: SmsLog) {
    await setDoc(doc(firestore, 'smsLogs', log.id), log);
  }async getSmsLogs(): Promise<SmsLog[]> {
    const snap = await getDocs(collection(firestore, 'smsLogs'));
    return snap.docs.map(d => d.data() as SmsLog).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateUser(id: string, updates: Partial<User>) {
    await updateDoc(doc(firestore, 'users', id), updates);
  }

  async addAppointment(apt: Appointment) {
    await setDoc(doc(firestore, 'appointments', apt.id), apt);
    const q = query(collection(firestore, 'schedules'), where('date', '==', apt.date), where('startTime', '==', apt.time), where('doctorId', '==', apt.doctorId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const sched = snap.docs[0].data() as Schedule;
      await updateDoc(doc(firestore, 'schedules', sched.id), { booked: sched.booked + 1 });
    }
  }

  async updateAppointment(id: string, updates: Partial<Appointment>) {
    const apt = await this.getAppointment(id);
    if (!apt) return;
    
    if (updates.status === 'cancelled' && apt.status !== 'cancelled') {
      const q = query(collection(firestore, 'schedules'), where('date', '==', apt.date), where('startTime', '==', apt.time), where('doctorId', '==', apt.doctorId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const sched = snap.docs[0].data() as Schedule;
        if (sched.booked > 0) {
          await updateDoc(doc(firestore, 'schedules', sched.id), { booked: sched.booked - 1 });
        }
      }
    }if (apt.status === 'cancelled' && updates.status !== 'cancelled') {
      const q = query(collection(firestore, 'schedules'), where('date', '==', apt.date), where('startTime', '==', apt.time), where('doctorId', '==', apt.doctorId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const sched = snap.docs[0].data() as Schedule;
        await updateDoc(doc(firestore, 'schedules', sched.id), { booked: sched.booked + 1 });
      }
    }
    await updateDoc(doc(firestore, 'appointments', id), updates);
  }

  async deleteAppointment(id: string) {
    const apt = await this.getAppointment(id);
    if (!apt) return;
    if (apt.status !== 'cancelled') {
      const q = query(collection(firestore, 'schedules'), where('date', '==', apt.date), where('startTime', '==', apt.time), where('doctorId', '==', apt.doctorId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const sched = snap.docs[0].data() as Schedule;
        if (sched.booked > 0) {
          await updateDoc(doc(firestore, 'schedules', sched.id), { booked: sched.booked - 1 });
        }
      }
    }
    await deleteDoc(doc(firestore, 'appointments', id));
  }

  async updateSettings(updates: any) {
    await updateDoc(doc(firestore, 'system', 'settings'), updates);
  }
}export const db = new Database();

