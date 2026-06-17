import type { ActiveTravel, ContentBundle } from '../game/types';
import { locationDescriptionKey, locationTitleKey } from '../game/contentIds';
import type { Translator } from '../game/i18n';
import { useNow } from '../hooks/useNow';

type TravelStatusProps = {
  bundle: ContentBundle;
  activeTravel: ActiveTravel | null;
  currentLocationId: string;
  onCancel?: () => void;
  titleWhenIdle?: boolean;
  t: Translator;
};

const formatRemainingTime = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const TravelStatus = ({
  bundle,
  activeTravel,
  currentLocationId,
  onCancel,
  titleWhenIdle = false,
  t,
}: TravelStatusProps) => {
  const now = useNow(Boolean(activeTravel));
  const currentLocation = bundle.locations.find((location) => location.id === currentLocationId);

  if (!activeTravel) {
    if (!titleWhenIdle || !currentLocation) {
      return null;
    }

    return (
      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold">{t(currentLocation.titleKey ?? locationTitleKey(currentLocation.id))}</h2>
        <p className="mt-1 text-sm text-slate-400">{t(currentLocation.descriptionKey ?? locationDescriptionKey(currentLocation.id))}</p>
      </section>
    );
  }

  const fromLocation = bundle.locations.find((location) => location.id === activeTravel.fromLocationId);
  const toLocation = bundle.locations.find((location) => location.id === activeTravel.toLocationId);
  const duration = activeTravel.completesAt - activeTravel.startedAt;
  const progress = Math.min(100, Math.max(0, ((now - activeTravel.startedAt) / duration) * 100));
  const remainingTime = formatRemainingTime(activeTravel.completesAt - now);

  return (
    <section className="grid gap-3 rounded border border-cyan-900 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-cyan-100">{t('travelStatus.title')}</h2>
          <p className="text-sm text-slate-300">
            {t('travelStatus.to', {
              from: fromLocation ? t(fromLocation.titleKey ?? locationTitleKey(fromLocation.id)) : activeTravel.fromLocationId,
              to: toLocation ? t(toLocation.titleKey ?? locationTitleKey(toLocation.id)) : activeTravel.toLocationId,
            })}
          </p>
          <p className="mt-1 text-xs text-cyan-200">{t('travelStatus.arrival', { seconds: remainingTime })}</p>
        </div>
        {onCancel && (
          <button
            className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
            onClick={onCancel}
            type="button"
          >
            {t('travelStatus.cancel')}
          </button>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-cyan-300 transition-all" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
};
