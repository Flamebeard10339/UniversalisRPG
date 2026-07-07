import type { ActionResolutionContext, DialogueNode, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';
import { evaluateCondition } from '../game/conditions';

type DialoguePanelProps = {
  context: ActionResolutionContext;
  onChoose: (optionId?: string) => void;
  playState: UniversePlayState;
  t: Translator;
};

const activeNode = (playState: UniversePlayState, context: ActionResolutionContext): DialogueNode | null => {
  const active = playState.activeDialogue;
  if (!active) return null;
  const dialogue = context.dialogues?.find((item) => item.id === active.dialogueId);
  return dialogue?.nodes.find((node) => node.id === active.nodeId) ?? null;
};

export const DialoguePanel = ({ context, onChoose, playState, t }: DialoguePanelProps) => {
  const active = playState.activeDialogue;
  const node = activeNode(playState, context);

  if (!active || !node) {
    return null;
  }

  const options = (node.options ?? [])
    .filter((option) => !option.conditions || evaluateCondition(option.conditions, playState, context));
  const speaker = node.speakerId ? t(`dialogue.${active.dialogueId}.speaker.${node.speakerId}`, node.speakerId) : '';

  return (
    <section className="dialogue-panel grid h-full grid-rows-[1fr_auto] gap-4 rounded-t border border-cyan-800 bg-slate-950/95 p-4 shadow-2xl" data-dialogue-panel="">
      <div className="min-h-0 overflow-auto">
        {speaker && <p className="mb-2 text-xs font-semibold uppercase text-cyan-200">{speaker}</p>}
        {node.textKey && <p className="text-base leading-7 text-slate-100">{t(node.textKey)}</p>}
        {node.narratorKey && <p className="text-sm italic leading-6 text-slate-300">{t(node.narratorKey)}</p>}
      </div>
      <div className="grid gap-2">
        {options.length > 0 ? (
          options.map((option, index) => (
            <button
              className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100"
              data-dialogue-option-id={option.id}
              key={option.id}
              onClick={() => onChoose(option.id)}
              type="button"
            >
              <span className="mr-2 text-cyan-200">{index + 1}.</span>
              {t(option.labelKey)}
            </button>
          ))
        ) : (
          <button
            className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950"
            data-dialogue-continue=""
            onClick={() => onChoose()}
            type="button"
          >
            {t('dialogue.continue')}
          </button>
        )}
      </div>
    </section>
  );
};
