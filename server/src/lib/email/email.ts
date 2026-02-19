// All email functions are no-ops — Resend removed for self-hosted fork
import { createServiceLogger } from "../logger/logger.js";
import type { OrganizationReport } from "../../services/weekyReports/weeklyReportTypes.js";
import type { OnboardingTipContent } from "../../services/onboardingTips/onboardingTipsContent.js";
import type { ReengagementContent } from "../../services/reengagement/reengagementContent.js";
import type { OtpEmailType } from "./templates/OtpEmail.js";

const logger = createServiceLogger("email");

export async function sendEmail(email: string, subject: string, html: string) {
  logger.debug("Email sending disabled (no Resend configured)");
}

export async function sendOtpEmail(email: string, otp: string, type: OtpEmailType) {
  logger.debug("OTP email disabled — use password-based auth");
}

export async function sendWelcomeEmail(email: string, name?: string) {}

export async function sendInvitationEmail(
  email: string,
  invitedBy: string,
  organizationName: string,
  inviteLink: string
) {}

export async function sendLimitExceededEmail(
  email: string,
  organizationName: string,
  eventCount: number,
  eventLimit: number
) {}

export async function sendWeeklyReportEmail(
  email: string,
  userName: string,
  organizationReport: OrganizationReport
) {}

export async function addContactToAudience(email: string, firstName?: string): Promise<void> {}

export async function isContactUnsubscribed(email: string): Promise<boolean> {
  return false;
}

export async function unsubscribeContact(email: string): Promise<void> {}

export async function getOrCreateMarketingAudience(): Promise<string> {
  return "";
}

export async function scheduleOnboardingTipEmail(
  email: string,
  userName: string,
  tipContent: OnboardingTipContent,
  scheduledAt: string
): Promise<string | null> {
  return null;
}

export async function cancelScheduledEmail(emailId: string): Promise<void> {}

export async function sendReengagementEmail(
  email: string,
  userName: string,
  content: ReengagementContent,
  siteId: number,
  domain: string
): Promise<void> {}
