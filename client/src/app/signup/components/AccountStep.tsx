import { AuthButton } from "@/components/auth/AuthButton";
import { AuthInput } from "@/components/auth/AuthInput";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { ArrowRight } from "lucide-react";
import { useExtracted } from "next-intl";
import Link from "next/link";

interface AccountStepProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  isLoading: boolean;
  onSubmit: () => void;
  setError: (v: string) => void;
}

export function AccountStep({
  email,
  setEmail,
  password,
  setPassword,
  isLoading,
  onSubmit,
  setError,
}: AccountStepProps) {
  const t = useExtracted();

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">{t("Signup")}</h2>
      <div className="space-y-4">
        <SocialButtons onError={setError} callbackURL="/signup?step=2" mode="signup" />
        <AuthInput
          id="email"
          label={t("Email")}
          type="email"
          placeholder="email@example.com"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <AuthInput
          id="password"
          label={t("Password")}
          type="password"
          placeholder="••••••••"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <AuthButton
          isLoading={isLoading}
          loadingText={t("Creating account...")}
          onClick={onSubmit}
          type="button"
          className="mt-6 transition-all duration-300 h-11"
          disabled={isLoading}
        >
          {t("Continue")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </AuthButton>
        <div className="text-center text-sm">
          {t("Already have an account?")}{" "}
          <Link
            href="/login"
            className="underline underline-offset-4 hover:text-emerald-400 transition-colors duration-300"
          >
            {t("Log in")}
          </Link>
        </div>
      </div>
    </div>
  );
}
