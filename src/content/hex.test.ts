import { describe, expect, it } from "vitest";
import {
  DIRECTIONS,
  NEIGHBOR_DELTA,
  opposite,
  rotate,
  rotationOnto,
} from "./hex";

describe("the axial hex vocabulary", () => {
  it("names six directions, each with a distinct neighbour delta", () => {
    expect(DIRECTIONS).toEqual(["e", "ne", "nw", "w", "sw", "se"]);
    const deltas = DIRECTIONS.map(
      (d) => `${NEIGHBOR_DELTA[d].q},${NEIGHBOR_DELTA[d].r}`,
    );
    expect(new Set(deltas).size).toBe(6);
  });

  it("pairs every direction with its opposite, and opposite is its own inverse", () => {
    for (const d of DIRECTIONS) {
      expect(opposite(opposite(d))).toBe(d);
      expect(opposite(d)).not.toBe(d);
    }
    expect(opposite("e")).toBe("w");
    expect(opposite("w")).toBe("e");
    expect(opposite("ne")).toBe("sw");
    expect(opposite("nw")).toBe("se");
  });

  it("rotates by sixths, wrapping in both directions", () => {
    expect(rotate("e", 0)).toBe("e");
    expect(rotate("e", 1)).toBe("ne");
    expect(rotate("e", 6)).toBe("e");
    expect(rotate("e", -1)).toBe("se");
    expect(rotate("e", 7)).toBe("ne");
  });

  it("finds the rotation that carries one edge onto another", () => {
    for (const from of DIRECTIONS) {
      for (const to of DIRECTIONS) {
        expect(rotate(from, rotationOnto(from, to))).toBe(to);
      }
    }
    // c7: slotting through a slot facing direction d carries the root's west
    // edge onto opposite(d). An east-facing slot is therefore the identity
    // (opposite(e) = w) and a west-facing slot a half turn (opposite(w) = e).
    expect(rotationOnto("w", opposite("e"))).toBe(0);
    expect(rotationOnto("w", opposite("w"))).toBe(3);
  });
});
