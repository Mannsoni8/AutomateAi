import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createPayment, verifyPayment } from "@/features/payment";
import { me } from "@/features/auth";
import { setUserData } from "@/redux/userSlice";
import { useDispatch, useSelector } from "react-redux";
import {
  ArrowLeft,
  Check,
  Crown,
  Loader2,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const plans = [
  {
    id: "starter",
    name: "Starter",
    description: "Try Automate AI and explore the possibilities.",
    price: "Free",
    credits: 100,
    icon: Zap,
    features: [
      "100 free credits",
      "Basic AI chat",
      "Explore AI agents",
      "Standard access",
    ],
    buttonText: "Current Plan",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For developers who want to do more with AI.",
    price: 299,
    credits: 500,
    icon: Crown,
    features: [
      "500 credits",
      "Advanced AI conversations",
      "Access to AI tools",
      "Automate everyday tasks",
      "One-time payment",
    ],
    buttonText: "Get Pro",
    popular: true,
  },
  {
    id: "team",
    name: "Team",
    description: "More credits for demanding AI workflows.",
    price: 799,
    credits: 2000,
    icon: Users,
    features: [
      "2,000 credits",
      "Advanced AI conversations",
      "Access to AI tools",
      "Run complex workflows",
      "One-time payment",
    ],
    buttonText: "Get Team",
  },
];

const Pricing = () => {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const user = useSelector((state) => state.user?.userData);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const currentPlan = "starter";

  const handlePurchase = async (plan) => {
    const planId = typeof plan === "object" ? plan.id : plan;
    if (!planId || planId === "starter") return;

    if (typeof window.Razorpay === "undefined") {
      setErrorMessage(
        "Razorpay checkout SDK is not loaded. Please refresh your page and try again.",
      );
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setLoadingPlan(planId);

    try {
      const orderData = await createPayment(planId);
      const { order, plan: planDetails, key_id } = orderData || {};

      if (!order?.id || !key_id) {
        throw new Error(
          orderData?.message || "Invalid order configuration returned from server.",
        );
      }

      const options = {
        key: key_id,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Automate AI",
        description: `${planDetails?.name || planId} Plan - ${planDetails?.credits || 0} Credits`,
        order_id: order.id,
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
        },
        theme: {
          color: "#7c3aed",
        },
        modal: {
          ondismiss: () => {
            setLoadingPlan(null);
          },
        },
        handler: async (response) => {
          try {
            setLoadingPlan("verifying");
            const verifyRes = await verifyPayment(response);

            // Refresh user credits in Redux store
            try {
              const freshUser = await me();
              if (freshUser) {
                dispatch(setUserData(freshUser));
              }
            } catch (authErr) {
              console.warn("Unable to refresh user profile:", authErr);
            }

            setSuccessMessage(
              `Payment successful! ${verifyRes?.credits ? `New balance: ${verifyRes.credits} credits.` : "Credits added successfully."}`,
            );

            setTimeout(() => {
              navigate("/");
            }, 2000);
          } catch (verifyError) {
            console.error("Payment verification failed:", verifyError);
            setErrorMessage(
              verifyError.response?.data?.message ||
                verifyError.message ||
                "Payment verification failed.",
            );
          } finally {
            setLoadingPlan(null);
          }
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on("payment.failed", (response) => {
        console.error("Razorpay payment failed:", response.error);
        setErrorMessage(
          response.error?.description || "Payment failed. Please try again.",
        );
        setLoadingPlan(null);
      });

      razorpay.open();
    } catch (error) {
      console.error("Failed to initiate payment:", error);
      setErrorMessage(
        error.response?.data?.message ||
          error.message ||
          "Failed to initiate order.",
      );
      setLoadingPlan(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#121317] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)]" />

      <div className="relative z-10">
        <header className="flex h-16 items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-white text-zinc-900">
              <Workflow size={17} />
            </span>
            <span className="text-sm font-medium">Automate AI</span>
          </Link>

          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-white">
            <ArrowLeft size={14} />
            Back to chat
          </Link>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
          <div className="mb-14 text-center">
            <Badge className="mb-5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-zinc-300">
              <Sparkles className="mr-2 size-3.5 text-violet-300" />
              Simple, transparent pricing
            </Badge>

            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Unlock more with{" "}
              <span className="text-violet-300">Automate AI.</span>
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
              Get the credits you need to chat with AI, use powerful tools, and
              automate your everyday tasks.
            </p>

            {user?.credits !== undefined && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-300">
                <Zap size={14} />
                Current Balance:{" "}
                <span className="font-semibold text-white">
                  {user.credits.toLocaleString()} credits
                </span>
              </div>
            )}

            {errorMessage && (
              <div className="mx-auto mt-4 max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="mx-auto mt-4 max-w-md rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {successMessage}
              </div>
            )}
          </div>

          <div className="grid items-stretch gap-6 pt-3 md:grid-cols-3">
            {plans.map((plan) => {
              const Icon = plan.icon;
              const isCurrent = currentPlan === plan.id;
              const isLoading = loadingPlan === plan.id;

              return (
                <div key={plan.id} className="relative flex">
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border-0 bg-white px-4 py-1 text-zinc-900">
                      Most Popular
                    </Badge>
                  )}

                  <Card
                    className={`flex w-full flex-col gap-0 rounded-3xl border py-0 text-white shadow-none transition-all duration-200 ${
                      plan.popular
                        ? "border-violet-400/50 bg-white/[0.07]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20"
                    }`}>
                    <CardHeader className="px-6 pb-5 pt-8">
                      <div
                        className={`mb-5 flex size-11 items-center justify-center rounded-xl ${
                          plan.popular
                            ? "bg-white text-zinc-900"
                            : "border border-white/10 bg-white/[0.06] text-zinc-300"
                        }`}>
                        <Icon className="size-5" />
                      </div>

                      <CardTitle className="text-xl font-semibold text-white">
                        {plan.name}
                      </CardTitle>

                      <CardDescription className="min-h-10 text-sm leading-5 text-zinc-400">
                        {plan.description}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col px-6 pb-7">
                      <div className="mb-6">
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-semibold tracking-tight">
                            {typeof plan.price === "number"
                              ? `₹${plan.price}`
                              : plan.price}
                          </span>

                          {typeof plan.price === "number" && (
                            <span className="text-xs text-zinc-500">
                              / one-time
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-sm text-violet-300">
                          <Zap className="mr-1 inline size-4" />
                          {plan.credits.toLocaleString()} credits
                        </p>
                      </div>

                      <div className="mb-6 h-px bg-white/10" />

                      <p className="mb-4 text-sm font-medium">
                        What's included
                      </p>

                      <ul className="mb-8 flex-1 space-y-4">
                        {plan.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-start gap-3 text-sm text-zinc-400">
                            <Check className="mt-0.5 size-4 shrink-0 text-violet-300" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        type="button"
                        disabled={isCurrent || Boolean(loadingPlan)}
                        onClick={() => handlePurchase(plan)}
                        className={`h-11 w-full gap-2 rounded-xl font-medium ${
                          plan.popular
                            ? "bg-white text-zinc-900 hover:bg-zinc-200"
                            : "bg-white/10 text-white hover:bg-white/15"
                        }`}>
                        {isLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : isCurrent ? (
                          "Current Plan"
                        ) : (
                          plan.buttonText
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>

          <p className="mt-10 text-center text-xs text-zinc-500">
            Simple one-time payments. No recurring subscription.
          </p>
        </main>
      </div>
    </div>
  );
};

export default Pricing;
