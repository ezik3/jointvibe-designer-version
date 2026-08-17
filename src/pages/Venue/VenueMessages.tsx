import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Archive,
  CheckCheck,
  MessageSquare,
  MoreHorizontal,
  PencilLine,
  Radio,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "./venue-messages.css";

type MessageSender = "guest" | "venue";

interface Conversation {
  id: string;
  name: string;
  initials: string;
  location: string;
  status: string;
  lastMessage: string;
  time: string;
  unread: number;
  archived?: boolean;
}

interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  time: string;
}

const seedConversations: Conversation[] = [
  { id: "table-5", name: "Table 5", initials: "T5", location: "Table 5", status: "Active now", lastMessage: "Can we get extra napkins?", time: "2m", unread: 2 },
  { id: "vip-booth-1", name: "VIP Booth 1", initials: "V1", location: "VIP Booth 1", status: "Seated", lastMessage: "Thanks for the great service!", time: "15m", unread: 0 },
  { id: "table-2", name: "Table 2", initials: "T2", location: "Table 2", status: "Awaiting reply", lastMessage: "Is the kitchen still open?", time: "1h", unread: 1 },
  { id: "bar-guest", name: "Bar guest", initials: "BG", location: "Main bar", status: "Checked in", lastMessage: "What cocktails do you recommend?", time: "2h", unread: 0 },
  { id: "table-11", name: "Table 11", initials: "T11", location: "Table 11", status: "Active now", lastMessage: "Could we have two waters?", time: "2h", unread: 0 },
  { id: "lounge-3", name: "Lounge 3", initials: "L3", location: "Lounge 3", status: "Awaiting reply", lastMessage: "Can we move our reservation?", time: "3h", unread: 1 },
  { id: "table-8", name: "Table 8", initials: "T8", location: "Table 8", status: "Active now", lastMessage: "Is the dessert menu available?", time: "3h", unread: 0 },
  { id: "patio-2", name: "Patio 2", initials: "P2", location: "Patio 2", status: "Seated", lastMessage: "Thanks, everything is perfect.", time: "4h", unread: 0 },
  { id: "table-14", name: "Table 14", initials: "T14", location: "Table 14", status: "Awaiting reply", lastMessage: "Can we get another round?", time: "4h", unread: 1 },
  { id: "private-room", name: "Private room", initials: "PR", location: "Private room", status: "Checked in", lastMessage: "We are ready for the next course.", time: "5h", unread: 0 },
  { id: "table-7", name: "Table 7", initials: "T7", location: "Table 7", status: "Active now", lastMessage: "Can we have the bill when ready?", time: "5h", unread: 0 },
  { id: "bar-guest-2", name: "Bar guest 2", initials: "B2", location: "Main bar", status: "Checked in", lastMessage: "Do you have a non-alcoholic option?", time: "6h", unread: 0 },
  { id: "table-6", name: "Table 6", initials: "T6", location: "Table 6", status: "Checked in", lastMessage: "Could we see the wine list?", time: "7h", unread: 0 },
  { id: "terrace-1", name: "Terrace 1", initials: "TR", location: "Terrace 1", status: "Checked in", lastMessage: "Is the terrace heated tonight?", time: "7h", unread: 0 },
  { id: "table-18", name: "Table 18", initials: "T18", location: "Table 18", status: "Checked in", lastMessage: "Can we add one more guest?", time: "8h", unread: 0 },
  { id: "lounge-6", name: "Lounge 6", initials: "L6", location: "Lounge 6", status: "Checked in", lastMessage: "Our drinks have arrived, thank you.", time: "8h", unread: 0 },
  { id: "table-3", name: "Table 3", initials: "T3", location: "Table 3", status: "Checked in", lastMessage: "Could we get extra plates?", time: "9h", unread: 0 },
  { id: "patio-5", name: "Patio 5", initials: "P5", location: "Patio 5", status: "Checked in", lastMessage: "Is a server able to stop by?", time: "9h", unread: 0 },
  { id: "vip-booth-2", name: "VIP Booth 2", initials: "V2", location: "VIP Booth 2", status: "Checked in", lastMessage: "Can we order a bottle service package?", time: "10h", unread: 0 },
  { id: "table-16", name: "Table 16", initials: "T16", location: "Table 16", status: "Checked in", lastMessage: "Please make the next round alcohol-free.", time: "10h", unread: 0 },
  { id: "bar-guest-3", name: "Bar guest 3", initials: "B3", location: "Main bar", status: "Checked in", lastMessage: "Which mocktail is most popular?", time: "11h", unread: 0 },
  { id: "lounge-1", name: "Lounge 1", initials: "L1", location: "Lounge 1", status: "Checked in", lastMessage: "Can we change the music volume?", time: "11h", unread: 0 },
  { id: "table-9", name: "Table 9", initials: "T9", location: "Table 9", status: "Checked in", lastMessage: "Could we have another set of cutlery?", time: "12h", unread: 0 },
  { id: "patio-4", name: "Patio 4", initials: "P4", location: "Patio 4", status: "Checked in", lastMessage: "We are ready to order dessert.", time: "12h", unread: 0 },
  { id: "table-20", name: "Table 20", initials: "T20", location: "Table 20", status: "Checked in", lastMessage: "Can we split the bill three ways?", time: "1d", unread: 0 },
  { id: "vip-booth-3", name: "VIP Booth 3", initials: "V3", location: "VIP Booth 3", status: "Checked in", lastMessage: "Thank you for looking after us.", time: "1d", unread: 0 },
  { id: "bar-guest-4", name: "Bar guest 4", initials: "B4", location: "Main bar", status: "Checked in", lastMessage: "Do you have a late-night menu?", time: "1d", unread: 0 },
  { id: "table-1", name: "Table 1", initials: "T1", location: "Table 1", status: "Checked in", lastMessage: "Could we move to a quieter table?", time: "1d", unread: 0 },
  { id: "terrace-2", name: "Terrace 2", initials: "T2", location: "Terrace 2", status: "Checked in", lastMessage: "Can we have two blankets please?", time: "1d", unread: 0 },
  { id: "private-room-2", name: "Private room 2", initials: "P2", location: "Private room 2", status: "Checked in", lastMessage: "The host would like to speak with someone.", time: "1d", unread: 0 },
];

const seedThreadCopy: Record<string, string[]> = {
  "Table 5": ["Hi, can we get extra napkins please?", "Of course. I'll send someone right over.", "Also, is it possible to get the bill?"],
  "VIP Booth 1": ["Thanks for the great service!", "You're very welcome. Let us know when you're ready for anything else."],
  "Table 2": ["Is the kitchen still open?", "The kitchen is open until midnight. I can help with any menu questions."],
  "Bar guest": ["What cocktails do you recommend?", "The citrus tonic and house spritz are both popular tonight."],
  "Table 11": ["Could we have two waters?", "Absolutely. I have asked the floor team to bring them over."],
  "Lounge 3": ["Can we move our reservation?", "Yes. Tell us the time that works best and we will check availability."],
  "Table 8": ["Is the dessert menu available?", "Yes, I will send it over now."],
  "Patio 2": ["Thanks, everything is perfect.", "Glad to hear it. Enjoy your evening."],
  "Table 14": ["Can we get another round?", "Of course. What would you like to order?"],
  "Private room": ["We are ready for the next course.", "Thank you. The kitchen has been notified."],
  "Table 7": ["Can we have the bill when ready?", "Yes, I will send it to your table now."],
  "Bar guest 2": ["Do you have a non-alcoholic option?", "Yes, the citrus tonic is available alcohol-free."],
};

const initialMessages = seedConversations.reduce<Record<string, ChatMessage[]>>((threads, conversation) => {
  const messages = seedThreadCopy[conversation.name] || ["Hello, I have a quick question.", "Thanks for reaching out. A team member will help shortly."];
  threads[conversation.id] = messages.map((text, index) => ({
    id: `${conversation.id}-${index}`,
    sender: index % 2 === 0 ? "guest" : "venue",
    text,
    time: `2:${String(34 + index).padStart(2, "0")} PM`,
  }));
  return threads;
}, {});

function getCurrentTime() {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date());
}

export default function VenueMessages() {
  const [conversations, setConversations] = useState<Conversation[]>(seedConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(seedConversations[0].id);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>(initialMessages);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [newMessage, setNewMessage] = useState("");
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [conversationPendingDeletion, setConversationPendingDeletion] = useState<Conversation | null>(null);
  const [conversationPendingRename, setConversationPendingRename] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const selectedMessages = selectedConversation ? messagesByConversation[selectedConversation.id] || [] : [];

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (conversation.archived) return false;
      if (!query) return true;
      return `${conversation.name} ${conversation.location} ${conversation.lastMessage}`.toLowerCase().includes(query);
    });
  }, [conversations, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(filteredConversations.length / pageSize));
  const currentConversations = filteredConversations.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const unreadCount = conversations.reduce((total, conversation) => total + conversation.unread, 0);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [selectedConversationId, selectedMessages.length]);

  useEffect(() => {
    if (!isActionMenuOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsActionMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isActionMenuOpen]);

  const selectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setIsActionMenuOpen(false);
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation
    )));
  };

  const handleMarkAllRead = () => {
    setConversations((current) => current.map((conversation) => ({ ...conversation, unread: 0 })));
  };

  const handleRename = () => {
    if (!selectedConversation) return;
    setConversationPendingRename(selectedConversation);
    setRenameValue(selectedConversation.name);
    setIsActionMenuOpen(false);
  };

  const handleCloseRename = () => {
    setConversationPendingRename(null);
    setRenameValue("");
  };

  const handleConfirmRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const conversation = conversationPendingRename;
    const nextName = renameValue.trim();
    handleCloseRename();
    if (!conversation || !nextName) return;

    setConversations((current) => current.map((item) => (
      item.id === conversation.id ? { ...item, name: nextName } : item
    )));
  };

  const updateSelectionAfterAction = (nextConversations: Conversation[]) => {
    if (selectedConversation && !nextConversations.find((conversation) => conversation.id === selectedConversation.id && !conversation.archived)) {
      setSelectedConversationId(nextConversations.find((conversation) => !conversation.archived)?.id ?? null);
    }
  };

  const handleArchive = () => {
    if (!selectedConversation) return;
    const nextConversations = conversations.map((conversation) => (
      conversation.id === selectedConversation.id ? { ...conversation, archived: true } : conversation
    ));
    setConversations(nextConversations);
    updateSelectionAfterAction(nextConversations);
    setCurrentPage(1);
    setIsActionMenuOpen(false);
  };

  const handleDelete = () => {
    if (!selectedConversation) return;
    setConversationPendingDeletion(selectedConversation);
  };

  const handleConfirmDelete = () => {
    const conversation = conversationPendingDeletion;
    setConversationPendingDeletion(null);
    if (!conversation) return;

    const nextConversations = conversations.filter((item) => item.id !== conversation.id);
    setConversations(nextConversations);
    updateSelectionAfterAction(nextConversations);
    setCurrentPage(1);
    setIsActionMenuOpen(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = newMessage.trim();
    if (!text || !selectedConversation) return;

    const sentAt = getCurrentTime();
    const message: ChatMessage = {
      id: `${selectedConversation.id}-${Date.now()}`,
      sender: "venue",
      text,
      time: sentAt,
    };

    setMessagesByConversation((current) => ({
      ...current,
      [selectedConversation.id]: [...(current[selectedConversation.id] || []), message],
    }));
    setConversations((current) => current.map((conversation) => (
      conversation.id === selectedConversation.id
        ? { ...conversation, lastMessage: text, time: "Now", unread: 0 }
        : conversation
    )));
    setNewMessage("");
  };

  return (
    <main className="venue-messages-page">
      <header className="venue-messages-heading">
        <div>
          <h1>Messages</h1>
          <p>Respond to guests and keep service requests moving.</p>
        </div>
        <span className="venue-messages-heading__status">
          <Radio aria-hidden="true" />
          Guest messaging active
        </span>
      </header>

      <section className="venue-messages-workspace" aria-label="Guest messages">
        <aside className="venue-messages-inbox" aria-label="Conversations">
          <header className="venue-messages-inbox__header">
            <div>
              <h2>Inbox</h2>
              <span>{filteredConversations.length ? `${filteredConversations.length} conversations` : "No conversations"}</span>
            </div>
            <button
              className="venue-messages-icon-button"
              type="button"
              aria-label="Mark all messages read"
              title="Mark all read"
              onClick={handleMarkAllRead}
            >
              <CheckCheck aria-hidden="true" />
            </button>
          </header>

          <label className="venue-messages-search" htmlFor="venue-message-search">
            <Search aria-hidden="true" />
            <input
              id="venue-message-search"
              type="search"
              placeholder="Search guests or tables"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
            />
          </label>

          <div className="venue-messages-conversation-list">
            {currentConversations.map((conversation) => {
              const isActive = conversation.id === selectedConversationId;
              return (
                <button
                  key={conversation.id}
                  className={`venue-messages-conversation${isActive ? " venue-messages-conversation--active" : ""}`}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <span className="venue-messages-avatar">{conversation.initials}</span>
                  <span className="venue-messages-conversation__copy">
                    <strong>{conversation.name}</strong>
                    <small>{conversation.lastMessage}</small>
                  </span>
                  <span className="venue-messages-conversation__meta">
                    <time>{conversation.time}</time>
                    {conversation.unread > 0 && <b className="venue-messages-badge">{conversation.unread}</b>}
                  </span>
                </button>
              );
            })}
          </div>

          {currentConversations.length === 0 && (
            <p className="venue-messages-conversation-empty">No conversations found.</p>
          )}

          <footer className="venue-messages-inbox__footer">
            <label className="venue-messages-list-controls" htmlFor="venue-conversation-limit">
              <span>Show</span>
              <select
                id="venue-conversation-limit"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>conversations</span>
            </label>
            {pageCount > 1 && (
              <nav className="venue-messages-pagination" aria-label="Conversation pages">
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                  <button
                    key={page}
                    className={`venue-messages-pagination__page${page === currentPage ? " venue-messages-pagination__page--active" : ""}`}
                    type="button"
                    aria-label={`Page ${page}`}
                    aria-current={page === currentPage ? "page" : undefined}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
              </nav>
            )}
          </footer>
        </aside>

        <section className="venue-messages-panel" aria-live="polite">
          {selectedConversation ? (
            <>
              <header className="venue-messages-panel__header">
                <span className="venue-messages-avatar">{selectedConversation.initials}</span>
                <div>
                  <h2>{selectedConversation.name}</h2>
                  <p><span aria-hidden="true" />{selectedConversation.status}</p>
                </div>
                <div ref={actionMenuRef} className="venue-messages-conversation-actions">
                  <button
                    className="venue-messages-icon-button"
                    type="button"
                    aria-label="Conversation options"
                    title="Conversation options"
                    aria-expanded={isActionMenuOpen}
                    onClick={() => setIsActionMenuOpen((open) => !open)}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </button>
                  {isActionMenuOpen && (
                    <div className="venue-messages-action-menu" role="menu">
                      <button type="button" role="menuitem" onClick={handleArchive}>
                        <Archive aria-hidden="true" />
                        <span>Archive</span>
                      </button>
                      <button type="button" role="menuitem" onClick={handleRename}>
                        <PencilLine aria-hidden="true" />
                        <span>Rename message</span>
                      </button>
                      <button className="venue-messages-action-menu__delete" type="button" role="menuitem" onClick={handleDelete}>
                        <Trash2 aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </header>

              <div ref={threadRef} className="venue-messages-thread">
                {selectedMessages.map((message) => (
                  <div key={message.id} className={`venue-messages-row${message.sender === "venue" ? " venue-messages-row--venue" : ""}`}>
                    <article className={`venue-messages-bubble venue-messages-bubble--${message.sender}`}>
                      <p>{message.text}</p>
                      <time>{message.time}</time>
                    </article>
                  </div>
                ))}
              </div>

              <form className="venue-messages-composer" onSubmit={handleSubmit}>
                <label className="venue-messages-composer__input" htmlFor="venue-message-input">
                  <input
                    id="venue-message-input"
                    type="text"
                    maxLength={500}
                    placeholder="Write a reply"
                    autoComplete="off"
                    value={newMessage}
                    onChange={(event) => setNewMessage(event.target.value)}
                  />
                </label>
                <button
                  className="venue-messages-icon-button venue-messages-composer__send"
                  type="submit"
                  aria-label="Send message"
                  title="Send message"
                  disabled={!newMessage.trim()}
                >
                  <Send aria-hidden="true" />
                </button>
              </form>
            </>
          ) : (
            <div className="venue-messages-panel__empty">
              <MessageSquare aria-hidden="true" />
              <h2>No active conversations</h2>
              <p>Guest messages will appear here when a conversation is available.</p>
            </div>
          )}
        </section>
      </section>

      <span className="sr-only" aria-live="polite">{unreadCount ? `${unreadCount} unread messages` : "No unread messages"}</span>
      <Dialog open={conversationPendingRename !== null} onOpenChange={(open) => { if (!open) handleCloseRename(); }}>
        <DialogContent className="venue-dialog-surface sm:max-w-md">
          <form className="space-y-4" onSubmit={handleConfirmRename}>
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
              <DialogDescription>Choose a new name for {conversationPendingRename?.name}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="venue-conversation-name">Conversation name</label>
              <Input
                id="venue-conversation-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoFocus
                maxLength={100}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseRename}>Cancel</Button>
              <Button type="submit" disabled={!renameValue.trim()}>Save name</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={conversationPendingDeletion !== null} onOpenChange={(open) => { if (!open) setConversationPendingDeletion(null); }}>
        <AlertDialogContent className="venue-dialog-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the conversation with {conversationPendingDeletion?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmDelete}>
              Delete conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
