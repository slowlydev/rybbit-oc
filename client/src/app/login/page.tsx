"use client";

import { AuthButton } from "@/components/auth/AuthButton";
import { AuthError } from "@/components/auth/AuthError";
import { AuthInput } from "@/components/auth/AuthInput";
import { SocialButtons } from "@/components/auth/SocialButtons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RybbitTextLogo } from "../../components/RybbitLogo";
import { SpinningGlobe } from "../../components/SpinningGlobe";
import { useSetPageTitle } from "../../hooks/useSetPageTitle";
import { authClient } from "../../lib/auth";
import { useConfigs } from "../../lib/configs";
import { userStore } from "../../lib/userStore";

export default function Page() {
  const { configs, isLoading: isLoadingConfigs } = useConfigs();
  useSetPageTitle("Login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setError("");

    try {
      const { data, error } = await authClient.signIn.email(
        {
          email,
          password,
        },
      );
      if (data?.user) {
        userStore.setState({
          user: data.user,
        });
        router.push("/");
      }

      if (error) {
        setError(error.message);
      }
    } catch (error) {
      setError(String(error));
    }
    setIsLoading(false);
  };

  return (
    <div className="flex h-dvh w-full">
      {/* Left panel - login form */}
      <div className="w-full lg:w-[550px] flex flex-col p-6 lg:p-10">
        {/* Logo at top left */}
        <div className="mb-8">
          <a href="https://rybbit.com" target="_blank" className="inline-block">
            <RybbitTextLogo />
          </a>
        </div>
        <div className="flex-1 flex flex-col justify-center w-full max-w-[550px] mx-auto">
          <h1 className="text-lg text-neutral-600 dark:text-neutral-300 mb-6">Welcome back</h1>
          <div className="flex flex-col gap-4">
            <SocialButtons onError={setError} />
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                <AuthInput
                  id="email"
                  label="Email"
                  type="email"
                  placeholder="example@email.com"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />

                <AuthInput
                  id="password"
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />

                <AuthButton
                  isLoading={isLoading}
                  loadingText="Logging in..."
                  disabled={isLoading}
                >
                  Login
                </AuthButton>

                <AuthError error={error} title="Error Logging In" />
              </div>
            </form>

            {(!configs?.disableSignup || !isLoadingConfigs) && (
              <div className="text-center text-sm">
                Don't have an account?{" "}
                <Link
                  href="/signup"
                  className="underline underline-offset-4 hover:text-emerald-400 transition-colors duration-300"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>

        {
          <div className="text-xs text-muted-foreground mt-8">
            <a
              href="https://rybbit.com"
              target="_blank"
              rel="noopener"
              title="Rybbit - Open Source Privacy-Focused Web Analytics"
            >
              Open source web analytics powered by Rybbit
            </a>
          </div>
        }
      </div>

      {/* Right panel - globe (hidden on mobile/tablet) */}
      <div className="hidden lg:block lg:w-[calc(100%-550px)] relative m-3 rounded-2xl overflow-hidden">
        <SpinningGlobe />
      </div>
    </div>
  );
}
