import { describe, expect, it } from 'vitest';
import { asLocalized } from '../../runtime/localizedFixture';
import { layerNamed, mapState, mapSurface, pointFrom, shellState, shellSurface, subpageNamed, zoomFrom, type MapControls } from './surfaces';
import { CLIMB_NUDGE, sheetAt, type Place } from '../discovery';
import { ZOOM_MAX, ZOOM_MIN, type Point } from '../viewport';
import { HOME_LAYER, LAYERS, OPENING, toLayer } from '../nav';

const place = (id: string, x: number, y: number, z: number, ...adjacent: string[]): Place => ({
  id,
  title: asLocalized(id.toUpperCase()),
  x,
  y,
  z,
  adjacent: adjacent.map((to) => ({ to, open: true })),
});

const HOUSE: Place[] = [
  place('hall', 0, 0, 0, 'landing', 'cellar', 'beach'),
  place('landing', 0, 0, 1, 'hall'),
  place('cellar', 0, 0, -1, 'hall'),
  place('beach', 1, 0, 0, 'hall'),
  place('cove', 2, 0, 0, 'beach'),
];

describe('the shell as a driving agent reaches it', () => {
  it('publishes where it is standing by the names the model uses, not by an index', () => {
    expect(shellState(OPENING)).toEqual({
      layer: 'home',
      subpage: 'home',
      layers: ['map', 'home', 'character'],
      subpages: ['edit', 'home', 'settings'],
    });
  });

  it('says which pages are on offer, which is the layer being stood on and no other', () => {
    const character = shellState(toLayer(OPENING, LAYERS.findIndex((layer) => layer.id === 'character')));

    expect(character.subpages).toEqual(['stats', 'skills', 'equipment', 'inventory']);
  });

  it('moves the layer by name', () => {
    let moved = OPENING;
    shellSurface(OPENING, (where) => void (moved = where)).actions!.layer('map');

    expect(shellState(moved).layer).toBe('map');
  });

  it('moves the page of the layer being stood on, by name', () => {
    let moved = OPENING;
    shellSurface(OPENING, (where) => void (moved = where)).actions!.subpage('settings');

    expect(shellState(moved)).toMatchObject({ layer: 'home', subpage: 'settings' });
  });

  it('refuses a name nothing answers to rather than clamping to a neighbour', () => {
    expect(() => layerNamed('nowhere')).toThrow('no layer is named nowhere');
    expect(() => layerNamed(1)).toThrow('no layer is named 1');
    expect(() => subpageNamed(HOME_LAYER, 'inventory')).toThrow('home has no subpage named inventory');
  });

  it('remembers a page it was moved to, so re-entering the layer comes back to it', () => {
    const character = LAYERS.findIndex((layer) => layer.id === 'character');
    let moved = toLayer(OPENING, character);
    const surface = shellSurface(moved, (where) => void (moved = where));
    surface.actions!.subpage('inventory');
    const left = toLayer(moved, HOME_LAYER);

    expect(shellState(toLayer(left, character)).subpage).toBe('inventory');
  });
});

const INERT: MapControls = {
  settle: () => undefined,
  plane: () => undefined,
  recentre: () => undefined,
  moving: () => undefined,
  go: () => undefined,
  place: () => undefined,
};

describe('the map as a driving agent reaches it', () => {
  const sheet = sheetAt(HOUSE, 'hall', 0);
  const travels = new Map([['beach', 3]]);
  const view = { plane: 0, zoom: 1, pan: { x: 0, y: 0 }, moving: false, sheet, travels };

  it('publishes what is drawn and where, so nothing has to be read off the markup', () => {
    const state = mapState(view);

    expect(state).toMatchObject({ plane: 0, planes: [-1, 0, 1], zoom: 1, pan: { x: 0, y: 0 } });
    expect(state.places.find((place) => place.id === 'hall')).toMatchObject({ here: true, climb: 0, goes: null });
    expect(state.places.find((place) => place.id === 'beach')).toMatchObject({ here: false, goes: 3 });
    expect(state.places.find((place) => place.id === 'landing')).toMatchObject({ climb: 1, at: { x: CLIMB_NUDGE, y: -CLIMB_NUDGE } });
  });

  it('pans and zooms through the same settling a finger goes through', () => {
    const rests: Array<{ pan: Point; zoom: number }> = [];
    const surface = mapSurface(view, { ...INERT, settle: (pan, zoom) => void rests.push({ pan, zoom }) });

    surface.actions!.pan({ x: 20, y: -5 });
    surface.actions!.zoom(2);

    expect(rests).toEqual([
      { pan: { x: 20, y: -5 }, zoom: 1 },
      { pan: { x: 0, y: 0 }, zoom: 2 },
    ]);
  });

  it('holds a zoom to the stops the pinch is held to, and refuses what is not a number at all', () => {
    expect(zoomFrom(99)).toBe(ZOOM_MAX);
    expect(zoomFrom(0)).toBe(ZOOM_MIN);
    expect(() => zoomFrom('in')).toThrow('a zoom is a finite number');
    expect(() => zoomFrom(Number.NaN)).toThrow('a zoom is a finite number');
  });

  it('refuses a pan that is not a pair of finite numbers rather than moving to NaN', () => {
    expect(pointFrom({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    expect(() => pointFrom(null)).toThrow('a pan is an { x, y } of finite numbers');
    expect(() => pointFrom({ x: 1 })).toThrow('a pan is an { x, y } of finite numbers');
    expect(() => pointFrom({ x: Number.POSITIVE_INFINITY, y: 0 })).toThrow('a pan is an { x, y } of finite numbers');
  });

  it('changes to a floor it is drawing, and refuses one it is not', () => {
    const floors: number[] = [];
    const surface = mapSurface(view, { ...INERT, plane: (at) => void floors.push(at) });

    surface.actions!.plane(-1);

    expect(floors).toEqual([-1]);
    expect(() => surface.actions!.plane(4)).toThrow('no plane is drawn at 4');
    expect(() => surface.actions!.plane('up')).toThrow('no plane is drawn at up');
  });
});
