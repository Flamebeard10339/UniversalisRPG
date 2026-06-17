import { useState } from 'react';

type ChatMessage = {
  id: number;
  author: 'system' | 'player';
  text: string;
};

type ChatPanelProps = {
  locationName: string;
};

export const ChatPanel = ({ locationName }: ChatPanelProps) => {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      author: 'system',
      text: `You settle in at ${locationName}.`,
    },
  ]);

  const sendMessage = () => {
    const text = draft.trim();

    if (!text) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        author: 'player',
        text,
      },
    ]);
    setDraft('');
  };

  return (
    <section className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] gap-3 rounded border border-slate-800 bg-slate-900 p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-100">Chat</h2>
        <p className="text-sm text-slate-400">{locationName}</p>
      </div>

      <div className="grid content-start gap-2 overflow-auto rounded bg-slate-950 p-3">
        {messages.map((message) => (
          <div
            className={`max-w-[85%] rounded px-3 py-2 text-sm ${
              message.author === 'player'
                ? 'ml-auto bg-cyan-400 text-slate-950'
                : 'bg-slate-800 text-slate-200'
            }`}
            key={message.id}
          >
            {message.text}
          </div>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say something..."
          value={draft}
        />
        <button className="rounded bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
          Send
        </button>
      </form>
    </section>
  );
};
