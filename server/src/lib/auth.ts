import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { admin, captcha, emailOTP, organization, apiKey } from "better-auth/plugins";
import dotenv from "dotenv";
import { and, asc, eq } from "drizzle-orm";
import pg from "pg";

import { db } from "../db/postgres/postgres.js";
import * as schema from "../db/postgres/schema.js";
import { invitation, member, memberSiteAccess, user } from "../db/postgres/schema.js";
import { DISABLE_SIGNUP, IS_CLOUD } from "./const.js";
import { sendEmail, sendInvitationEmail, sendWelcomeEmail } from "./email/email.js";

dotenv.config();

const pluginList = [
  admin(),
  apiKey(),
  organization({
    allowUserToCreateOrganization: true,
    creatorRole: "owner",
    sendInvitationEmail: async invitationData => {
      const inviteLink = `${process.env.BASE_URL}/invitation?invitationId=${invitationData.invitation.id}&organization=${invitationData.organization.name}&inviterEmail=${invitationData.inviter.user.email}`;
      await sendInvitationEmail(
        invitationData.email,
        invitationData.inviter.user.email,
        invitationData.organization.name,
        inviteLink
      );
    },
    schema: {
      organization: {
        additionalFields: {
          stripeCustomerId: {
            type: "string",
            required: false,
          },
          monthlyEventCount: {
            type: "number",
            required: false,
            defaultValue: 0,
          },
          overMonthlyLimit: {
            type: "boolean",
            required: false,
            defaultValue: false,
          },
          planOverride: {
            type: "string",
            required: false,
          },
        },
      },
    },
  }),
  emailOTP({
    async sendVerificationOTP({ email, otp, type }) {
      let subject, htmlContent;

      if (type === "sign-in") {
        subject = "Your Rybbit Sign-In Code";
        htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0c0c0c; color: #e5e5e5;">
            <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 20px;">Your Sign-In Code</h2>
            <p>Here is your one-time password to sign in to Rybbit:</p>
            <div style="background-color: #1a1a1a; padding: 20px; border-radius: 6px; text-align: center; margin: 20px 0; font-size: 28px; letter-spacing: 4px; font-weight: bold; color: #10b981;">
              ${otp}
            </div>
            <p>This code will expire in 5 minutes.</p>
            <p>If you didn't request this code, you can safely ignore this email.</p>
          </div>
        `;
      } else if (type === "email-verification") {
        subject = "Verify Your Email Address";
        htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0c0c0c; color: #e5e5e5;">
            <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 20px;">Verify Your Email</h2>
            <p>Here is your verification code for Rybbit:</p>
            <div style="background-color: #1a1a1a; padding: 20px; border-radius: 6px; text-align: center; margin: 20px 0; font-size: 28px; letter-spacing: 4px; font-weight: bold; color: #10b981;">
              ${otp}
            </div>
            <p>This code will expire in 5 minutes.</p>
            <p>If you didn't request this code, you can safely ignore this email.</p>
          </div>
        `;
      } else if (type === "forget-password") {
        subject = "Reset Your Password";
        htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0c0c0c; color: #e5e5e5;">
            <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 20px;">Reset Your Password</h2>
            <p>You requested to reset your password for Rybbit. Here is your one-time password:</p>
            <div style="background-color: #1a1a1a; padding: 20px; border-radius: 6px; text-align: center; margin: 20px 0; font-size: 28px; letter-spacing: 4px; font-weight: bold; color: #10b981;">
              ${otp}
            </div>
            <p>This code will expire in 5 minutes.</p>
            <p>If you didn't request this code, you can safely ignore this email.</p>
          </div>
        `;
      }

      if (subject && htmlContent) {
        await sendEmail(email, subject, htmlContent);
      }
    },
  }),
  // Add Cloudflare Turnstile captcha (cloud only)
  ...(IS_CLOUD && process.env.TURNSTILE_SECRET_KEY && process.env.NODE_ENV === "production"
    ? [
        captcha({
          provider: "cloudflare-turnstile",
          secretKey: process.env.TURNSTILE_SECRET_KEY,
        }),
      ]
    : []),
];

export const auth = betterAuth({
  basePath: "/api/auth",
  database: new pg.Pool({
    host: process.env.POSTGRES_HOST || "postgres",
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  }),
  emailAndPassword: {
    enabled: true,
    // Disable email verification for now
    requireEmailVerification: false,
    disableSignUp: DISABLE_SIGNUP,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  user: {
    additionalFields: {
      sendAutoEmailReports: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: true,
      },
    },
    deleteUser: {
      enabled: true,
    },
    changeEmail: {
      enabled: true,
    },
  },
  plugins: pluginList,
  trustedOrigins: ["http://localhost:3002"],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production", // don't mark Secure in dev
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async () => {
          const users = await db.select().from(schema.user).orderBy(asc(user.createdAt));

          // If this is the first user, make them an admin
          if (users.length === 1) {
            await db.update(user).set({ role: "admin" }).where(eq(user.id, users[0].id));
          }
        },
      },
      update: {
        before: async userUpdate => {
          // Security: Prevent role field from being updated via regular update-user endpoint
          // Role changes should only go through the admin setRole endpoint
          if (userUpdate && typeof userUpdate === "object") {
            if ("role" in userUpdate) {
              // Remove role from the update data
              const { role: _, ...dataWithoutRole } = userUpdate;
              return {
                data: dataWithoutRole,
              };
            }
            // Always return the data, even if role wasn't present
            return {
              data: userUpdate,
            };
          }
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async ctx => {
      if (ctx.path.startsWith("/sign-up") && IS_CLOUD) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          sendWelcomeEmail(newSession.user.email, newSession.user.name);
        }
      }

      // Handle invitation acceptance - copy site access from invitation to member
      if (ctx.path === "/organization/accept-invitation") {
        try {
          const body = ctx.body as { invitationId?: string } | null;
          const invitationId = body?.invitationId;

          if (invitationId) {
            // Query the invitation to get site access settings and org/email info
            const invitationRecord = await db
              .select({
                organizationId: invitation.organizationId,
                email: invitation.email,
                hasRestrictedSiteAccess: invitation.hasRestrictedSiteAccess,
                siteIds: invitation.siteIds,
              })
              .from(invitation)
              .where(eq(invitation.id, invitationId))
              .limit(1);

            if (invitationRecord.length > 0) {
              const { organizationId, email, hasRestrictedSiteAccess, siteIds } = invitationRecord[0];

              if (hasRestrictedSiteAccess) {
                // Find the user by email
                const userRecord = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);

                if (userRecord.length > 0) {
                  await db.transaction(async tx => {
                    // Find the member by organizationId + userId
                    const memberRecord = await tx
                      .select({ id: member.id })
                      .from(member)
                      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userRecord[0].id)))
                      .limit(1);

                    if (memberRecord.length > 0) {
                      const memberId = memberRecord[0].id;

                      // Update member with hasRestrictedSiteAccess
                      await tx.update(member).set({ hasRestrictedSiteAccess: true }).where(eq(member.id, memberId));

                      // Insert site access entries
                      const siteIdArray = (siteIds || []) as number[];
                      if (siteIdArray.length > 0) {
                        await tx.insert(memberSiteAccess).values(
                          siteIdArray.map(siteId => ({
                            memberId: memberId,
                            siteId: siteId,
                          }))
                        );
                      }
                    }
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error("Error copying site access from invitation to member:", error);
        }
      }
    }),
  },
});
