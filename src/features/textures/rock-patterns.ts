export const ROCK_PATTERNS = {
  "font-sandstone": "Fontainebleau sandstone",
  "sandstone-crust": "Sandstone crust",
  "cross-bedded-sandstone": "Cross-bedded sandstone",
  "granite-grain": "Fine granite",
  "granite-crystals": "Coarse granite",
  "granite-weathered": "Weathered granite",
  "limestone-pockets": "Pitted limestone",
  "limestone-flutes": "Fluted limestone",
  "basalt-vesicles": "Vesicular basalt",
  "gneiss-bands": "Banded gneiss",
  "slate-layers": "Layered slate",
  quartzite: "Quartzite",
} as const;

type RockPattern = keyof typeof ROCK_PATTERNS;
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const smooth = (n: number) => n * n * (3 - 2 * n);

function noise(period: number, random: () => number) {
  const cells = Float32Array.from({ length: period ** 2 }, () => random());
  return (u: number, v: number) => {
    const x = (u - Math.floor(u)) * period;
    const y = (v - Math.floor(v)) * period;
    const col = Math.floor(x),
      row = Math.floor(y);
    const a = col % period,
      b = (col + 1) % period;
    const c = (row % period) * period,
      d = ((row + 1) % period) * period;
    const fx = smooth(x - col),
      fy = smooth(y - row);
    return (
      (cells[c + a] * (1 - fx) + cells[c + b] * fx) * (1 - fy) +
      (cells[d + a] * (1 - fx) + cells[d + b] * fx) * fy
    );
  };
}

// The cells trace mineral boundaries rather than rounding every peak.
function mineralCells(period: number, random: () => number) {
  const centers = Array.from({ length: period ** 2 }, () => ({
    x: 0.2 + 0.6 * random(),
    y: 0.2 + 0.6 * random(),
    tone: random(),
  }));
  return (u: number, v: number) => {
    const x = (u - Math.floor(u)) * period,
      y = (v - Math.floor(v)) * period;
    const col = Math.floor(x),
      row = Math.floor(y);
    let nearest = Infinity,
      second = Infinity,
      tone = 0;
    for (let j = row - 1; j <= row + 1; j++) {
      for (let i = col - 1; i <= col + 1; i++) {
        const cell =
          centers[((j + period) % period) * period + ((i + period) % period)];
        const distance = (x - i - cell.x) ** 2 + (y - j - cell.y) ** 2;
        if (distance < nearest) {
          second = nearest;
          nearest = distance;
          tone = cell.tone;
        } else second = Math.min(second, distance);
      }
    }
    return (0.45 + 0.55 * tone) * smooth(clamp01((second - nearest) * 4));
  };
}

export function makeRockSampler(
  pattern: RockPattern,
  seed: number,
  density: number,
  detail: number,
) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const scale = Math.max(2, density);
  const broad = noise(3, random),
    warp = noise(4, random);
  const lumps = noise(scale * 2, random),
    pits = noise(scale * 4, random);
  const grain = noise(scale * 8, random);
  const minerals =
    pattern === "granite-crystals" ? mineralCells(scale * 3, random) : null;
  return (u: number, v: number) => {
    const shape = broad(u, v);
    const x = u + (warp(u, v) - 0.5) * 0.17;
    const y = v + (shape - 0.5) * 0.17;
    const lumpsValue = lumps(x, y),
      pitsValue = pits(x, y),
      grainValue = grain(u, v);
    const bands =
      (1 + Math.sin(2 * Math.PI * (v * scale + u + 0.8 * shape))) / 2;
    const cavities = clamp01((0.42 - pitsValue) * 2.5) ** 2;
    const crystal = smooth(clamp01((lumpsValue - 0.24) / 0.5));
    let relief: number;
    switch (pattern) {
      case "font-sandstone":
        // Rounded weathered dishes with harder crust gathering around the rims.
        relief =
          0.22 +
          0.42 * smooth(lumpsValue) +
          0.28 * shape ** 2 -
          0.17 * cavities;
        break;
      case "sandstone-crust":
        relief =
          0.16 +
          0.61 *
            smooth(clamp01((lumpsValue - 0.34) * 2.1)) *
            (0.4 + 0.6 * shape);
        break;
      case "cross-bedded-sandstone":
        relief = 0.24 + 0.43 * bands ** 2.6 * shape + 0.24 * lumpsValue;
        break;
      case "granite-grain":
        relief = 0.32 + 0.36 * pitsValue + 0.17 * crystal - 0.13 * cavities;
        break;
      case "granite-crystals":
        relief =
          0.16 + 0.54 * minerals!(x, y) + 0.13 * crystal + 0.16 * pitsValue;
        break;
      case "granite-weathered":
        relief =
          0.19 +
          0.37 * crystal * shape +
          0.33 * smooth(lumpsValue) -
          0.23 * cavities;
        break;
      case "limestone-pockets":
        relief =
          0.72 -
          0.62 * clamp01((0.55 - lumpsValue) * 2.2) ** 2 -
          0.17 * cavities;
        break;
      case "limestone-flutes":
        relief =
          0.64 - 0.49 * bands ** 3 * (0.35 + 0.65 * shape) - 0.13 * cavities;
        break;
      case "basalt-vesicles":
        relief = 0.68 - 0.68 * cavities + 0.08 * shape;
        break;
      case "gneiss-bands":
        relief = 0.18 + 0.47 * bands ** 2 + 0.24 * crystal * bands;
        break;
      case "slate-layers":
        relief =
          0.21 +
          0.49 * smooth(clamp01((bands - 0.29) * 2.8)) * (0.45 + 0.55 * shape);
        break;
      case "quartzite":
        relief = 0.21 + 0.52 * Math.abs(2 * lumpsValue - 1) + 0.19 * pitsValue;
        break;
    }
    return clamp01(
      relief + detail * (0.22 * (grainValue - 0.5) + 0.17 * (pitsValue - 0.5)),
    );
  };
}
