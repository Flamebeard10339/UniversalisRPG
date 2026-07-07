import { itemDescriptionKey, itemTitleKey } from '../game/contentIds';
import { canEquipItemInSlot, equipmentSlots, formatItemTag, getItemTags, itemSlots, meetsEquipmentRequirements } from '../game/equipment';
import { areActionRequirementsMet, isActionVisible } from '../game/conditions';
import { getActionTitleText } from '../game/actionLocalization';
import type { ContentBundle, EquipmentSlot, GameAction, UniversePlayState } from '../game/types';
import type { Translator } from '../game/i18n';

type InventoryPanelProps = {
  bundle: ContentBundle;
  onEquip: (itemId: string, slot: EquipmentSlot) => void;
  onStartAction: (action: GameAction) => void;
  onUnequip: (slot: EquipmentSlot) => void;
  playState: UniversePlayState;
  t: Translator;
};

export const InventoryPanel = ({ bundle, onEquip, onStartAction, onUnequip, playState, t }: InventoryPanelProps) => {
  const entries = Object.entries(playState.inventory).filter(([, amount]) => amount > 0);
  const actionContext = {
    manifest: bundle.manifest,
    actions: bundle.actions,
    skills: bundle.skills,
    stats: bundle.stats,
    locations: bundle.locations,
    entities: bundle.entities,
    items: bundle.items,
    flags: bundle.flags,
    resourceDefinitions: bundle.resourceDefinitions,
    effects: bundle.effects,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
    dropTables: bundle.dropTables,
  };
  const itemActions = (itemId: string) => bundle.actions
    .filter((action) => action.itemId === itemId)
    .filter((action) => isActionVisible(playState, action, actionContext) && areActionRequirementsMet(playState, action, actionContext));

  return (
    <section className="grid gap-4 rounded border border-slate-800 bg-slate-900 p-4">
      <section className="grid gap-2">
        <h2 className="text-base font-semibold text-slate-100">{t('equipment.title')}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {equipmentSlots.map((slot) => {
            const itemId = playState.equipment?.[slot];
            const item = itemId ? bundle.items.find((candidate) => candidate.id === itemId) : null;
            return (
              <section className="grid min-h-20 gap-2 rounded border border-slate-800 bg-slate-950 p-3" data-equipment-slot={slot} key={slot}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold uppercase text-slate-500">{t(`equipment.slot.${slot}`)}</span>
                  {item && (
                    <button className="rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200" data-unequip-slot={slot} onClick={() => onUnequip(slot)} type="button">
                      {t('equipment.unequip')}
                    </button>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-100">{item ? t(itemTitleKey(item.id), item.id) : t('equipment.emptySlot')}</p>
              </section>
            );
          })}
        </div>
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-100">{t('inventory.title')}</h2>
          {bundle.manifest.maxInventorySlots !== undefined && (
            <span className="text-xs font-semibold text-slate-400">
              {t('inventory.slotsUsed', { used: entries.length, max: bundle.manifest.maxInventorySlots })}
            </span>
          )}
        </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">{t('inventory.empty')}</p>
      ) : (
        <div className="grid gap-2">
          {entries.map(([itemId, amount]) => {
            const item = bundle.items.find((candidate) => candidate.id === itemId);
            const slots = itemSlots(item);
            const availableItemActions = itemActions(itemId);
            return (
              <section className="grid gap-2 rounded border border-slate-800 bg-slate-950 p-3" data-item-id={itemId} key={itemId}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{t(itemTitleKey(itemId), itemId)}</h3>
                    <p className="mt-1 text-xs text-slate-400">{t(itemDescriptionKey(itemId), '')}</p>
                    {item && getItemTags(item).length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1">
                        {getItemTags(item).map((tag, index) => (
                          <li className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300" key={`${itemId}-${index}`}>
                            {formatItemTag(tag, t)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-slate-100">{amount}</span>
                </div>
                {(item && slots.length > 0) || availableItemActions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {item && slots.map((slotTag) => {
                      const requirementsMet = meetsEquipmentRequirements(playState, slotTag, bundle.skills, bundle.manifest.experienceCurve);
                      return (
                        <button
                          className="rounded border border-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                          data-equip-slot={slotTag.slot}
                          data-item-id={item.id}
                          disabled={!canEquipItemInSlot(playState, item, slotTag.slot, bundle.skills, bundle.manifest.experienceCurve)}
                          key={`${item.id}-${slotTag.slot}`}
                          onClick={() => onEquip(item.id, slotTag.slot)}
                          title={requirementsMet ? undefined : t('equipment.requirementsNotMet')}
                          type="button"
                        >
                          {t('equipment.equipTo', { slot: t(`equipment.slot.${slotTag.slot}`) })}
                        </button>
                      );
                    })}
                    {availableItemActions.map((action) => (
                      <button
                        className="rounded border border-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                        data-action-id={action.id}
                        key={action.id}
                        onClick={() => onStartAction(action)}
                        type="button"
                      >
                        {getActionTitleText(action, bundle, t)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
      </section>
    </section>
  );
};
