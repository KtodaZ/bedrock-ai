"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || loading) return;
    setLoading(true);
    setError(false);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.replace("/");
    } else {
      setError(true);
      setLoading(false);
      setPassword("");
      inputRef.current?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "#07070f" }}
    >
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #2563eb, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-auto px-6">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold mb-4"
            style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
          >
            B
          </div>
          <h1
            className="text-2xl font-bold bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #60a5fa, #f0f0ff)" }}
          >
            Bedrock AI
          </h1>
          <p className="text-white/30 text-sm mt-1">Enter your access code to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div
            className="relative rounded-2xl p-px mb-3"
            style={{
              background: error
                ? "linear-gradient(135deg, rgba(239,68,68,0.6), rgba(239,68,68,0.3))"
                : "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(37,99,235,0.5))",
              transition: "background 0.2s",
            }}
          >
            <div
              className="rounded-2xl flex items-center px-4 py-3.5 gap-3"
              style={{ background: "#0f0f1a" }}
            >
              <svg
                className="flex-shrink-0"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                placeholder="Access code"
                autoComplete="current-password"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{
                  color: "rgba(255,255,255,0.9)",
                  caretColor: "#a78bfa",
                }}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400/80 text-center mb-3">
              Incorrect access code. Try again.
            </p>
          )}

          <button
            type="submit"
            disabled={!password.trim() || loading}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98] cursor-pointer"
            style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
          >
            {loading ? "Verifying..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
