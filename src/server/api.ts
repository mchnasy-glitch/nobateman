import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { SmsService } from './smsService';
import { User, Appointment } from '../types';
import { getLocalISODate } from '../lib/utils';

export const apiRouter = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev_only';

const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string };
    (req as any).userId = decoded.id;
    (req as any).userRole = decoded.role;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

apiRouter.post('/auth/admin-login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
  }
  
  const users = await db.getUsers();
  
  // Try to find a matched user in DB (Admin or Receptionist)
  let matchedUser = users.find(u => 
    u.username && 
    u.username.toLowerCase() === username.toLowerCase() && 
    u.password === password &&
    (u.role === 'Admin' || u.role === 'Receptionist')
  );

  // Fallback for default admin if not created
  if (!matchedUser && username === 'admin' && password === 'admin123') {
    let user = users.find(u => u.role === 'Admin');
    if (!user) {
      user = {
        id: uuidv4(),
        phone: '09999999999',
        name: 'مدیر کل سیستم',
        username: 'admin',
        password: 'admin123',
        nationalCode: '0000000000',
        birthDate: '',
        gender: 'other',
        role: 'Admin',
        createdAt: new Date().toISOString()
      };
      await db.addUser(user);
    }
    matchedUser = user;
  }
  
  if (matchedUser) {
    const payload: any = { id: matchedUser.id, role: matchedUser.role };
    if (matchedUser.doctorId) payload.doctorId = matchedUser.doctorId;
    
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: matchedUser });
  }

  // Doctor Login: checks custom credentials or default (doctor{id} / 123)
  const doctors = await db.getDoctors();
  const matchedDoctor = doctors.find(d => {
    const validUsername = (d.username && d.username.toLowerCase() === username.toLowerCase()) || 
                          (`doctor${d.id}`.toLowerCase() === username.toLowerCase()) ||
                          (d.phone && d.phone === username);
    const validPassword = (d.password && d.password === password) || (password === '123');
    return validUsername && validPassword;
  });

  if (matchedDoctor) {
    let user = await db.getUser(matchedDoctor.id);
    if (!user) {
      user = {
        id: matchedDoctor.id,
        phone: matchedDoctor.phone || '09000000000',
        name: matchedDoctor.name,
        nationalCode: matchedDoctor.medicalCouncilNumber || '0000000000',
        birthDate: '',
        gender: 'other',
        role: 'Doctor',
        createdAt: new Date().toISOString()
      };
      await db.addUser(user);
    }
    const token = jwt.sign({ id: user.id, role: user.role, doctorId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user });
  }

  return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
});

apiRouter.post('/auth/login', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'شماره موبایل الزامی است' });
  if (!/^09[0-9]{9}$/.test(phone)) return res.status(400).json({ error: 'شماره موبایل نامعتبر است' });

  const now = Date.now();
  let otpRecord = await db.getOtpRecord(phone);

  if (otpRecord && otpRecord.blockedUntil && otpRecord.blockedUntil > now) {
    const minutesLeft = Math.ceil((otpRecord.blockedUntil - now) / 60000);
    return res.status(429).json({ error: `درخواست بیش از حد. لطفاً ${minutesLeft} دقیقه دیگر تلاش کنید.` });
  }

  // Generate 6-digit OTP
  let code = Math.floor(100000 + Math.random() * 900000).toString();
  const settings = await db.getSettings();
  if (!settings?.smsConfig?.isActive || !process.env.SMS_API_KEY) {
    code = "123456"; // Fallback if SMS is not configured yet
  }
  
  if (!otpRecord) {
    otpRecord = { phone, code, expiresAt: now + 2 * 60 * 1000, requestCount: 1 };
  } else {
    otpRecord.code = code;
    otpRecord.expiresAt = now + 2 * 60 * 1000;
    otpRecord.requestCount += 1;

    if (otpRecord.requestCount > 5) {
      otpRecord.blockedUntil = now + 60 * 60 * 1000; // block for 1 hour
      otpRecord.requestCount = 0;
    }
  }

  await db.setOtpRecord(otpRecord);

  // Fire and forget the SMS sending so it doesn't block the API response
  SmsService.sendOtp(phone, code).catch(err => console.error("Background SMS send error:", err));

  res.json({ message: 'کد تایید ارسال شد' });
});

apiRouter.post('/auth/verify', async (req, res) => {
  const { phone, code, userData } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'اطلاعات ناقص است' });

  const otpRecord = await db.getOtpRecord(phone);
  if (!otpRecord || otpRecord.code !== code) {
    return res.status(400).json({ error: 'کد وارد شده صحیح نیست' });
  }

  if (Date.now() > otpRecord.expiresAt) {
    return res.status(400).json({ error: 'کد تایید منقضی شده است. لطفاً مجدداً درخواست دهید.' });
  }

  let user = await db.getUserByPhone(phone);
  if (!user) {
    if (!userData || !userData.name || !userData.name.trim()) {
      return res.status(400).json({ error: 'User does not exist, provide userData to register', needsRegistration: true });
    }
    user = {
      id: uuidv4(),
      phone,
      name: userData.name.trim(),
      nationalCode: userData.nationalCode || '',
      birthDate: userData.birthDate || '',
      gender: userData.gender || 'other',
      role: 'Patient',
      createdAt: new Date().toISOString()
    };
    await db.addUser(user);
  }

  // Only delete OTP once login or registration has completed successfully
  await db.deleteOtpRecord(phone);

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

apiRouter.get('/me', authMiddleware, async (req, res) => {
  const userId = (req as any).userId;
  const user = await db.getUser(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

apiRouter.put('/me', authMiddleware, async (req, res) => {
  const userId = (req as any).userId;
  await db.updateUser(userId, req.body);
  const updatedUser = await db.getUser(userId);
  res.json(updatedUser);
});

apiRouter.get('/settings', async (req, res) => {
  const settings = await db.getSettings();
  res.json(settings);
});

apiRouter.get('/schedules', async (req, res) => {
  const doctorId = req.query.doctorId as string | undefined;
  const today = getLocalISODate(new Date());
  const schedules = await db.getSchedules(doctorId);
  const activeSchedules = schedules.filter(s => s.date >= today);
  res.json(activeSchedules);
});

apiRouter.get('/doctors', async (req, res) => {
  const doctors = await db.getDoctors();
  res.json(doctors);
});

apiRouter.get('/appointments', authMiddleware, async (req, res) => {
  const userId = (req as any).userId;
  const userRole = (req as any).userRole;
  const apts = await db.getAppointments();
  
  let resultApts = apts;
  if (userRole === 'Doctor') {
    resultApts = apts.filter(a => a.doctorId === userId);
  } else if (userRole !== 'Admin') {
    resultApts = apts.filter(a => a.patientId === userId);
  }
  
  const users = await db.getUsers();
  const mappedApts = resultApts.map(apt => {
    const p = users.find(u => u.id === apt.patientId);
    return { 
      ...apt, 
      patientName: apt.patientName || (p ? p.name : 'بیمار ناشناس'),
      patientPhone: p ? p.phone : '',
      nationalCode: p ? p.nationalCode : ''
    };
  });
  
  res.json(mappedApts);
});

apiRouter.post('/appointments', authMiddleware, async (req, res) => {
  const userId = (req as any).userId;
  const { date, time, doctorId, bookingFor, patientName, patientPhone, nationalCode } = req.body;
  if (!doctorId) return res.status(400).json({ error: 'Doctor ID is required' });
  const apts = await db.getAppointments();
  
  const existing = apts.find(a => a.patientId === userId && a.date === date && a.time === time && a.doctorId === doctorId && a.status !== 'cancelled');
  if (existing) return res.status(400).json({ error: 'You already have an appointment with this doctor at this time' });

  const sched = await db.getScheduleBySlot(date, time, doctorId);
  if (!sched || sched.booked >= sched.capacity) return res.status(400).json({ error: 'Slot is full or unavailable' });

  const dateObj = new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', { calendar: 'persian', year: '2-digit', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' });
  const parts = formatter.formatToParts(dateObj);
  const py = parts.find(p => p.type === 'year')?.value || '00';
  const pm = parts.find(p => p.type === 'month')?.value || '00';
  const pd = parts.find(p => p.type === 'day')?.value || '00';
  
  const prefix = `${pd}${pm}${py}`;
  const docCode = doctorId.length > 2 ? doctorId.slice(-2).toUpperCase() : doctorId.padStart(2, '0').toUpperCase();
  
  const docTodayApts = apts.filter(a => a.doctorId === doctorId && a.date === date);
  let maxSeq = 0;
  docTodayApts.forEach(a => {
    if (a.trackingCode) {
      const parts = a.trackingCode.split('-');
      const seqStr = parts.length > 1 ? parts[parts.length - 1] : a.trackingCode.slice(-2);
      const seqNum = parseInt(seqStr, 10);
      if (!isNaN(seqNum) && seqNum > maxSeq) {
        maxSeq = seqNum;
      }
    }
  });
  
  const seq = (maxSeq + 1).toString().padStart(2, '0');
  const trackingCode = `${docCode}-${prefix}-${seq}`;
  const user = await db.getUser(userId);

  const apt: Appointment = {
    id: uuidv4(),
    patientId: userId,
    doctorId: doctorId,
    patientName: bookingFor === 'others' ? (patientName || 'بیمار ناشناس') : (user?.name || 'بیمار'),
    patientPhone: bookingFor === 'others' ? patientPhone : user?.phone,
    nationalCode: bookingFor === 'others' ? nationalCode : user?.nationalCode,
    date,
    time,
    status: 'upcoming',
    trackingCode,
    createdAt: new Date().toISOString()
  };
  await db.addAppointment(apt);
  
  // Send SMS
  if (user) {
    const settings = await db.getSettings();
    const docDef = await db.getDoctor(doctorId);
    
    if (settings.smsConfig && settings.smsConfig.isActive) {
      const template = settings.smsConfig.templates.bookingSuccess;
      const message = SmsService.fillTemplate(template, {
        patientName: user.name,
        doctorName: docDef?.name || 'پزشک',
        specialty: docDef?.specialty || '',
        date,
        time,
        trackingCode,
        clinicAddress: settings.address || ''
      });
      await SmsService.sendSms(user.phone, message);
    } else {
      // Fallback local simulation if disabled
      console.log(`\n================ SIMULATED SMS ================`);
      console.log(`To: ${user.phone}`);
      console.log(`Message: سلام ${user.name} عزیز، نوبت شما با کد پیگیری ${trackingCode} برای تاریخ ${date} ساعت ${time} با موفقیت ثبت شد.`);
      console.log(`===============================================\n`);
    }
  }

  res.json(apt);
});

apiRouter.patch('/appointments/:id', authMiddleware, async (req, res) => {
  const userId = (req as any).userId;
  const userRole = (req as any).userRole;
  const { status } = req.body;
  
  const aptId = req.params.id;
  const apt = await db.getAppointment(aptId);
  if (!apt) return res.status(404).json({ error: 'Appointment not found' });
  
  if (userRole === 'Doctor' && apt.doctorId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  } else if (userRole === 'Patient' && apt.patientId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  await db.updateAppointment(aptId, { status });
  const updatedApt = await db.getAppointment(aptId);

  // Send Cancel SMS if status becomes cancelled
  if (status === 'cancelled') {
    const user = await db.getUser(apt.patientId);
    if (user) {
      const settings = await db.getSettings();
      if (settings.smsConfig && settings.smsConfig.isActive) {
        const template = settings.smsConfig.templates.cancellation;
        const message = SmsService.fillTemplate(template, {
          patientName: user.name,
          date: apt.date,
          time: apt.time
        });
        await SmsService.sendSms(user.phone, message);
      }
    }
  }

  res.json(updatedApt);
});

apiRouter.post('/appointments/:id/cancel', authMiddleware, async (req, res) => {
  const userId = (req as any).userId;
  const userRole = (req as any).userRole;
  const aptId = req.params.id;
  const apt = await db.getAppointment(aptId);
  if (!apt) return res.status(404).json({ error: 'Appointment not found' });
  
  if (userRole === 'Doctor' && apt.doctorId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  } else if (userRole === 'Patient' && apt.patientId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  await db.updateAppointment(aptId, { status: 'cancelled' });

  // Send Cancel SMS
  const user = await db.getUser(apt.patientId);
  if (user) {
    const settings = await db.getSettings();
    if (settings.smsConfig && settings.smsConfig.isActive) {
      const template = settings.smsConfig.templates.cancellation;
      const message = SmsService.fillTemplate(template, {
        patientName: user.name,
        date: apt.date,
        time: apt.time
      });
      await SmsService.sendSms(user.phone, message);
    }
  }

  res.json({ success: true });
});

// Admin endpoints
apiRouter.get('/admin/stats', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const today = getLocalISODate(new Date());
  const apts = await db.getAppointments();
  const todayApts = apts.filter(a => a.date === today);
  const users = await db.getUsers();
  res.json({
    totalPatients: users.filter(u => u.role === 'Patient').length,
    todayAppointments: todayApts.length,
    upcoming: apts.filter(a => a.status === 'upcoming').length,
    cancelled: apts.filter(a => a.status === 'cancelled').length,
  });
});

apiRouter.put('/admin/appointments/:id/status', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const { status } = req.body;
  const apt = await db.getAppointment(req.params.id);
  if (!apt) return res.status(404).json({ error: 'Not found' });
  
  await db.updateAppointment(apt.id, { status });
  const updatedApt = await db.getAppointment(apt.id);
  res.json(updatedApt);
});

apiRouter.delete('/admin/appointments/:id', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const apt = await db.getAppointment(req.params.id);
  if (!apt) return res.status(404).json({ error: 'Not found' });
  
  await db.deleteAppointment(apt.id);
  res.json({ success: true });
});

apiRouter.post('/admin/settings', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  await db.updateSettings(req.body);
  const settings = await db.getSettings();
  res.json(settings);
});

apiRouter.post('/admin/doctors', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const doctor = req.body;
  if (!doctor.id) doctor.id = String(Date.now());
  if (doctor.isActive === undefined) doctor.isActive = true;
  await db.addDoctor(doctor);
  res.json(doctor);
});

apiRouter.put('/admin/doctors/:id', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  await db.updateDoctor(req.params.id, req.body);
  const updated = await db.getDoctor(req.params.id);
  res.json(updated);
});

apiRouter.delete('/admin/doctors/:id', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  await db.deleteDoctor(req.params.id);
  res.json({ success: true });
});

apiRouter.post('/admin/doctors/:id/generate-schedules', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const schedules = await db.generateDoctorSchedules(req.params.id, req.body);
  res.json({ success: true, count: schedules.length, schedules });
});

// --- Doctor Panel Specific Routes ---
const doctorAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string, doctorId?: string };
    if (decoded.role !== 'Doctor' && decoded.role !== 'Admin' && decoded.role !== 'Receptionist') {
      return res.status(403).json({ error: 'Forbidden: Doctor access only' });
    }
    (req as any).userId = decoded.id;
    (req as any).userRole = decoded.role;
    (req as any).doctorId = decoded.doctorId || decoded.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

apiRouter.get('/doctor/profile', doctorAuthMiddleware, async (req, res) => {
  const doctorId = (req as any).doctorId;
  const doctor = await db.getDoctor(doctorId);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
  res.json(doctor);
});

apiRouter.put('/doctor/profile', doctorAuthMiddleware, async (req, res) => {
  const doctorId = (req as any).doctorId;
  const { name, specialty, description, image, phone, medicalCouncilNumber, visitFee, workingDays, workingHours, slotDuration, password } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (specialty !== undefined) updates.specialty = specialty;
  if (description !== undefined) updates.description = description;
  if (image !== undefined) updates.image = image;
  if (phone !== undefined) updates.phone = phone;
  if (medicalCouncilNumber !== undefined) updates.medicalCouncilNumber = medicalCouncilNumber;
  if (visitFee !== undefined) updates.visitFee = visitFee;
  if (workingDays !== undefined) updates.workingDays = workingDays;
  if (workingHours !== undefined) updates.workingHours = workingHours;
  if (slotDuration !== undefined) updates.slotDuration = slotDuration;
  if (password !== undefined && password.trim()) updates.password = password.trim();

  await db.updateDoctor(doctorId, updates);
  const updated = await db.getDoctor(doctorId);
  res.json(updated);
});

apiRouter.get('/doctor/schedules', doctorAuthMiddleware, async (req, res) => {
  const doctorId = (req as any).doctorId;
  const schedules = await db.getSchedules(doctorId);
  res.json(schedules);
});

apiRouter.post('/doctor/schedules/generate', doctorAuthMiddleware, async (req, res) => {
  const doctorId = (req as any).doctorId;
  const { workingDays, startTime, endTime, slotDuration, daysAhead } = req.body;

  // Also update doctor working preferences
  await db.updateDoctor(doctorId, {
    workingDays,
    workingHours: { start: startTime, end: endTime },
    slotDuration
  });

  const schedules = await db.generateDoctorSchedules(doctorId, {
    workingDays,
    startTime,
    endTime,
    slotDuration,
    daysAhead: daysAhead || 14
  });

  res.json({ success: true, count: schedules.length, schedules });
});

apiRouter.post('/doctor/schedules', doctorAuthMiddleware, async (req, res) => {
  const doctorId = (req as any).doctorId;
  const { date, startTime, endTime, capacity } = req.body;
  if (!date || !startTime) return res.status(400).json({ error: 'Missing date or startTime' });

  const id = `sched_${doctorId}_${date}_${startTime}`;
  const sched = {
    id,
    doctorId,
    date,
    startTime,
    endTime: endTime || startTime,
    capacity: capacity || 1,
    booked: 0
  };

  await db.addSchedule(sched);
  res.json(sched);
});

apiRouter.delete('/doctor/schedules/:id', doctorAuthMiddleware, async (req, res) => {
  const doctorId = (req as any).doctorId;
  const schedId = req.params.id;
  await db.deleteSchedule(schedId);
  res.json({ success: true });
});

apiRouter.get('/doctor/appointments', doctorAuthMiddleware, async (req, res) => {
  const doctorId = (req as any).doctorId;
  const allApts = await db.getAppointments();
  const doctorApts = allApts.filter(a => a.doctorId === doctorId);
  const users = await db.getUsers();

  const mappedApts = doctorApts.map(apt => {
    const p = users.find(u => u.id === apt.patientId);
    return {
      ...apt,
      patientName: apt.patientName || (p ? p.name : 'بیمار ناشناس'),
      patientPhone: p ? p.phone : '',
      nationalCode: p ? p.nationalCode : ''
    };
  });

  mappedApts.sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());
  res.json(mappedApts);
});

apiRouter.patch('/doctor/appointments/:id', doctorAuthMiddleware, async (req, res) => {
  const doctorId = (req as any).doctorId;
  const { status } = req.body;
  const apt = await db.getAppointment(req.params.id);
  if (!apt) return res.status(404).json({ error: 'Appointment not found' });
  if (apt.doctorId !== doctorId && (req as any).userRole !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await db.updateAppointment(apt.id, { status });
  const updatedApt = await db.getAppointment(apt.id);
  res.json(updatedApt);
});


apiRouter.get('/admin/list-admins', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const users = await db.getUsers();
  const admins = users.filter(u => u.role === 'Admin' || u.role === 'Receptionist');
  res.json(admins);
});

apiRouter.delete('/admin/delete-admin/:id', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  
  // Prevent deleting the very first/primary admin if possible, or just allow it
  // Let's just allow it for now, but maybe prevent if they are the only admin.
  const users = await db.getUsers();
  const admins = users.filter(u => u.role === 'Admin');
  if (admins.length === 1 && admins[0].id === id) {
    return res.status(400).json({ error: 'شما نمی‌توانید تنها مدیر کل سیستم را حذف کنید' });
  }

  // Check if trying to delete yourself (optional, but good)
  // if ((req as any).userId === id) ...

  await db.deleteUser(id);
  res.json({ success: true });
});

apiRouter.post('/admin/add-admin', authMiddleware, async (req, res) => {
  if ((req as any).userRole !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, password, role, doctorId, name } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
  
  const users = await db.getUsers();
  const existing = users.find(u => u.username === username);
  if (existing) {
     return res.status(400).json({ error: 'این نام کاربری از قبل وجود دارد' });
  }

  const user: any = {
    id: uuidv4(),
    phone: '',
    name: name || (role === 'Receptionist' ? 'منشی پزشک' : 'مدیر سامانه'),
    username,
    password,
    nationalCode: '0000000000',
    birthDate: '',
    gender: 'other',
    role: role === 'Receptionist' ? 'Receptionist' : 'Admin',
    createdAt: new Date().toISOString()
  };
  
  if (role === 'Receptionist' && doctorId) {
    user.doctorId = doctorId;
  }
  await db.addUser(user);
  res.json({ success: true, user });
});

