import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  MessageSquare,
  PanelLeftClose,
  Search,
  Settings2,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const groupChatsByDate = (chats) => {
  const groups = {
    Today: [],
    Yesterday: [],
    "Previous 7 Days": [],
    Older: [],
  };

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterdayStart = todayStart - 86400000;
  const lastWeekStart = todayStart - 7 * 86400000;

  chats.forEach((chat) => {
    const time = chat.updatedAt || chat.createdAt || 0;
    if (time >= todayStart) {
      groups.Today.push(chat);
    } else if (time >= yesterdayStart) {
      groups.Yesterday.push(chat);
    } else if (time >= lastWeekStart) {
      groups["Previous 7 Days"].push(chat);
    } else {
      groups.Older.push(chat);
    }
  });

  return groups;
};

export const ChatSidebar = ({
  isOpen,
  onClose,
  chats = [],
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  userData,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredChats = chats.filter((c) =>
    (c.title || "Untitled Chat")
      .toLowerCase()
      .includes(searchQuery.toLowerCase().trim()),
  );

  const grouped = groupChatsByDate(filteredChats);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/[0.08] bg-[#121317] transition-all duration-300 ease-in-out md:static md:z-20 ${
          isOpen
            ? "translate-x-0"
            : "-translate-x-full md:w-0 md:overflow-hidden md:border-r-0"
        }`}>
        {/* Top Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 transition hover:opacity-90">
            <span className="grid size-8 place-items-center rounded-lg bg-white text-zinc-900 shadow-[0_4px_16px_rgba(255,255,255,0.12)]">
              <Workflow size={17} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">
              Automate AI
            </span>
          </Link>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-8 rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white"
            title="Collapse sidebar">
            <PanelLeftClose size={18} className="hidden md:block" />
            <X size={18} className="md:hidden" />
          </Button>
        </div>

        {/* New Chat Button & Search */}
        <div className="flex flex-col gap-2 p-3">
          {chats.length > 5 && (
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-lg border border-white/[0.06] bg-white/[0.02] pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-500 transition focus:border-violet-500/40 focus:bg-white/[0.04] focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-3 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare size={28} className="mb-2 text-zinc-600" />
              <p className="text-xs font-medium text-zinc-400">
                No recent chats yet
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Start a conversation to see your history here.
              </p>
            </div>
          ) : filteredChats.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">
              No chats matching &quot;{searchQuery}&quot;
            </p>
          ) : (
            Object.entries(grouped).map(([groupTitle, groupItems]) => {
              if (groupItems.length === 0) return null;
              return (
                <div key={groupTitle} className="mb-4">
                  <h4 className="mb-1.5 px-2 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    {groupTitle}
                  </h4>
                  <div className="flex flex-col gap-0.5">
                    {groupItems.map((chat) => {
                      const isActive = chat.id === activeChatId;
                      return (
                        <div
                          key={chat.id}
                          onClick={() => {
                            onSelectChat(chat.id);
                            if (window.innerWidth < 768) onClose();
                          }}
                          className={`group relative flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs transition ${
                            isActive
                              ? "border border-violet-500/30 bg-white/[0.08] font-medium text-white shadow-xs"
                              : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                          }`}>
                          <div className="flex min-w-0 flex-1 items-center gap-2 pr-1">
                            <MessageSquare
                              size={14}
                              className={`shrink-0 ${
                                isActive ? "text-violet-400" : "text-zinc-500"
                              }`}
                            />
                            <span className="truncate">
                              {chat.title || "Untitled Chat"}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteChat(chat.id);
                            }}
                            title="Delete chat"
                            className="opacity-0 transition hover:text-red-400 group-hover:opacity-100">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Section */}
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          {/* Credits Badge */}
          <Link
            to="/pricing"
            className="mb-2 flex items-center justify-between rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15"
            title="Buy or manage credits">
            <span className="flex items-center gap-1.5 font-medium">
              <Zap size={14} className="text-violet-400" />
              <span>Available Credits</span>
            </span>
            <span className="font-semibold text-white">
              {typeof userData?.credits === "number"
                ? userData.credits.toLocaleString()
                : 0}
            </span>
          </Link>

          {/* Quick Navigation Links */}
          <div className="flex flex-col gap-1">
            <Link
              to="/agents"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200">
              <Bot size={14} />
              <span>My Agents</span>
            </Link>
            <Link
              to="/integration"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200">
              <Settings2 size={14} />
              <span>Integrations</span>
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
};
