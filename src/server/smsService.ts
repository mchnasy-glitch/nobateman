import axios from 'axios';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

export class SmsService {
  /**
   * Sends an OTP SMS using the sms.ir Verify API.
   */
  static async sendOtp(phone: string, code: string): Promise<boolean> {
    try {
      const settings = await db.getSettings();
      const smsConfig = settings.smsConfig;
      
      const apiKey = process.env.SMS_API_KEY;
      const templateIdStr = process.env.SMS_VERIFY_TEMPLATE_ID || '200509';

      if (!smsConfig || !smsConfig.isActive || !apiKey) {
        console.log(`\n================ SIMULATED OTP SMS ================`);
        console.log(`To: ${phone}`);
        console.log(`CODE: ${code}`);
        console.log(`(SMS is inactive or API Key missing in environment)`);
        console.log(`===================================================\n`);
        return false;
      }

      const templateId = parseInt(templateIdStr, 10);
      if (isNaN(templateId)) {
        throw new Error('Invalid OTP Template ID in environment variables');
      }const response = await axios.post('https://api.sms.ir/v1/send/verify', {
        Mobile: phone,
        TemplateId: templateId,
        Parameters: [
          {
            Name: 'CODE',
            Value: code
          }
        ]
      }, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      const isSuccess = response.data?.status === 1;

      await db.addSmsLog({
        id: uuidv4(),
        phone,
        message: `OTP Code: ${code} (Template: ${templateId})`,
        status: isSuccess ? 'success' : 'failed',
        createdAt: new Date().toISOString()
      });

      return isSuccess;
    } catch (error: any) {
      const statusInfo = error.response ? error.response.status : 'Unknown';
      const responseData = error.response ? JSON.stringify(error.response.data) : error.message;
      
      console.error(`SMS OTP Error [Status: ${statusInfo}]:`, responseData);
      
      await db.addSmsLog({
        id: uuidv4(),phone,
        message: `OTP Code: ${code} (Error: ${statusInfo})`,
        status: 'failed',
        createdAt: new Date().toISOString()
      });
      return false;
    }
  }

  /**
   * Sends a standard SMS using the sms.ir Bulk API.
   */
  static async sendSms(phone: string, message: string): Promise<boolean> {
    try {
      const settings = await db.getSettings();
      const smsConfig = settings.smsConfig;
      const apiKey = process.env.SMS_API_KEY;

      if (!smsConfig || !smsConfig.isActive || !apiKey) {
        return false;
      }

      const response = await axios.post('https://api.sms.ir/v1/send/bulk', {
        lineNumber: smsConfig.senderNumber,
        MessageText: message,
        Receivers: [phone]
      }, {headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      const isSuccess = response.data?.status === 1;

      await db.addSmsLog({
        id: uuidv4(),
        phone,
        message,
        status: isSuccess ? 'success' : 'failed',
        createdAt: new Date().toISOString()
      });

      return isSuccess;
    } catch (error: any) {
      const statusInfo = error.response ? error.response.status : 'Unknown';
      const responseData = error.response ? JSON.stringify(error.response.data) : error.message;
      
      console.error(`Bulk SMS Error [Status: ${statusInfo}]:`, responseData);
      
      await db.addSmsLog({
        id: uuidv4(),
        phone,
        message,
        status: 'failed',
        createdAt: new Date().toISOString()
      });
      return false;
    }
  }static fillTemplate(template: string, data: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }
}

