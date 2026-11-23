import { useState } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { FcGoogle } from "react-icons/fc";
import { Loader2 } from "lucide-react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/firebase";
import { login } from "@/features/auth.js";
import { useDispatch } from "react-redux";
import { setUserData } from "@/redux/userSlice.js";

export function LoginForm({ className, ...props }) {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handelGoogleLogin = async () => {
    if (loading) return;
    setErrorMsg("");
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();
      const data = await login(token);
      dispatch(setUserData(data?.user || data));
    } catch (error) {
      console.error("Login failed:", error);
      if (error?.code === "auth/cancelled-popup-request") {
        // Ignored: harmless user cancellation / re-click
        return;
      }
      if (error?.code === "auth/popup-closed-by-user") {
        setErrorMsg("Sign-in popup was closed before completion.");
        return;
      }
      if (error?.code === "auth/unauthorized-domain") {
        setErrorMsg(
          "This domain is not authorized in Firebase Console. Please add it to Authentication > Settings > Authorized domains.",
        );
        return;
      }
      setErrorMsg(
        error.response?.data?.message ||
          error.message ||
          "Failed to sign in with Google. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="text-center space-y-3">
          <CardTitle className="text-2xl font-semibold tracking-tight text-white">
            Welcome to Automate AI
          </CardTitle>
          <CardDescription className="text-sm text-zinc-400">
            Sign in to build and manage your AI agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form>
            <FieldGroup>
              {errorMsg && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {errorMsg}
                </div>
              )}
              <Field>
                <Button
                  onClick={handelGoogleLogin}
                  disabled={loading}
                  variant="outline"
                  type="button"
                  className="h-12 w-full rounded-xl border-white/15 bg-white/[0.04] text-sm font-medium text-white transition hover:border-violet-400/50 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-violet-400" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <FcGoogle />
                      Login with Google
                    </>
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
