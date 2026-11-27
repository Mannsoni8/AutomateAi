import {
  ArrowUp,
  Bot,
  Calendar,
  Camera,
  Check,
  Coins,
  ImagePlus,
  Loader2,
  LogOut,
  Mail,
  PanelLeft,
  Plus,
  Settings2,
  SquarePen,
  Trash2,
  UserRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDispatch, useSelector } from "react-redux";
import { useState, useRef, useEffect } from "react";
import { logout, me } from "@/features/auth";
import { setUserData } from "@/redux/userSlice";
import { setSelectedAgent } from "@/redux/agentSlice";
import { Textarea } from "@/components/ui/textarea";
import { agentChat, chat, resumeChat } from "@/features/chat";
import { ChatSidebar } from "@/components/ChatSidebar";

const getStoredChats = (userId) => {
  try {
    const key = `automate_ai_chats_${userId || "guest"}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredChats = (userId, chatsList) => {
  try {
    const key = `automate_ai_chats_${userId || "guest"}`;
    localStorage.setItem(key, JSON.stringify(chatsList));
  } catch (err) {
    console.warn("Could not save chats to localStorage:", err);
  }
};

const hideScrollbar =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const darkPanel =
  "border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl";

const menuContent =
  "rounded-2xl border border-white/10 bg-[#1d2026]/95 p-1.5 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-xl";

const menuSeparator = "bg-white/10";

const iconBtn =
  "size-9 rounded-xl border border-white/10 bg-white/[0.05] p-0 text-zinc-300 hover:bg-white/10 hover:text-white";

const HomePage = () => {
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);

  const [approvingIndex, setApprovingIndex] = useState(null);
  const [rejectingIndex, setRejectingIndex] = useState(null);
  const [chatSessionId, setChatSessionId] = useState(() =>
    Date.now().toString(),
  );

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 768;
    }
    return true;
  });
  const [chats, setChats] = useState([]);

  const { userData } = useSelector((state) => state.user || {});
  const { agents = [], selectedAgent } = useSelector(
    (state) => state.agent || {},
  );

  const dispatch = useDispatch();
  const messagesEndRef = useRef(null);

  const fileinputRef = useRef(null);

  useEffect(() => {
    const loaded = getStoredChats(userData?._id);
    setChats(loaded);
  }, [userData?._id]);

  useEffect(() => {
    if (!messages || messages.length === 0) return;

    setChats((prevChats) => {
      const existingIndex = prevChats.findIndex((c) => c.id === chatSessionId);
      const firstUserMsg =
        messages.find((m) => m.role === "user")?.content ||
        (selectedAgent ? "Agent Task" : "New Chat");
      const title =
        firstUserMsg.length > 36
          ? firstUserMsg.slice(0, 36).trim() + "..."
          : firstUserMsg;

      let updated;
      if (existingIndex >= 0) {
        updated = [...prevChats];
        updated[existingIndex] = {
          ...updated[existingIndex],
          messages,
          title: prevChats[existingIndex].title || title,
          updatedAt: Date.now(),
        };
      } else {
        const newChat = {
          id: chatSessionId,
          title,
          agentId: selectedAgent || null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages,
        };
        updated = [newChat, ...prevChats];
      }

      saveStoredChats(userData?._id, updated);
      return updated;
    });
  }, [messages, chatSessionId, selectedAgent, userData?._id]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      dispatch(setUserData(null));
      setLogoutLoading(false);
    }
  };

  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const isSafeHttpsUrl = (url) =>
    typeof url === "string" && /^https:\/\//i.test(url);

  const handerSelectImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Please select a valid JPEG, PNG, or WebP image.",
        },
      ]);
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Image size must be 5 MB or less.",
        },
      ]);
      return;
    }

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(file);
    setUploadedImage(null);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearSelectedImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(null);
    setImagePreview("");
    setUploadedImage(null);
    if (fileinputRef.current) fileinputRef.current.value = "";
  };

  const uploadToCloudinary = async () => {
    if (uploadedImage?.secure_url) return uploadedImage;

    if (!selectedImage) return null;

    const cloudinaryCloundName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

    const cloudinaryUploadPreset = import.meta.env
      .VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudinaryCloundName || !cloudinaryUploadPreset) {
      throw new Error(
        "Cloudinary config missing. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in frontend .env",
      );
    }
    setImageUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedImage);
      formData.append("upload_preset", cloudinaryUploadPreset);
      formData.append("folder", "automate-ai/instagram");
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudinaryCloundName}/image/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      const data = await response.json();
      if (!response.ok || !data?.secure_url) {
        throw new Error(
          data?.error?.message || "Cloudinary image upload faild.",
        );
      }

      const image = {
        secure_url: data.secure_url,
        public_id: data.public_id,
        width: data.width,
        height: data.height,
        format: data.format,
      };

      setUploadedImage(image);
      setImageUploading(false);
      return image;
    } catch (error) {
      setImageUploading(false);
      console.error("Cloudinary upload error:", error);
      throw error;
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();

    if ((!input.trim() && !selectedImage) || chatLoading) return;

    const messageContent = input.trim();
    setChatLoading(true);

    try {
      let image = uploadedImage;

      if (selectedImage && !image?.secure_url) {
        image = await uploadToCloudinary();
      }

      if (selectedImage && !image?.secure_url) {
        throw new Error("Image upload failed");
      }

      const prompt = messageContent || "Describe this image in detail";

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: messageContent,
          image_url: image?.secure_url || null,
        },
      ]);

      setInput("");

      const payload = {
        message: prompt,
        image_url: image?.secure_url || null,
        threadId: `${userData?._id || "user"}:${chatSessionId}:${selectedAgent || "default"}`,
      };

      const response = selectedAgent
        ? await agentChat(payload, selectedAgent)
        : await chat(payload);

      if (response?.interrupted) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            interrupted: true,
            interrupt: response.interrupt,
            threadId: response.threadId,
            agent: selectedAgent || response.agent,
            status: "pending",
          },
        ]);
      } else {
        const text =
          typeof response === "string"
            ? response
            : response?.content ||
              response?.response ||
              JSON.stringify(response);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: text,
          },
        ]);
        // Refresh credit balance
        me()
          .then((fresh) => {
            if (fresh) dispatch(setUserData(fresh));
          })
          .catch(() => {});
      }

      clearSelectedImage();
    } catch (error) {
      console.error("Chat error:", error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error.response?.data?.message ||
            error.message ||
            "Failed to process message",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleApproval = async (messageIndex, approved) => {
    const targetMsg = messages[messageIndex];
    if (!targetMsg || !targetMsg.interrupted || targetMsg.status !== "pending")
      return;

    if (approved) {
      setApprovingIndex(messageIndex);
    } else {
      setRejectingIndex(messageIndex);
    }

    try {
      const response = await resumeChat(
        targetMsg.threadId,
        { approved },
        targetMsg.agent,
      );

      setMessages((prev) => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          status: approved ? "approved" : "rejected",
        };
        return updated;
      });

      if (response?.interrupted) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            interrupted: true,
            interrupt: response.interrupt,
            threadId: response.threadId,
            agent: response.agent || targetMsg.agent,
            status: "pending",
          },
        ]);
      } else {
        const text =
          typeof response === "string"
            ? response
            : response?.content ||
              response?.response ||
              JSON.stringify(response);

        if (text) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: text,
            },
          ]);
          // Refresh credit balance
          me()
            .then((fresh) => {
              if (fresh) dispatch(setUserData(fresh));
            })
            .catch(() => {});
        }
      }
    } catch (error) {
      console.error("Approval action error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error.response?.data?.message ||
            error.message ||
            "Failed to complete action",
        },
      ]);
    } finally {
      setApprovingIndex(null);
      setRejectingIndex(null);
    }
  };

  const handleSelectChat = (chatId) => {
    const target = chats.find((c) => c.id === chatId);
    if (!target) return;
    setChatSessionId(target.id);
    setMessages(target.messages || []);
    if (target.agentId) {
      dispatch(setSelectedAgent(target.agentId));
    }
    clearSelectedImage();
    setInput("");
    setApprovingIndex(null);
    setRejectingIndex(null);
  };

  const handleDeleteChat = (chatId) => {
    const updated = chats.filter((c) => c.id !== chatId);
    setChats(updated);
    saveStoredChats(userData?._id, updated);
    if (chatSessionId === chatId) {
      handleNewChat();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    clearSelectedImage();
    setApprovingIndex(null);
    setRejectingIndex(null);
    setChatSessionId(Date.now().toString());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]"
      />

      {/* ChatGPT-style Left Sidebar */}
      <ChatSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        chats={chats}
        activeChatId={chatSessionId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        userData={userData}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#121317]/50 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2.5">
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="hidden size-9 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-white md:flex"
                title="Open sidebar">
                <PanelLeft size={18} />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="flex size-9 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-white md:hidden"
              title="Open sidebar">
              <PanelLeft size={18} />
            </Button>

            {/* <Button
              variant="ghost"
              size="icon"
              onClick={handleNewChat}
              className="flex size-9 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-white"
              title="New chat (Ctrl+K)">
              <SquarePen size={17} />
            </Button> */}

            <Link
              to="/"
              className="flex items-center gap-2.5 pl-1 transition hover:opacity-90">
              <span className="grid size-8 place-items-center rounded-lg bg-white text-zinc-900 shadow-[0_4px_16px_rgba(255,255,255,0.12)]">
                <Workflow size={17} />
              </span>

              <span className="hidden text-sm font-semibold tracking-tight text-white sm:inline">
                Automate AI
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              to="/pricing"
              className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:border-violet-500/50 hover:bg-violet-500/20 hover:text-white"
              title="Current credits balance (Click to buy more)">
              <Zap size={14} className="text-violet-400" />
              <span className="font-semibold text-white">
                {typeof userData?.credits === "number"
                  ? userData.credits.toLocaleString()
                  : 0}
              </span>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" className={iconBtn} />}>
                <Workflow size={17} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={`w-56 ${menuContent}`}>
                <DropdownMenuItem
                  render={
                    <Link
                      to="/agents"
                      className="flex items-center gap-2.5 py-2.5"
                    />
                  }>
                  <Bot size={16} />
                  My Agents
                </DropdownMenuItem>

                <DropdownMenuSeparator className={menuSeparator} />
                <DropdownMenuItem
                  render={
                    <Link
                      to="/agents/new"
                      className="flex items-center gap-2.5 py-2.5"
                    />
                  }>
                  <Plus size={16} />
                  Create New Agent
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={
                    <Link
                      to="/integration"
                      className="flex items-center gap-2.5 py-2.5"
                    />
                  }>
                  <Settings2 size={16} />
                  Integration
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={
                    <Link
                      to="/pricing"
                      className="flex items-center gap-2.5 py-2.5"
                    />
                  }>
                  <Coins size={16} />
                  Price
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Open profile menu"
                    className="flex size-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] transition hover:border-white/20 hover:bg-white/10"
                  />
                }>
                {userData?.profilePicture ? (
                  <img
                    src={userData?.profilePicture}
                    alt="Profile"
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRound size={17} className="text-zinc-300" />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={`w-64 ${menuContent}`}>
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {userData?.name || "User"}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {userData?.email || "email@example.com"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/5 px-3 py-2 text-xs">
                  <span className="text-zinc-400">Available Credits</span>
                  <Link
                    to="/pricing"
                    className="flex items-center gap-1 font-semibold text-violet-300 hover:text-white hover:underline">
                    <Zap size={13} />
                    {userData?.credits ?? 0}
                  </Link>
                </div>

                <DropdownMenuSeparator className={menuSeparator} />
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={logoutLoading}
                  className="cursor-pointer gap-2.5 rounded-xl py-2.5 text-red-400 focus:bg-red-500/10 focus:text-red-400">
                  <LogOut size={16} />
                  {logoutLoading ? "Logging out..." : "Logout"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className={`min-h-0 flex-1 overflow-y-auto ${hideScrollbar}`}>
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
                {messages.length === 0 ? (
                  <div className="my-auto flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-white text-zinc-900 shadow-[0_10px_40px_rgba(255,255,255,0.12)]">
                      <Workflow size={26} />
                    </div>

                    <p className="text-sm font-medium text-violet-300/80">
                      Hi, {userData?.name || "there"}
                    </p>

                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                      Can I help you with anything?
                    </h1>

                    <p className="mt-3 max-w-md text-xs leading-5 text-zinc-400">
                      Ask questions, automate tasks, or choose an agent from
                      below to begin.
                    </p>
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex w-full items-start gap-3 ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}>
                      {message.role === "assistant" && (
                        <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-zinc-900 shadow-[0_4px_16px_rgba(255,255,255,0.12)]">
                          <Workflow size={15} />
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] break-words px-4 py-3 text-sm leading-7 sm:max-w-[75%] ${
                          message.role === "user"
                            ? "rounded-2xl rounded-tr-sm bg-gradient-to-br from-violet-600/90 to-indigo-600/90 border border-violet-400/25 text-white shadow-[0_4px_20px_rgba(109,40,217,0.25)]"
                            : `${darkPanel} rounded-2xl rounded-tl-sm text-zinc-200`
                        }`}>
                        {message.interrupted ? (
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2.5">
                              <div className="flex items-center gap-2">
                                {message.interrupt?.type ===
                                  "email_approval" && (
                                  <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                                    <Mail size={15} />
                                  </div>
                                )}
                                {message.interrupt?.type ===
                                  "calendar_event_approval" && (
                                  <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                                    <Calendar size={15} />
                                  </div>
                                )}
                                {message.interrupt?.type ===
                                  "instagram_post_approval" && (
                                  <div className="flex size-7 items-center justify-center rounded-lg bg-pink-500/20 text-pink-400">
                                    <Camera size={15} />
                                  </div>
                                )}
                                <div>
                                  <span className="font-semibold text-white">
                                    {message.interrupt?.type ===
                                    "email_approval"
                                      ? "Send Email"
                                      : message.interrupt?.type ===
                                          "calendar_event_approval"
                                        ? "Create Calendar Event"
                                        : "Publish Instagram Post"}
                                  </span>
                                  <span className="ml-2 rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                                    Approval Required
                                  </span>
                                </div>
                              </div>
                            </div>

                            <p className="text-xs text-zinc-300">
                              {message.interrupt?.message ||
                                "Please review the proposed action and approve or reject it."}
                            </p>

                            {message.interrupt?.type === "email_approval" && (
                              <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-xs">
                                <div>
                                  <span className="text-zinc-500">To: </span>
                                  <span className="font-mono text-zinc-200">
                                    {message.interrupt.email?.to}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-500">
                                    Subject:{" "}
                                  </span>
                                  <span className="font-medium text-zinc-200">
                                    {message.interrupt.email?.subject}
                                  </span>
                                </div>
                                <div className="border-t border-white/5 pt-1.5 whitespace-pre-wrap text-zinc-300">
                                  {message.interrupt.email?.body}
                                </div>
                              </div>
                            )}

                            {message.interrupt?.type ===
                              "calendar_event_approval" && (
                              <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-xs">
                                <div>
                                  <span className="text-zinc-500">Title: </span>
                                  <span className="font-medium text-zinc-200">
                                    {message.interrupt.event?.summary}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-400">
                                  <div>
                                    <span className="text-zinc-500">
                                      Start:{" "}
                                    </span>
                                    <span>
                                      {message.interrupt.event?.startDateTime}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500">End: </span>
                                    <span>
                                      {message.interrupt.event?.endDateTime}
                                    </span>
                                  </div>
                                  {message.interrupt.event?.timeZone && (
                                    <div>
                                      <span className="text-zinc-500">
                                        TZ:{" "}
                                      </span>
                                      <span>
                                        {message.interrupt.event?.timeZone}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {message.interrupt.event?.description && (
                                  <div className="border-t border-white/5 pt-1.5 text-zinc-400">
                                    {message.interrupt.event?.description}
                                  </div>
                                )}
                              </div>
                            )}

                            {message.interrupt?.type ===
                              "instagram_post_approval" && (
                              <div className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3 text-xs">
                                {message.interrupt.post?.imageUrl && (
                                  <img
                                    src={message.interrupt.post.imageUrl}
                                    alt="Instagram preview"
                                    className="max-h-48 rounded-lg border border-white/10 object-contain"
                                  />
                                )}
                                {message.interrupt.post?.caption && (
                                  <div className="whitespace-pre-wrap text-zinc-300">
                                    {message.interrupt.post.caption}
                                  </div>
                                )}
                              </div>
                            )}

                            {message.status === "pending" ? (
                              <div className="mt-1 flex items-center gap-2.5 pt-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={
                                    approvingIndex !== null ||
                                    rejectingIndex !== null
                                  }
                                  onClick={() => handleApproval(index, true)}
                                  className="h-8 gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                                  {approvingIndex === index ? (
                                    <Loader2
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Check size={14} />
                                  )}
                                  <span>Approve & Proceed</span>
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    approvingIndex !== null ||
                                    rejectingIndex !== null
                                  }
                                  onClick={() => handleApproval(index, false)}
                                  className="h-8 gap-1.5 rounded-xl border-white/10 bg-white/5 px-3.5 text-xs font-medium text-zinc-300 hover:border-red-500/30 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50">
                                  {rejectingIndex === index ? (
                                    <Loader2
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <X size={14} />
                                  )}
                                  <span>Reject / Cancel</span>
                                </Button>
                              </div>
                            ) : (
                              <div className="mt-1 flex items-center gap-2 pt-1 text-xs">
                                {message.status === "approved" ? (
                                  <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-400">
                                    <Check size={13} />
                                    <span>Action Approved</span>
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-red-400">
                                    <X size={13} />
                                    <span>Action Rejected</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {isSafeHttpsUrl(message.image_url) && (
                              <img
                                src={message.image_url}
                                alt="Uploaded image"
                                loading="lazy"
                                className="mb-3 max-h-64 max-w-full rounded-xl object-contain"
                              />
                            )}
                            {message.content && (
                              <p className="whitespace-pre-wrap">
                                {message.content}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {chatLoading && (
                  <div className="flex w-full items-start gap-3 justify-start">
                    <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-zinc-900 shadow-[0_4px_16px_rgba(255,255,255,0.12)]">
                      <Workflow size={15} />
                    </div>
                    <div
                      className={`${darkPanel} flex items-center gap-2 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-400`}>
                      <Loader2
                        size={15}
                        className="animate-spin text-zinc-400"
                      />
                      <span>Thinking...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="z-20 w-full shrink-0 px-3 pb-3 pt-2 sm:px-5 sm:pb-4">
              <form
                onSubmit={handleSend}
                className={`mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition-all focus-within:border-white/20`}>
                {imagePreview && (
                  <div className="mb-3 flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                    <img
                      src={imagePreview}
                      alt="Selected upload preview"
                      className="size-20 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-zinc-300">
                        {selectedImage?.name}
                      </p>

                      <p className="mt-1 text-[11px] text-zinc-500">
                        {uploadedImage
                          ? "Uploaded to Cloudinary"
                          : "Will upload to Cloudinary when sent"}
                      </p>
                      <Button
                        type="button"
                        varient="ghost"
                        size="icon"
                        arial-label="Remove image"
                        onClick={clearSelectedImage}
                        className="size-8 text-zinc-400 hover:text-red-400">
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                )}

                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything... (Shift+Enter for new line)"
                  rows={2}
                  className={`min-h-[56px] max-h-48 w-full resize-none border-0 bg-transparent px-2 py-1 text-sm text-white shadow-none placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:outline-none ${hideScrollbar}`}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      onClick={() => fileinputRef.current.click()}
                      type="button"
                      variant="ghost"
                      aria-label="Attach image"
                      title="Attach image"
                      className="size-8 rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-white">
                      <input
                        onChange={(e) => handerSelectImage(e)}
                        type="file"
                        ref={fileinputRef}
                        accept="image/*"
                        hidden
                      />
                      <ImagePlus size={17} />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 min-w-0 max-w-[min(14rem,calc(100vw-7rem))] gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-white"
                          />
                        }>
                        <Bot size={15} className="shrink-0 text-violet-300" />
                        <span className="truncate">
                          {selectedAgent || "Select Agent"}
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className={`w-56 ${menuContent}`}>
                        <div className="px-2 py-1.5 text-xs font-medium text-zinc-400">
                          Active Agent
                        </div>
                        <DropdownMenuSeparator className={menuSeparator} />
                        {selectedAgent && (
                          <>
                            <DropdownMenuItem
                              onClick={() => dispatch(setSelectedAgent(""))}
                              className="cursor-pointer gap-2 py-2 text-xs text-zinc-400 hover:text-white">
                              <Workflow size={14} />
                              <span>Default Assistant</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className={menuSeparator} />
                          </>
                        )}
                        {agents && agents.length > 0 ? (
                          agents.map((agent) => (
                            <DropdownMenuItem
                              key={agent._id}
                              onClick={() =>
                                dispatch(setSelectedAgent(agent.name))
                              }
                              className="cursor-pointer gap-2 py-2 text-xs">
                              <Bot size={14} className="text-zinc-400" />
                              <span className="truncate font-medium">
                                {agent.name}
                              </span>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <div className="px-2 py-2 text-xs text-zinc-500">
                            No agents found
                          </div>
                        )}
                        <DropdownMenuSeparator className={menuSeparator} />
                        <DropdownMenuItem
                          render={
                            <Link
                              to="/agents/new"
                              className="flex items-center gap-2 py-2 text-xs text-violet-300 hover:text-violet-200"
                            />
                          }>
                          <Plus size={14} />
                          Create New Agent
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex gap-5">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleNewChat}
                      title="Start a new chat"
                      className="h-9 gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                      <SquarePen size={15} />
                      <span className="hidden sm:inline">New Chat</span>
                    </Button>

                    <Button
                      type="submit"
                      disabled={
                        (!input.trim() && !selectedImage) ||
                        chatLoading ||
                        imageUploading
                      }
                      size="icon"
                      aria-label="Send message"
                      className="size-8 rounded-xl bg-white text-zinc-900 shadow-sm transition hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-30 disabled:pointer-events-none">
                      <ArrowUp size={16} />
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default HomePage;
