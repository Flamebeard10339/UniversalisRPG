import { describe, expect, it } from "vitest";
import { loadModule } from "./load";

const JEWEL = [
  "# stat max-health",
  "# passive hale",
  "# cluster-jewel keen-edge",
  "shape: point",
  "open-connections: e",
  "passives: 1 hale",
].join("\n");

// c10: a cluster jewel reaches the player as an ordinary item, named through
// cluster-jewel:, and an unknown declaration is a load-time reference error
// like every other reference in the language.
describe("# item cluster-jewel:", () => {
  it("names a # cluster-jewel to become the droppable jewel", () => {
    const registry = loadModule(
      [JEWEL, "# item keen-edge-jewel", "cluster-jewel: keen-edge"].join("\n"),
    );
    expect(registry.items.get("keen-edge-jewel")!.clusterJewel).toBe(
      "keen-edge",
    );
  });

  it("rejects a cluster-jewel: naming an unknown declaration", () => {
    expect(() =>
      loadModule(
        [JEWEL, "# item keen-edge-jewel", "cluster-jewel: nope"].join("\n"),
      ),
    ).toThrow(
      /# item keen-edge-jewel cluster-jewel: names an unknown cluster-jewel: nope/,
    );
  });

  it("is optional: an ordinary item declares no cluster-jewel: at all", () => {
    const registry = loadModule("# item straw");
    expect(registry.items.get("straw")!.clusterJewel).toBeUndefined();
  });
});

// c9 and c10: `cluster-jewel:` says the item is a jewel, `origin-cluster:` and
// `slot:` say it is a base with a plane of its own, and the two roles are
// exclusive — which is what stops a weapon being consumed as a jewel.
describe("# item origin-cluster:", () => {
  const SWORD = ["# item heartwood-blade", "slot: mainhand"].join("\n");

  it("names the # cluster-jewel standing at hex (0,0) of the base plane", () => {
    const registry = loadModule(
      [JEWEL, SWORD, "origin-cluster: keen-edge"].join("\n"),
    );
    expect(registry.items.get("heartwood-blade")!.originCluster).toBe(
      "keen-edge",
    );
    expect(registry.items.get("heartwood-blade")!.clusterJewel).toBeUndefined();
  });

  it("rejects an origin-cluster: naming an unknown declaration", () => {
    expect(() =>
      loadModule([JEWEL, SWORD, "origin-cluster: nope"].join("\n")),
    ).toThrow(
      /# item heartwood-blade origin-cluster: names an unknown cluster-jewel: nope/,
    );
  });

  it("refuses an item declaring both, because one item cannot be a jewel and have a plane", () => {
    expect(() =>
      loadModule(
        [
          JEWEL,
          "# item oddity",
          "origin-cluster: keen-edge",
          "cluster-jewel: keen-edge",
        ].join("\n"),
      ),
    ).toThrow(
      /# item oddity: cluster-jewel: makes oddity a jewel, which is exclusive with the origin-cluster:/,
    );
    expect(() =>
      loadModule(
        [
          JEWEL,
          SWORD,
          "origin-cluster: keen-edge",
          "cluster-jewel: keen-edge",
        ].join("\n"),
      ),
    ).toThrow(
      /# item heartwood-blade: cluster-jewel: makes heartwood-blade a jewel/,
    );
  });

  it("refuses a jewel that is also wearable, since a base is spelled slot: and a base can be grown", () => {
    expect(() =>
      loadModule(
        [
          JEWEL,
          "# item keen-edge-jewel",
          "slot: mainhand",
          "cluster-jewel: keen-edge",
        ].join("\n"),
      ),
    ).toThrow(
      /# item keen-edge-jewel: cluster-jewel: makes keen-edge-jewel a jewel, which is exclusive with the slot:/,
    );
  });

  it("refuses an origin-cluster: on an item nothing can wear, because only a base has a plane", () => {
    expect(() =>
      loadModule(
        [JEWEL, "# item whetstone", "origin-cluster: keen-edge"].join("\n"),
      ),
    ).toThrow(
      /# item whetstone: origin-cluster: is the cluster hex \(0,0\) of whetstone's plane, and only a base has one/,
    );
  });
});

describe("# item cluster-effect:", () => {
  it("reads a percent and a stat", () => {
    const registry = loadModule(
      "# stat max-health\n\n# item orb-of-vitality\ncluster-effect: +25% max-health",
    );
    expect(registry.items.get("orb-of-vitality")!.clusterEffect).toEqual({
      statId: "max-health",
      percent: 25,
    });
  });

  it("rejects a flat amount, since a cluster effect is a percentage by grammar", () => {
    expect(() =>
      loadModule(
        "# stat max-health\n\n# item orb-of-vitality\ncluster-effect: +25 max-health",
      ),
    ).toThrow(/expected a percent stat bonus/);
  });

  it("rejects a stat that does not resolve", () => {
    expect(() => loadModule("# item orb\ncluster-effect: +25% nope")).toThrow(
      /# item orb cluster-effect: names an unknown stat: nope/,
    );
  });

  // c9: a base and an orb are exclusive roles, the way a base and a jewel
  // already are — an item claiming both would be a plane and, at the same
  // time, consumable into someone else's.
  it("refuses an item declaring both slot: and cluster-effect:, since a base has no orb role", () => {
    expect(() =>
      loadModule(
        "# stat max-health\n\n# item warding-blade\nslot: mainhand\ncluster-effect: +25% max-health",
      ),
    ).toThrow(
      /# item warding-blade: cluster-effect: makes warding-blade an orb, which is exclusive with the slot: that makes it a base/,
    );
  });

  it("refuses an item declaring both origin-cluster: and cluster-effect:, for the same reason one field over", () => {
    const JEWEL = [
      "# stat max-health",
      "# passive hale",
      "# cluster-jewel keen-edge",
      "shape: point",
      "open-connections: e",
      "passives: 1 hale",
    ].join("\n");
    expect(() =>
      loadModule(
        [
          JEWEL,
          "# item warding-orb",
          "origin-cluster: keen-edge",
          "cluster-effect: +25% max-health",
        ].join("\n"),
      ),
    ).toThrow(
      /# item warding-orb: cluster-effect: makes warding-orb an orb, which is exclusive with the origin-cluster: that makes it a base/,
    );
  });
});

describe("# item item-experience: and max-level:", () => {
  it("reads item-experience: as a flat grant", () => {
    const registry = loadModule("# item whetstone\nitem-experience: 1000");
    expect(registry.items.get("whetstone")!.itemExperience).toBe(1000);
  });

  it("defaults max-level: to 99, and reads an explicit lower ceiling", () => {
    const registry = loadModule(
      "# item iron-sword\nmax-level: 10\n\n# item heartwood-blade",
    );
    expect(registry.items.get("iron-sword")!.maxLevel).toBe(10);
    expect(registry.items.get("heartwood-blade")!.maxLevel).toBe(99);
  });
});
