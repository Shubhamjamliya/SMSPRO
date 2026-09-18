import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Send } from "lucide-react";
import { TaxiPageShell, TaxiPageHeader } from "../../components/ui";
import { getTaxiSupportPath } from "../../utils/routes";
import { CHAT_THREAD } from "../../utils/mock/support";

export default function LiveChat() {
  const [messages, setMessages] = useState(
    CHAT_THREAD.filter((m) => m.type !== "typing"),
  );
  const [typing, setTyping] = useState(true);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: "m6",
          type: "agent",
          text: "I've flagged your trip for priority. Reply anytime — we're here.",
          time: "10:06 AM",
        },
      ]);
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        type: "user",
        text,
        time: "Just now",
      },
    ]);
    setDraft("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          type: "agent",
          text: "Thanks — noted. A specialist will follow up shortly. (Placeholder reply)",
          time: "Just now",
        },
      ]);
    }, 1200);
  };

  return (
    <TaxiPageShell className="flex flex-col pb-0">
      <TaxiPageHeader
        title="Live Chat"
        subtitle="Usually replies in minutes"
        backTo={getTaxiSupportPath()}
      />

      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((msg) => {
            if (msg.type === "date") {
              return (
                <div key={msg.id} className="flex justify-center py-1">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {msg.label}
                  </span>
                </div>
              );
            }
            const mine = msg.type === "user";
            return (
              <div
                key={msg.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                    mine
                      ? "rounded-br-md bg-[#FF6A00] text-white"
                      : "rounded-bl-md border border-gray-100 bg-white text-gray-900"
                  }`}
                >
                  <p className="text-[13px] leading-relaxed">{msg.text}</p>
                  <p
                    className={`mt-1 text-[9px] font-semibold ${
                      mine ? "text-white/70" : "text-gray-400"
                    }`}
                  >
                    {msg.time}
                  </p>
                </div>
              </div>
            );
          })}

          {typing ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-gray-100 bg-white px-3.5 py-3 shadow-sm">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        <div className="border-t border-gray-100 bg-white px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                toast.message("Attachments", {
                  description: "Placeholder — file picker not connected.",
                })
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600"
              aria-label="Attach"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Type a message…"
              className="h-10 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-[#FF6A00]/40 focus:ring-2 focus:ring-[#FF6A00]/15"
            />
            <button
              type="button"
              onClick={send}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00] text-white shadow-sm"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </TaxiPageShell>
  );
}
