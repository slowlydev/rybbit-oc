// Twilio removed — unlocked self-hosted fork
import { createServiceLogger } from "./logger/logger.js";

const logger = createServiceLogger("twilio");

export const sendSMS = async (phoneNumber: string, message: string): Promise<{ success: boolean; error?: string }> => {
  logger.info("SMS sending disabled (no Twilio configured)");
  return { success: false, error: "SMS not configured" };
};

export const isSMSConfigured = (): boolean => {
  return false;
};
