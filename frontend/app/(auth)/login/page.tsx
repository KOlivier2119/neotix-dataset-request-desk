"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon, EyeOffIcon } from "@hugeicons/core-free-icons";
import { api, ApiError } from "@/lib/api";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        skipAuthRedirect: true,
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      {/* Form side */}
      <section className="order-2 flex w-full flex-col items-center justify-center p-8 md:order-1 md:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1d1d1f] text-xs font-semibold text-white">
              DR
            </div>
            <span className="text-xs font-semibold tracking-[0.18em] text-[#1d1d1f]">
              DATASET REQUEST DESK
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-[#6e6e73]">Use your internal account credentials.</p>

          <div className="mt-6">
            <ErrorBanner message={error} />
          </div>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
            <input
              className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <div className="relative">
              <input
                className="w-full rounded-md border border-black/[0.08] bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-black/20"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6e6e73] transition-colors hover:text-[#1d1d1f]"
              >
                <HugeiconsIcon icon={showPassword ? EyeOffIcon : EyeIcon} size={17} />
              </button>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>

      {/* Image side */}
      <section className="relative order-1 h-48 w-full overflow-hidden md:order-2 md:h-auto md:w-1/2">
        <Image
          src="/robot.jpeg"
          alt="Robot arm"
          fill
          preload
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      </section>
    </main>
  );
}
