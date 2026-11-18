import { ArrowLeft, CalendarDays, Mail, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { FaInstagram } from "react-icons/fa";
import {
  connectGoogle,
  connectInstagram,
  disconnectGoogle,
  disconnectInstagram,
  getAllIntegrations,
} from "@/features/integration";
import { useEffect, useState } from "react";
import { Separator } from "@base-ui/react/separator";

const integrationList = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Send and manage emails through your AI agent.",
    icon: Mail,
    provider: "google",
  },
  {
    id: "googleCalendar",
    name: "Google Calendar",
    description: "Manage calendar events using your AI agent.",
    icon: CalendarDays,
    provider: "google",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Publish images with AI-generated captions and hashtags.",
    icon: FaInstagram,
    provider: "instagram",
  },
];

const Integration = () => {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [connecting, setConnecting] = useState(null);
  const [diconnecting, setDiconnecting] = useState(null);
  const [integrations, setIntegrations] = useState(null);

  const handelConnect = async (id) => {
    setConnecting(id);
    setError("");
    setSuccess("");

    if (id === "google" || id === "googleCalendar") {
      const data = await connectGoogle();
      if (!data.url) {
        throw new Error("Google authorization URL not recived.");
      }
      if (!data.success) {
        setError(data.response.data.message || "Unable to connect integration");
        setConnecting(null);
      }
      window.location.assign(data.url);
      return;
    }

    if (id === "instagram") {
      const data = await connectInstagram();
      if (!data.url) {
        throw new Error("Instagram authorization URL not recived.");
      }
      if (!data.success) {
        setError(data.response.data.message || "Unable to connect integration");
        setConnecting(null);
      }
      window.location.assign(data.url);
      return;
    }
  };

  const handelDisconnect = async (id) => {
    setDiconnecting(true);
    setError("");
    setSuccess("");

    const confirmed = window.confirm(
      `Are you sure you want to disconnect ${id}`,
    );
    if (!confirmed) {
      return;
    }

    if (id === "google" || id === "googleCalendar") {
      const data = await disconnectGoogle();
      setSuccess("Disconnected successfully");
    }

    if (id === "instagram") {
      const data = await disconnectInstagram();
      setSuccess("Disconnected successfully");
    }
  };

  const fetchAllIntegrations = async () => {
    const data = await getAllIntegrations();
    setIntegrations(data.integrations);
  };

  useEffect(() => {
    fetchAllIntegrations();
  }, []);

  return (
    <div className="relative min-h-screen bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]"
      />
      <div className="relative z-10">
        <header className="z-30 flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 ">
            <span className="grid size-8 place-items-center rounded-lg bg-white text-zinc-900 ">
              <Workflow size={17} />
            </span>

            <span className="text-sm font-medium tracking-tight">
              Automate AI
            </span>
          </Link>

          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-white">
            <ArrowLeft size={14} />
            <span>Back to chat</span>
          </Link>
        </header>
        <div className="relative z-10 mx-auto max-w-3xl space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-300/80">
              Settings/Integrations
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Integrations
            </h1>
            <p className="text-sm text-zinc-500">
              Connect your accounts and let AutoMate AI handel tasks for you.
            </p>
          </div>
          <Separator />
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] p-4">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] p-4">
              <p className="text-sm text-emerald-300">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {integrationList.map((item) => {
              const integration = integrations[item.id];
              const connected = Boolean(integration?.connected);
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Integration;
