import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Paperclip, Send, X } from "lucide-react";
import { PhotoPicker } from "./FilePicker";
import { dateTime } from "./format";

/**
 * The project conversation (BRD C20).
 *
 * "A conversation attached to the project, where photos and documents can be
 * shared. Everything is kept permanently."
 *
 * Three things that are deliberate rather than incidental:
 *
 *   SYSTEM NOTES SIT INLINE. "Stage 2 approved, ₹95,000 released" appears
 *   between the messages, in the order it happened. Reading the thread top to
 *   bottom then tells you what happened AND what was said about it — which is
 *   the whole reason the BRD wants this off WhatsApp.
 *
 *   RETRACTED MESSAGES STAY VISIBLE, greyed and labelled. A thread you can
 *   silently edit holes into is worthless as a record of what was agreed.
 *
 *   NO DELIVERY TICKS. The BRD asks for a permanent record, not a chat app, and
 *   read receipts between two parties in a payment dispute create arguments
 *   ("you saw it on Tuesday") that the product does not need to host.
 */
export default function MessageThread({ projectId, api, side = "customer", peerName = "" }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [photos, setPhotos] = useState([]);
  const [showAttach, setShowAttach] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const myRole = side === "contractor" ? "CONTRACTOR" : "CUSTOMER";

  const load = useCallback(async () => {
    try {
      const result = await api.listMessages(projectId, { limit: 100 });
      setMessages(result?.messages || []);
      setError("");
      // Opening the thread is reading it.
      api.markMessagesRead(projectId).catch(() => {});
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load the conversation");
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body && photos.length === 0) return;
    setSending(true);
    setError("");
    try {
      await api.sendMessage(projectId, {
        body,
        attachments: photos.map((url) => ({ url, kind: "image" })),
      });
      setDraft("");
      setPhotos([]);
      setShowAttach(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not send that");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <div className="flex-1 space-y-2.5 overflow-y-auto pb-3">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-200/70" />
          ))
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <p className="text-xs font-bold text-slate-800">No messages yet</p>
            <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">
              Anything agreed here stays with the project permanently — much safer than
              a personal chat that gets lost.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m._id}
              message={m}
              isMine={m.senderType === myRole}
              onRetract={async () => {
                try {
                  await api.retractMessage(projectId, m._id);
                  await load();
                } catch (err) {
                  setError(err?.response?.data?.message || "Could not retract it");
                }
              }}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
          {error}
        </p>
      )}

      {showAttach && (
        <div className="mb-2 rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700">Attach photos</span>
            <button
              type="button"
              onClick={() => { setShowAttach(false); setPhotos([]); }}
              aria-label="Cancel attachments"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <PhotoPicker
            values={photos}
            onChange={setPhotos}
            max={10}
            folder="construction/messages"
            label="Add photos"
          />
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-slate-200 pt-2.5">
        <button
          type="button"
          onClick={() => setShowAttach((v) => !v)}
          aria-label="Attach"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
            showAttach || photos.length
              ? "bg-amber-500/15 text-amber-700"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={1}
          placeholder={peerName ? `Message ${peerName}…` : "Write a message…"}
          className="max-h-28 min-h-[2.25rem] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-amber-500"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || (!draft.trim() && photos.length === 0)}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {photos.length > 0 && (
        <p className="mt-1 text-[10.5px] text-slate-500">
          {photos.length} photo{photos.length === 1 ? "" : "s"} will be attached
        </p>
      )}
    </div>
  );
}

function MessageBubble({ message, isMine, onRetract }) {
  const [confirming, setConfirming] = useState(false);

  // System notes are the project's own narration — centred, not a bubble.
  if (message.senderType === "SYSTEM") {
    return (
      <div className="flex justify-center py-0.5">
        <p className="inline-flex max-w-[85%] items-start gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-slate-600">
          <Info className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
          <span>
            {message.body}
            <span className="ml-1.5 whitespace-nowrap text-slate-400">
              {dateTime(message.createdAt)}
            </span>
          </span>
        </p>
      </div>
    );
  }

  const isSupport = message.senderType === "ADMIN";

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] ${isMine ? "items-end" : "items-start"}`}>
        {!isMine && (
          <p className="mb-0.5 px-1 text-[10px] font-bold text-slate-500">
            {isSupport ? "SMS Pro Support" : message.senderName}
          </p>
        )}
        <div
          className={`rounded-2xl px-3 py-2 ${
            message.isRetracted
              ? "bg-slate-100 text-slate-400"
              : isSupport
                ? "bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                : isMine
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-900 ring-1 ring-slate-200"
          }`}
        >
          {message.isRetracted ? (
            <p className="text-[11px] italic">This message was retracted</p>
          ) : (
            <>
              {message.body && (
                <p className="whitespace-pre-wrap break-words text-[11.5px] leading-relaxed">
                  {message.body}
                </p>
              )}
              {message.attachments?.length > 0 && (
                <div className={`grid grid-cols-2 gap-1.5 ${message.body ? "mt-2" : ""}`}>
                  {message.attachments.map((a, i) => (
                    <a
                      key={`${a.url}-${i}`}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square overflow-hidden rounded-lg bg-slate-200"
                    >
                      <img
                        src={a.url}
                        alt={a.fileName || `Attachment ${i + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className={`mt-0.5 flex items-center gap-2 px-1 ${isMine ? "justify-end" : ""}`}>
          <span className="text-[10px] text-slate-400">{dateTime(message.createdAt)}</span>
          {isMine && !message.isRetracted && (
            confirming ? (
              <>
                <button
                  type="button"
                  onClick={() => { onRetract(); setConfirming(false); }}
                  className="text-[10px] font-bold text-rose-600"
                >
                  Retract
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-[10px] font-bold text-slate-400"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
              >
                Retract
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
