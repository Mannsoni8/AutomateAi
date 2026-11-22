import {
  ArrowUp,
  Bot,
  ImagePlus,
  Loader2,
  LogOut,
  Plus,
  Settings2,
  Trash2,
  UserRound,
  Workflow,
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
import { logout } from "@/features/auth";
import { setUserData } from "@/redux/userSlice";
import { setSelectedAgent } from "@/redux/agentSlice";
import { Textarea } from "@/components/ui/textarea";
import { agentChat, chat } from "@/features/chat";

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

  const { userData } = useSelector((state) => state.user || {});
  const { agents = [], selectedAgent } = useSelector(
    (state) => state.agent || {},
  );

  const dispatch = useDispatch();
  const messagesEndRef = useRef(null);

  const fileinputRef = useRef(null);

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

  const handerSelectImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Please select a valid image.",
        },
      ]);
      return;
    }

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(file);
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
      console.log(error);
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();

    if (!input.trim() || chatLoading) return;

    const messageContent = input.trim();

    setInput("");

    let image = uploadedImage;

    if (selectedImage && !image?.secure_url) {
      image = await uploadToCloudinary();
    }

    let finalMessage = messages;
    if (image?.secure_url) {
      finalMessage += `\n\nImage URL: ${image.secure_url}`;

      finalMessage += `\nImage public ID: ${image.public_id || ""}`;
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: finalMessage,
        image_url: image.secure_url,
      },
    ]);

    setChatLoading(true);

    try {
      // If an agent is selected, use agentChat
      if (selectedAgent) {
        const response = await agentChat(finalMessage, selectedAgent);

        const text =
          typeof response === "string"
            ? response
            : response?.content || JSON.stringify(response);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: text,
          },
        ]);

        return;
      }

      // Otherwise, use normal chat
      const response = await chat(finalMessage);

      const text =
        typeof response === "string"
          ? response
          : response?.content || JSON.stringify(response);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: text,
        },
      ]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage =
        error.response?.data?.message ||
        "Sorry, an error occurred while processing your message.";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errorMessage,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]"
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#121317]/50 px-4 backdrop-blur-xl sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 transition hover:opacity-90">
            <span className="grid size-8 place-items-center rounded-lg bg-white text-zinc-900 shadow-[0_4px_16px_rgba(255,255,255,0.12)]">
              <Workflow size={17} />
            </span>

            <span className="text-sm font-medium tracking-tight">
              Automate AI
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
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
                        <p className="whitespace-pre-wrap">{message.content}</p>
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

                  <Button
                    type="submit"
                    disabled={!input.trim() || chatLoading}
                    size="icon"
                    aria-label="Send message"
                    className="size-8 rounded-xl bg-white text-zinc-900 shadow-sm transition hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-30 disabled:pointer-events-none">
                    <ArrowUp size={16} />
                  </Button>
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
