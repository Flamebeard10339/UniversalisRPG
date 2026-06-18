import { useEffect, useRef } from 'react';
import type { Translator } from '../game/i18n';
import type { ChatMessage } from '../game/types';

type ChatPanelProps = {
  messages: ChatMessage[];
  t: Translator;
};

export const ChatPanel = ({ messages, t }: ChatPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element || !stickToBottomRef.current) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.count]);

  const updateStickiness = () => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
  };

  const renderMessage = (message: ChatMessage) => {
    const text = message.key ? t(message.key, message.params) : message.text ?? '';
    return message.count > 1 ? `(${message.count}) ${text}` : text;
  };

  return (
    <section className="grid min-h-0 rounded border border-slate-800 bg-slate-900 p-4">
      <div
        className="grid content-start gap-2 overflow-auto rounded bg-slate-950 p-3"
        onScroll={updateStickiness}
        ref={scrollRef}
      >
        {messages.map((message) => (
          <div
            className={`max-w-[85%] rounded px-3 py-2 text-sm ${
              message.author === 'player'
                ? 'ml-auto bg-cyan-400 text-slate-950'
                : message.author === 'debug'
                  ? 'bg-amber-950 text-amber-100'
                  : 'bg-slate-800 text-slate-200'
            }`}
            key={message.id}
          >
            {renderMessage(message)}
          </div>
        ))}
      </div>
    </section>
  );
};
