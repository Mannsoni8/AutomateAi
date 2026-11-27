import { useEffect, useState } from "react";
import { cn } from "cn";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import {
  sendPasswordResetEmail,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "@/firebase";
import { login, signin, signup } from "@/features/auth.js";
import { useDispatch } from "react-redux";
import { setUserData } from "@/redux/userSlice.js";

const getFirebaseAuthErrorMessage = (error) => {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password. Please check your credentials and try again.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Please sign in instead.";
    case "auth/weak-password":
      return "Password is too weak. Please use at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a moment and try again.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled in Firebase Console (Authentication > Sign-in method).";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before completion.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized in Firebase Console. Please add it to Authentication > Settings > Authorized domains.";
    default:
      return (
        error?.response?.data?.message ||
        error?.message ||
        "Authentication failed. Please try again."
      );
  }
};

export function LoginForm({ className, initialMode = "signin", ...props }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [mode, setMode] = useState(initialMode); // "signin" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg("");
    setSuccessMsg("");
  }, [initialMode]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrorMsg("");
    setSuccessMsg("");
    setPassword("");
    setConfirmPassword("");
    navigate(nextMode === "signup" ? "/signup" : "/login", { replace: true });
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (loading || googleLoading) return;

    setErrorMsg("");
    setSuccessMsg("");

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail || !password) {
      setErrorMsg("Please enter your email and password.");
      return;
    }

    if (mode === "signup") {
      if (!trimmedName) {
        setErrorMsg("Please enter your full name.");
        return;
      }
      if (password.length < 6) {
        setErrorMsg("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      const data =
        mode === "signup"
          ? await signup({
              name: trimmedName,
              email: trimmedEmail,
              password,
            })
          : await signin({
              email: trimmedEmail,
              password,
            });
      dispatch(setUserData(data?.user || data));
    } catch (error) {
      console.error("Email auth failed:", error);
      setErrorMsg(getFirebaseAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (loading || googleLoading) return;
    setErrorMsg("");
    setSuccessMsg("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg("Enter your email address first to reset your password.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setSuccessMsg(
        `Password reset email sent to ${trimmedEmail}. Check your inbox.`,
      );
    } catch (error) {
      console.error("Password reset failed:", error);
      setErrorMsg(getFirebaseAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (loading || googleLoading) return;
    setErrorMsg("");
    setSuccessMsg("");
    setGoogleLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();
      const data = await login(token);
      dispatch(setUserData(data?.user || data));
    } catch (error) {
      console.error("Google login failed:", error);
      if (error?.code === "auth/cancelled-popup-request") {
        return;
      }
      setErrorMsg(getFirebaseAuthErrorMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  };

  const isSignUp = mode === "signup";
  const anyLoading = loading || googleLoading;

  return (
    <div className={cn("flex flex-col gap-5", className)} {...props}>
      <Card className="border-0 bg-transparent p-0 shadow-none">
        <CardHeader className="space-y-3 p-0 text-center">
          {/* Shadcn-style Segmented Mode Switcher */}
          <div className="mx-auto grid w-full max-w-[260px] grid-cols-2 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              disabled={anyLoading}
              onClick={() => switchMode("signin")}
              className={cn(
                "rounded-lg py-1.5 text-xs font-medium transition-all",
                !isSignUp
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-400 hover:text-white",
              )}>
              Sign In
            </button>
            <button
              type="button"
              disabled={anyLoading}
              onClick={() => switchMode("signup")}
              className={cn(
                "rounded-lg py-1.5 text-xs font-medium transition-all",
                isSignUp
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-400 hover:text-white",
              )}>
              Sign Up
            </button>
          </div>

          <CardTitle className="pt-1 text-2xl font-semibold tracking-tight text-white">
            {isSignUp ? "Create your account" : "Welcome back"}
          </CardTitle>
          <CardDescription className="text-sm text-zinc-400">
            {isSignUp
              ? "Sign up to start building and automating with AI agents."
              : "Sign in to build and manage your AI agents."}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0 pt-6">
          <form onSubmit={handleEmailAuth} noValidate>
            <FieldGroup className="gap-4">
              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  {successMsg}
                </div>
              )}

              {isSignUp && (
                <Field className="gap-2">
                  <Label htmlFor="name" className="text-xs font-medium text-zinc-300">
                    Full Name
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={anyLoading}
                      className="h-11 rounded-xl border-white/15 bg-white/[0.04] pl-10 text-sm text-white placeholder:text-zinc-500 focus-visible:border-violet-400/60 focus-visible:ring-violet-500/20"
                    />
                  </div>
                </Field>
              )}

              <Field className="gap-2">
                <Label htmlFor="email" className="text-xs font-medium text-zinc-300">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={anyLoading}
                    className="h-11 rounded-xl border-white/15 bg-white/[0.04] pl-10 text-sm text-white placeholder:text-zinc-500 focus-visible:border-violet-400/60 focus-visible:ring-violet-500/20"
                  />
                </div>
              </Field>

              <Field className="gap-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-xs font-medium text-zinc-300">
                    Password
                  </Label>
                  {!isSignUp && (
                    <button
                      type="button"
                      disabled={anyLoading}
                      onClick={handleForgotPassword}
                      className="text-xs font-medium text-violet-300 transition hover:text-violet-200 disabled:opacity-50">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    placeholder={isSignUp ? "Min. 6 characters" : "Enter your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={anyLoading}
                    className="h-11 rounded-xl border-white/15 bg-white/[0.04] pl-10 pr-10 text-sm text-white placeholder:text-zinc-500 focus-visible:border-violet-400/60 focus-visible:ring-violet-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {isSignUp && (
                <Field className="gap-2">
                  <Label
                    htmlFor="confirm-password"
                    className="text-xs font-medium text-zinc-300">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={anyLoading}
                      className="h-11 rounded-xl border-white/15 bg-white/[0.04] pl-10 text-sm text-white placeholder:text-zinc-500 focus-visible:border-violet-400/60 focus-visible:ring-violet-500/20"
                    />
                  </div>
                </Field>
              )}

              <Button
                type="submit"
                disabled={anyLoading}
                className="mt-1 h-11 w-full rounded-xl bg-white text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-200 disabled:opacity-50">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isSignUp ? "Creating account..." : "Signing in..."}
                  </>
                ) : isSignUp ? (
                  "Create Account"
                ) : (
                  "Sign In"
                )}
              </Button>

              <div className="relative my-2 flex items-center gap-3">
                <Separator className="flex-1 bg-white/10" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  or continue with
                </span>
                <Separator className="flex-1 bg-white/10" />
              </div>

              <Field>
                <Button
                  onClick={handleGoogleLogin}
                  disabled={anyLoading}
                  variant="outline"
                  type="button"
                  className="h-11 w-full rounded-xl border-white/15 bg-white/[0.04] text-sm font-medium text-white transition hover:border-violet-400/50 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
                  {googleLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-violet-400" />
                      Connecting to Google...
                    </>
                  ) : (
                    <>
                      <FcGoogle className="mr-1 size-5" />
                      Continue with Google
                    </>
                  )}
                </Button>
              </Field>

              <p className="pt-1 text-center text-xs text-zinc-400">
                {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                <button
                  type="button"
                  disabled={anyLoading}
                  onClick={() => switchMode(isSignUp ? "signin" : "signup")}
                  className="font-medium text-violet-300 underline-offset-4 transition hover:text-violet-200 hover:underline disabled:opacity-50">
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </p>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
