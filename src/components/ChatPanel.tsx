import { useEffect, useRef, useState } from 'react';
import type { Translator } from '../game/i18n';
import type { ChatMessage } from '../game/types';
import { useNow } from '../hooks/useNow';

type ChatPanelProps = {
  compressionEnabled: boolean;
  // Height (px) of the message-history box below the resize handle; omit
  // for a plain full-height chat with no handle/resize behavior at all
  // (the "GUI hidden" text-adventure mode). 0 is a valid, fully-collapsed
  // value. Only the history box collapses — the handle and the input/send
  // row are never part of this and always stay visible, so there's always
  // a way to both drag the panel back open and to type/send a message.
  contentHeight?: number;
  messages: ChatMessage[];
  onResizeHandlePointerDown?: (event: React.PointerEvent) => void;
  onSend?: (text: string) => void;
  t: Translator;
};

type DisplayMessage = {
  author: ChatMessage['author'];
  count: number;
  id: number;
  latestCreatedAt: number;
  text: string;
};

const renderMessageText = (message: ChatMessage, t: Translator) => {
  if (!message.key) return message.text ?? '';
  if (message.key === 'chat.skillLevelUp') {
    const skillTitleKey = String(message.params?.['skill-name'] ?? '');
    return t(message.key, {
      ...(message.params ?? {}),
      'skill-name': skillTitleKey ? t(skillTitleKey, skillTitleKey) : '',
    });
  }
  return t(message.key, message.params);
};

const normalizeRenderedText = (text: string) => text.replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim();

const displayKey = (message: Pick<DisplayMessage, 'author' | 'text'>) =>
  `${message.author}\u0000${message.text}`;

export const buildDisplayMessages = (
  messages: ChatMessage[],
  t: Translator,
  compressionEnabled: boolean,
): DisplayMessage[] => {
  const rendered = messages.map((message) => ({
    author: message.author,
    count: message.count,
    id: message.id,
    latestCreatedAt: message.createdAt,
    text: normalizeRenderedText(renderMessageText(message, t)),
  }));

  if (!compressionEnabled) {
    return rendered;
  }

  const groups = new Map<string, DisplayMessage>();

  for (const message of rendered) {
    const key = displayKey(message);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, message);
      continue;
    }

    groups.set(key, {
      ...existing,
      count: existing.count + message.count,
      id: message.latestCreatedAt >= existing.latestCreatedAt ? message.id : existing.id,
      latestCreatedAt: Math.max(existing.latestCreatedAt, message.latestCreatedAt),
    });
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.latestCreatedAt - right.latestCreatedAt || left.id - right.id);
};

export const ChatPanel = ({ compressionEnabled, contentHeight, messages, onResizeHandlePointerDown, onSend, t }: ChatPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [draft, setDraft] = useState('');
  const hasPendingMessages = messages.some((message) => message.createdAt > Date.now());
  const now = useNow(hasPendingMessages, 100);
  const visibleMessages = [...messages]
    .filter((message) => message.createdAt <= now)
    .sort((left, right) => left.createdAt - right.createdAt);
  const displayMessages = buildDisplayMessages(visibleMessages, t, compressionEnabled);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [displayMessages.length, displayMessages[displayMessages.length - 1]?.count]);

  const updateStickiness = () => {
    const element = scrollRef.current;
    if (element) stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
  };

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed || !onSend) return;
    onSend(trimmed);
    setDraft('');
  };

  return (
    <section
      className={`grid h-full min-h-0 rounded border border-slate-800 bg-slate-900 ${onResizeHandlePointerDown ? 'grid-rows-[auto_auto_auto]' : 'grid-rows-[1fr_auto]'}`}
      data-testid="chat-panel"
    >
      {onResizeHandlePointerDown && (
        // The whole bar (not just a small button) is the drag target — a
        // large, unambiguous mobile touch target — with a centered dash as
        // the only visual affordance; dragging it down to 0 height is how
        // the player minimizes chat, no separate button needed.
        <div
          aria-label={t('chat.resizeHandle', 'Drag to resize chat')}
          className="flex h-11 shrink-0 cursor-ns-resize touch-none select-none items-center justify-center rounded-t"
          data-testid="chat-resize-handle"
          onPointerDown={onResizeHandlePointerDown}
          role="button"
          tabIndex={0}
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-slate-600" />
        </div>
      )}
      {/* Only the message history collapses (down to 0) — the resize
          handle above and the input/send row below are never squeezed by
          it, so there's always a way to reopen the panel and always a way
          to type, regardless of how far the history is collapsed. */}
      <div
        className={`min-h-0 overflow-hidden px-4 ${onResizeHandlePointerDown ? '' : 'pt-4'}`}
        style={contentHeight !== undefined ? { height: contentHeight } : undefined}
      >
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto rounded bg-slate-950 p-3" onScroll={updateStickiness} ref={scrollRef}>
          {displayMessages.map((message) => (
            <div
              className={`max-w-[85%] shrink-0 whitespace-pre-line rounded px-3 py-2 text-sm ${
                message.author === 'player'
                  ? 'ml-auto bg-cyan-400 text-slate-950'
                  : message.author === 'debug'
                    ? 'bg-amber-950 text-amber-100'
                    : 'bg-slate-800 text-slate-200'
              }`}
              key={`${message.author}:${message.id}:${message.text}`}
            >
              {message.count > 1 ? `${message.text} (${message.count})` : message.text}
            </div>
          ))}
        </div>
      </div>
      {onSend && (
        <form
          className="flex gap-2 p-4 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            data-testid="chat-input"
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('cli.input.placeholder', 'Type a message or /command')}
            type="text"
            value={draft}
          />
          <button className="rounded border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-100" data-testid="chat-send" type="submit">
            {t('cli.input.send', 'Send')}
          </button>
        </form>
      )}
    </section>
  );
};
