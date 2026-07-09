import type { Translator } from '../game/i18n';

type ExamineButtonProps = {
  className?: string;
  onExamine: (text: string) => void;
  testId?: string;
  textKey: string;
  t: Translator;
};

// One shared "print this thing's examine text to chat" affordance —
// item/entity examine text is its own first-class action (already rendered
// as a button wherever entity/item actions are), so this component is only
// for object kinds with no action system of their own (locations, stats,
// skills): a plain locale-key lookup instead of dispatching a real action,
// but the same visible behavior — a button that appends text to chat.
export const ExamineButton = ({ className, onExamine, testId, textKey, t }: ExamineButtonProps) => (
  <button
    className={className ?? 'shrink-0 rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200'}
    data-testid={testId}
    onClick={() => onExamine(t(textKey, ''))}
    type="button"
  >
    {t('home.examine', 'Examine')}
  </button>
);
