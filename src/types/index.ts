export type Role = 'Patient' | 'Doctor' | 'Receptionist' | 'Admin';

export interface User {
  id: string;
  name: string;
  phone: string;
  nationalCode: string;
  birthDate: string;
  gender: 'male' | 'female' | 'other';
  role: Role;
  createdAt: string;
  username?: string;
  password?: string;
  doctorId?: string; // For Receptionist role
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  patientName?: string;
  patientPhone?: string;
  nationalCode?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: 'upcoming' | 'completed' | 'cancelled';
  trackingCode: string;
  createdAt: string;
  username?: string;
  password?: string;
  }export interface Schedule {
  id: string;
  doctorId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  capacity: number;
  booked: number;
}

export interface SmsConfig {
  apiKey: string;
  senderNumber: string;
  isActive: boolean;
  templates: {
    otp: string;
    bookingSuccess: string;
    reminderDayBefore: string;
    reminderHoursBefore: string;
    cancellation: string;
  };
}

export interface SmsLog {
  id: string;
  phone: string;
  message: string;
  status: 'success' | 'failed';
  createdAt: string;
  username?: string;
  password?: string;
}export interface OtpRecord {
  phone: string;
  code: string;
  expiresAt: number;
  requestCount: number;
  blockedUntil?: number;
}

export interface Settings {
  doctorName: string;
  
  // ... سایر فیلدها
  visitFee: number; // این خط را اضافه کن


  specialty: string;
  phone: string;
  address: string;
  
  // Platform settings
  cancellationHours?: number; // e.g. 24
  maxBookingDays?: number; // e.g. 30
  onlinePaymentEnabled?: boolean;
  requireAuthForBooking?: boolean;
  
  smsConfig?: SmsConfig;
}

export interface AuthResponse {
  token: string;
  user: User;
}export interface Doctor {8
  id: string;
  name: string;
  specialty: string;
  description: string;
  image: string;
  medicalCouncilNumber?: string;
  phone?: string;
  username?: string;
  password?: string;
  visitFee?: number;
  workingDays?: number[]; // 6: Sat, 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri
  workingHours?: {
    start: string; // "16:00"
    end: string;   // "20:00"
  };
  slotDuration?: number; // minutes per patient e.g. 15, 20, 30
  isActive?: boolean;
}

