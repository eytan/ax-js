// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Benchmark: estimateMinMax strategies for GP posterior mean/variance.
 *
 * Tests various QMC and optimization approaches across different
 * dimensionalities (d) and training set sizes (N) to find the best
 * tradeoff between walltime and accuracy.
 *
 * Run: npx tsx test/bench_minmax.ts
 */

import type { GPModelState, KernelState } from "../src/models/types.js";

import { SingleTaskGP } from "../src/models/single_task.js";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Seeded PRNG (xoshiro128**) for reproducibility. */
function makeRng(seed: number): () => number {
  const s = [
    seed | 0,
    (seed * 2_654_435_761) | 0,
    (seed * 340_573_321) | 0,
    (seed * 1_867_534_921) | 0,
  ];
  function next(): number {
    const t = s[1] << 9;
    let r = s[0] * 5;
    r = ((r << 7) | (r >>> 25)) * 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11) | (s[3] >>> 21);
    return (r >>> 0) / 4_294_967_296;
  }
  return next;
}

/** Generate Halton sequence value for given index and base. */
function halton(index: number, base: number): number {
  let f = 1,
    r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/** First 256 primes for Halton bases. */
const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
  101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193,
  197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307,
  311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421,
  431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547,
  557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659,
  661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797,
  809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929,
  937, 941, 947, 953, 967, 971, 977, 983, 991, 997, 1009, 1013, 1019, 1021, 1031, 1033, 1039, 1049,
  1051, 1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109, 1117, 1123, 1129, 1151, 1153, 1163,
  1171, 1181, 1187, 1193, 1201, 1213, 1217, 1223, 1229, 1231, 1237, 1249, 1259, 1277, 1279, 1283,
  1289, 1291, 1297, 1301, 1303, 1307, 1319, 1321, 1327, 1361, 1367, 1373, 1381, 1399, 1409, 1423,
  1427, 1429, 1433, 1439, 1447, 1451, 1453, 1459, 1471, 1481, 1483, 1487, 1489, 1493, 1499, 1511,
  1523, 1531, 1543, 1549, 1553, 1559, 1567, 1571, 1579, 1583,
];

/** Generate scrambled Halton sequence points in [0,1]^d. */
function scrambledHalton(n: number, d: number, seed: number = 42): Array<Array<number>> {
  const rng = makeRng(seed);
  // Owen-style scrambling: random shift per dimension
  const shifts = Array.from({ length: d }, () => rng());
  const pts: Array<Array<number>> = [];
  for (let i = 0; i < n; i++) {
    const pt: Array<number> = [];
    for (let j = 0; j < d; j++) {
      const raw = halton(i + 1, PRIMES[j % PRIMES.length]);
      pt.push((raw + shifts[j]) % 1);
    }
    pts.push(pt);
  }
  return pts;
}

/** Generate random uniform points in [0,1]^d. */
function randomUniform(n: number, d: number, seed: number = 42): Array<Array<number>> {
  const rng = makeRng(seed);
  const pts: Array<Array<number>> = [];
  for (let i = 0; i < n; i++) {
    const pt: Array<number> = [];
    for (let j = 0; j < d; j++) {
      pt.push(rng());
    }
    pts.push(pt);
  }
  return pts;
}

/** Generate Latin Hypercube Sample points in [0,1]^d. */
function lhs(n: number, d: number, seed: number = 42): Array<Array<number>> {
  const rng = makeRng(seed);
  const pts: Array<Array<number>> = [];
  // Create permutation per dimension
  const perms: Array<Array<number>> = [];
  for (let j = 0; j < d; j++) {
    const perm = Array.from({ length: n }, (_, i) => i);
    // Fisher-Yates shuffle
    for (let i = n - 1; i > 0; i--) {
      const k = Math.floor(rng() * (i + 1));
      [perm[i], perm[k]] = [perm[k], perm[i]];
    }
    perms.push(perm);
  }
  for (let i = 0; i < n; i++) {
    const pt: Array<number> = [];
    for (let j = 0; j < d; j++) {
      pt.push((perms[j][i] + rng()) / n);
    }
    pts.push(pt);
  }
  return pts;
}

// ─── Sobol sequence generator ─────────────────────────────────────────

/** Direction numbers for Sobol sequence (Joe-Kuo, up to 256 dims). */
function sobolDirectionNumbers(d: number): Array<Array<number>> {
  // For simplicity, use a basic Sobol generator with direction numbers
  // from the standard construction. For dim 0, use Van der Corput.
  const dirs: Array<Array<number>> = [];
  for (let j = 0; j < d; j++) {
    const v: Array<number> = Array.from({ length: 32 });
    if (j === 0) {
      // Dimension 0: Van der Corput in base 2
      for (let i = 0; i < 32; i++) {
        v[i] = 1 << (31 - i);
      }
    } else {
      // Simple polynomial-based direction numbers
      // Use a basic LCG seeded by dimension to generate direction numbers
      let s = j * 2_654_435_761;
      for (let i = 0; i < 32; i++) {
        s = (s * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
        v[i] = (s | (1 << (31 - i))) & (0xff_ff_ff_ff << (31 - i));
        // Ensure the bit at position 31-i is set
        v[i] = ((s >>> i) | 1) << (31 - i);
      }
    }
    dirs.push(v);
  }
  return dirs;
}

function generateSobol(n: number, d: number, seed: number = 0): Array<Array<number>> {
  const dirs = sobolDirectionNumbers(d);
  const rng = makeRng(seed);
  const shifts = Array.from({ length: d }, () => Math.floor(rng() * 0xff_ff_ff_ff));
  const pts: Array<Array<number>> = [];
  for (let i = 0; i < n; i++) {
    const pt: Array<number> = [];
    // Gray code construction
    const idx = i + 1;
    for (let j = 0; j < d; j++) {
      let val = 0;
      let ii = idx;
      let bit = 0;
      while (ii > 0) {
        if (ii & 1) {
          val ^= dirs[j][bit];
        }
        ii >>>= 1;
        bit++;
      }
      val ^= shifts[j]; // scramble
      pt.push((val >>> 0) / 4_294_967_296);
    }
    pts.push(pt);
  }
  return pts;
}

// ─── GP Construction ──────────────────────────────────────────────────

/** Create a synthetic GP with n training points in d dimensions. */
function createSyntheticGP(n: number, d: number, seed: number = 42): SingleTaskGP {
  const rng = makeRng(seed);

  // Random training data in [0,1]^d
  const trainX: Array<Array<number>> = [];
  for (let i = 0; i < n; i++) {
    const row: Array<number> = [];
    for (let j = 0; j < d; j++) {
      row.push(rng());
    }
    trainX.push(row);
  }

  // Random lengthscales (some short, some long — mimics real problems)
  const lengthscales: Array<number> = [];
  for (let j = 0; j < d; j++) {
    // First few dims have shorter lengthscales (more important)
    const base = j < d / 3 ? 0.1 : j < (2 * d) / 3 ? 0.5 : 2;
    lengthscales.push(base + rng() * 0.2);
  }

  // Generate Y from a simple function + noise
  const trainY: Array<number> = [];
  for (let i = 0; i < n; i++) {
    let y = 0;
    for (let j = 0; j < d; j++) {
      const x = trainX[i][j];
      y += Math.sin((2 * Math.PI * x) / lengthscales[j]) / (j + 1);
    }
    y += rng() * 0.1; // noise
    trainY.push(y);
  }

  const kernel: KernelState = {
    type: "Scale",
    outputscale: 1,
    base_kernel: {
      type: "RBF",
      lengthscale: lengthscales,
      active_dims: Array.from({ length: d }, (_, i) => i),
    },
  };

  // Input transform: identity (data already in [0,1])
  const offset = new Array(d).fill(0);
  const coefficient = new Array(d).fill(1);

  const state: GPModelState = {
    model_type: "SingleTaskGP",
    train_X: trainX,
    train_Y: trainY,
    kernel,
    mean_constant: 0,
    noise_variance: 0.01,
    input_transform: { offset, coefficient },
  };

  return new SingleTaskGP(state);
}

// ─── Prediction wrapper ───────────────────────────────────────────────

interface PredResult {
  mean: Float64Array;
  variance: Float64Array;
}

function batchPredict(model: SingleTaskGP, points: Array<Array<number>>): PredResult {
  const result = model.predict(points);
  return { mean: result.mean, variance: result.variance };
}

// ─── Min/Max estimation strategies ────────────────────────────────────

interface MinMaxResult {
  muMin: number;
  muMax: number;
  ciMin: number; // min of mu - 2*sigma
  ciMax: number; // max of mu + 2*sigma
  nPoints: number;
  walltime: number;
  nCalls: number;
}

/** Strategy 1: Pure random sampling. */
function estimateRandom(
  model: SingleTaskGP,
  d: number,
  nPoints: number,
  seed: number,
): MinMaxResult {
  const t0 = performance.now();
  const pts = randomUniform(nPoints, d, seed);
  const pred = batchPredict(model, pts);
  let muMin = Infinity,
    muMax = -Infinity;
  let ciMin = Infinity,
    ciMax = -Infinity;
  for (let i = 0; i < nPoints; i++) {
    const mu = pred.mean[i];
    const s2 = Math.sqrt(pred.variance[i]) * 2;
    if (mu < muMin) {
      muMin = mu;
    }
    if (mu > muMax) {
      muMax = mu;
    }
    if (mu - s2 < ciMin) {
      ciMin = mu - s2;
    }
    if (mu + s2 > ciMax) {
      ciMax = mu + s2;
    }
  }
  return { muMin, muMax, ciMin, ciMax, nPoints, walltime: performance.now() - t0, nCalls: 1 };
}

/** Strategy 2: Scrambled Halton sampling. */
function estimateHalton(
  model: SingleTaskGP,
  d: number,
  nPoints: number,
  seed: number,
): MinMaxResult {
  const t0 = performance.now();
  const pts = scrambledHalton(nPoints, d, seed);
  const pred = batchPredict(model, pts);
  let muMin = Infinity,
    muMax = -Infinity;
  let ciMin = Infinity,
    ciMax = -Infinity;
  for (let i = 0; i < nPoints; i++) {
    const mu = pred.mean[i];
    const s2 = Math.sqrt(pred.variance[i]) * 2;
    if (mu < muMin) {
      muMin = mu;
    }
    if (mu > muMax) {
      muMax = mu;
    }
    if (mu - s2 < ciMin) {
      ciMin = mu - s2;
    }
    if (mu + s2 > ciMax) {
      ciMax = mu + s2;
    }
  }
  return { muMin, muMax, ciMin, ciMax, nPoints, walltime: performance.now() - t0, nCalls: 1 };
}

/** Strategy 3: Sobol sampling. */
function estimateSobol(
  model: SingleTaskGP,
  d: number,
  nPoints: number,
  seed: number,
): MinMaxResult {
  const t0 = performance.now();
  const pts = generateSobol(nPoints, d, seed);
  const pred = batchPredict(model, pts);
  let muMin = Infinity,
    muMax = -Infinity;
  let ciMin = Infinity,
    ciMax = -Infinity;
  for (let i = 0; i < nPoints; i++) {
    const mu = pred.mean[i];
    const s2 = Math.sqrt(pred.variance[i]) * 2;
    if (mu < muMin) {
      muMin = mu;
    }
    if (mu > muMax) {
      muMax = mu;
    }
    if (mu - s2 < ciMin) {
      ciMin = mu - s2;
    }
    if (mu + s2 > ciMax) {
      ciMax = mu + s2;
    }
  }
  return { muMin, muMax, ciMin, ciMax, nPoints, walltime: performance.now() - t0, nCalls: 1 };
}

/** Strategy 4: Latin Hypercube Sampling. */
function estimateLHS(model: SingleTaskGP, d: number, nPoints: number, seed: number): MinMaxResult {
  const t0 = performance.now();
  const pts = lhs(nPoints, d, seed);
  const pred = batchPredict(model, pts);
  let muMin = Infinity,
    muMax = -Infinity;
  let ciMin = Infinity,
    ciMax = -Infinity;
  for (let i = 0; i < nPoints; i++) {
    const mu = pred.mean[i];
    const s2 = Math.sqrt(pred.variance[i]) * 2;
    if (mu < muMin) {
      muMin = mu;
    }
    if (mu > muMax) {
      muMax = mu;
    }
    if (mu - s2 < ciMin) {
      ciMin = mu - s2;
    }
    if (mu + s2 > ciMax) {
      ciMax = mu + s2;
    }
  }
  return { muMin, muMax, ciMin, ciMax, nPoints, walltime: performance.now() - t0, nCalls: 1 };
}

/** Strategy 5: Halton + multi-start optimization (finite differences). */
function estimateHaltonOptim(
  model: SingleTaskGP,
  d: number,
  nInitial: number,
  nStarts: number,
  nSteps: number,
  seed: number,
  target: "mu" | "ci" = "ci",
): MinMaxResult {
  const t0 = performance.now();
  let nCalls = 0;

  // Phase 1: Halton initial evaluation
  const pts = scrambledHalton(nInitial, d, seed);
  const pred = batchPredict(model, pts);
  nCalls++;

  // Find top candidates for max and min
  interface Candidate {
    pt: Array<number>;
    val: number;
  }
  const maxCands: Array<Candidate> = [];
  const minCands: Array<Candidate> = [];
  for (let i = 0; i < nInitial; i++) {
    const mu = pred.mean[i];
    const s = Math.sqrt(pred.variance[i]);
    const ciUp = mu + 2 * s;
    const ciLo = mu - 2 * s;
    const maxVal = target === "ci" ? ciUp : mu;
    const minVal = target === "ci" ? ciLo : mu;
    maxCands.push({ pt: pts[i].slice(), val: maxVal });
    minCands.push({ pt: pts[i].slice(), val: minVal });
  }

  maxCands.sort((a, b) => b.val - a.val);
  minCands.sort((a, b) => a.val - b.val);

  const topMax = maxCands.slice(0, nStarts);
  const topMin = minCands.slice(0, nStarts);

  // Phase 2: Local optimization via finite-difference gradient ascent/descent
  const lr = 0.02;
  const eps = 1e-4;

  function optimizePoint(startPt: Array<number>, maximize: boolean): Candidate {
    const pt = startPt.slice();
    let bestVal = maximize ? -Infinity : Infinity;
    let bestPt = pt.slice();

    for (let step = 0; step < nSteps; step++) {
      // Evaluate at current point + finite diff perturbations
      const batchPts: Array<Array<number>> = [pt.slice()];
      for (let j = 0; j < d; j++) {
        const ptPlus = pt.slice();
        ptPlus[j] = Math.min(1, pt[j] + eps);
        batchPts.push(ptPlus);
      }
      const pResult = batchPredict(model, batchPts);
      nCalls++;

      const mu0 = pResult.mean[0];
      const s0 = Math.sqrt(pResult.variance[0]);
      const val0 = target === "ci" ? (maximize ? mu0 + 2 * s0 : mu0 - 2 * s0) : mu0;

      if (maximize ? val0 > bestVal : val0 < bestVal) {
        bestVal = val0;
        bestPt = pt.slice();
      }

      // Compute gradient
      const grad: Array<number> = [];
      for (let j = 0; j < d; j++) {
        const muJ = pResult.mean[1 + j];
        const sJ = Math.sqrt(pResult.variance[1 + j]);
        const valJ = target === "ci" ? (maximize ? muJ + 2 * sJ : muJ - 2 * sJ) : muJ;
        grad.push((valJ - val0) / eps);
      }

      // Gradient step
      const gradNorm = Math.sqrt(grad.reduce((s, g) => s + g * g, 0));
      if (gradNorm < 1e-8) {
        break;
      }
      for (let j = 0; j < d; j++) {
        const stepJ = (lr * grad[j]) / gradNorm;
        pt[j] = Math.max(0, Math.min(1, pt[j] + (maximize ? stepJ : -stepJ)));
      }
    }
    return { pt: bestPt, val: bestVal };
  }

  let muMin = Infinity,
    muMax = -Infinity;
  let ciMin = Infinity,
    ciMax = -Infinity;

  // First pass: get CI range from initial samples
  for (let i = 0; i < nInitial; i++) {
    const mu = pred.mean[i];
    const s2 = Math.sqrt(pred.variance[i]) * 2;
    if (mu < muMin) {
      muMin = mu;
    }
    if (mu > muMax) {
      muMax = mu;
    }
    if (mu - s2 < ciMin) {
      ciMin = mu - s2;
    }
    if (mu + s2 > ciMax) {
      ciMax = mu + s2;
    }
  }

  // Optimize for max
  for (const cand of topMax) {
    const result = optimizePoint(cand.pt, true);
    // Re-evaluate to get both mu and ci
    const p = batchPredict(model, [result.pt]);
    nCalls++;
    const mu = p.mean[0];
    const s = Math.sqrt(p.variance[0]);
    if (mu > muMax) {
      muMax = mu;
    }
    if (mu + 2 * s > ciMax) {
      ciMax = mu + 2 * s;
    }
  }

  // Optimize for min
  for (const cand of topMin) {
    const result = optimizePoint(cand.pt, false);
    const p = batchPredict(model, [result.pt]);
    nCalls++;
    const mu = p.mean[0];
    const s = Math.sqrt(p.variance[0]);
    if (mu < muMin) {
      muMin = mu;
    }
    if (mu - 2 * s < ciMin) {
      ciMin = mu - 2 * s;
    }
  }

  return {
    muMin,
    muMax,
    ciMin,
    ciMax,
    nPoints: nInitial,
    walltime: performance.now() - t0,
    nCalls,
  };
}

/** Strategy 6: Halton + batched multi-start optimization (all perturbations in one call). */
function estimateHaltonOptimBatched(
  model: SingleTaskGP,
  d: number,
  nInitial: number,
  nStarts: number,
  nSteps: number,
  seed: number,
): MinMaxResult {
  const t0 = performance.now();
  let nCalls = 0;
  const eps = 1e-4;
  const lr = 0.02;

  // Phase 1: Halton
  const pts = scrambledHalton(nInitial, d, seed);
  const pred = batchPredict(model, pts);
  nCalls++;

  let muMin = Infinity,
    muMax = -Infinity;
  let ciMin = Infinity,
    ciMax = -Infinity;

  interface Cand {
    pt: Array<number>;
    ciUp: number;
    ciLo: number;
  }
  const cands: Array<Cand> = [];
  for (let i = 0; i < nInitial; i++) {
    const mu = pred.mean[i];
    const s = Math.sqrt(pred.variance[i]);
    const ciUp = mu + 2 * s;
    const ciLo = mu - 2 * s;
    if (mu < muMin) {
      muMin = mu;
    }
    if (mu > muMax) {
      muMax = mu;
    }
    if (ciLo < ciMin) {
      ciMin = ciLo;
    }
    if (ciUp > ciMax) {
      ciMax = ciUp;
    }
    cands.push({ pt: pts[i].slice(), ciUp, ciLo });
  }

  // Select top candidates for max(ciUp) and min(ciLo)
  cands.sort((a, b) => b.ciUp - a.ciUp);
  const maxPts = cands.slice(0, nStarts).map((c) => c.pt.slice());
  cands.sort((a, b) => a.ciLo - b.ciLo);
  const minPts = cands.slice(0, nStarts).map((c) => c.pt.slice());

  // Phase 2: Batched optimization
  // Each step: for each active point, build (1 + d) evaluation points,
  // batch them all into one predict call.
  for (let step = 0; step < nSteps; step++) {
    const allPts: Array<Array<number>> = [];
    const starts = maxPts.length + minPts.length;
    // For each start point: base + d perturbations
    for (const pt of [...maxPts, ...minPts]) {
      allPts.push(pt.slice());
      for (let j = 0; j < d; j++) {
        const ptP = pt.slice();
        ptP[j] = Math.min(1, pt[j] + eps);
        allPts.push(ptP);
      }
    }

    const pAll = batchPredict(model, allPts);
    nCalls++;

    // Process each start point
    let offset = 0;
    for (let si = 0; si < starts; si++) {
      const isMax = si < maxPts.length;
      const pt = isMax ? maxPts[si] : minPts[si - maxPts.length];

      const mu0 = pAll.mean[offset];
      const s0 = Math.sqrt(pAll.variance[offset]);
      const val0 = isMax ? mu0 + 2 * s0 : mu0 - 2 * s0;

      // Update global min/max
      if (mu0 > muMax) {
        muMax = mu0;
      }
      if (mu0 < muMin) {
        muMin = mu0;
      }
      if (mu0 + 2 * s0 > ciMax) {
        ciMax = mu0 + 2 * s0;
      }
      if (mu0 - 2 * s0 < ciMin) {
        ciMin = mu0 - 2 * s0;
      }

      // Gradient
      const grad: Array<number> = [];
      for (let j = 0; j < d; j++) {
        const muJ = pAll.mean[offset + 1 + j];
        const sJ = Math.sqrt(pAll.variance[offset + 1 + j]);
        const valJ = isMax ? muJ + 2 * sJ : muJ - 2 * sJ;
        grad.push((valJ - val0) / eps);
      }

      const gradNorm = Math.sqrt(grad.reduce((s, g) => s + g * g, 0));
      if (gradNorm > 1e-8) {
        for (let j = 0; j < d; j++) {
          pt[j] = Math.max(0, Math.min(1, pt[j] + ((isMax ? 1 : -1) * lr * grad[j]) / gradNorm));
        }
      }

      offset += 1 + d;
    }
  }

  return {
    muMin,
    muMax,
    ciMin,
    ciMax,
    nPoints: nInitial,
    walltime: performance.now() - t0,
    nCalls,
  };
}

// ─── Ground truth via dense sampling ──────────────────────────────────

function groundTruth(model: SingleTaskGP, d: number, nDense: number = 10_000): MinMaxResult {
  const t0 = performance.now();
  const pts = scrambledHalton(nDense, d, 999);
  // Batch in chunks to avoid memory issues
  const chunkSize = 2000;
  let muMin = Infinity,
    muMax = -Infinity;
  let ciMin = Infinity,
    ciMax = -Infinity;
  let nCalls = 0;
  for (let start = 0; start < nDense; start += chunkSize) {
    const chunk = pts.slice(start, start + chunkSize);
    const pred = batchPredict(model, chunk);
    nCalls++;
    for (let i = 0; i < chunk.length; i++) {
      const mu = pred.mean[i];
      const s = Math.sqrt(pred.variance[i]);
      if (mu < muMin) {
        muMin = mu;
      }
      if (mu > muMax) {
        muMax = mu;
      }
      if (mu - 2 * s < ciMin) {
        ciMin = mu - 2 * s;
      }
      if (mu + 2 * s > ciMax) {
        ciMax = mu + 2 * s;
      }
    }
  }
  return { muMin, muMax, ciMin, ciMax, nPoints: nDense, walltime: performance.now() - t0, nCalls };
}

// ─── Benchmark runner ─────────────────────────────────────────────────

interface BenchResult {
  d: number;
  N: number;
  strategy: string;
  nSamplePoints: number;
  walltime: number;
  nCalls: number;
  muRangeError: number; // relative error in mu range
  ciRangeError: number; // relative error in CI range
  muMinError: number;
  muMaxError: number;
  ciMinError: number;
  ciMaxError: number;
}

function runBenchmark(
  d: number,
  N: number,
  sampleSizes: Array<number>,
  nTrials: number = 5,
): Array<BenchResult> {
  const results: Array<BenchResult> = [];

  for (let trial = 0; trial < nTrials; trial++) {
    const model = createSyntheticGP(N, d, trial * 1000 + d * 100 + N);

    // Ground truth
    const nDense = d <= 8 ? 20_000 : d <= 32 ? 10_000 : 5000;
    const gt = groundTruth(model, d, nDense);
    const gtMuRange = gt.muMax - gt.muMin;
    const gtCiRange = gt.ciMax - gt.ciMin;

    function score(est: MinMaxResult, strategy: string, nSP: number): BenchResult {
      const muRange = est.muMax - est.muMin;
      const ciRange = est.ciMax - est.ciMin;
      return {
        d,
        N,
        strategy,
        nSamplePoints: nSP,
        walltime: est.walltime,
        nCalls: est.nCalls,
        muRangeError: gtMuRange > 0 ? (gtMuRange - muRange) / gtMuRange : 0,
        ciRangeError: gtCiRange > 0 ? (gtCiRange - ciRange) / gtCiRange : 0,
        muMinError: gtMuRange > 0 ? (est.muMin - gt.muMin) / gtMuRange : 0,
        muMaxError: gtMuRange > 0 ? (gt.muMax - est.muMax) / gtMuRange : 0,
        ciMinError: gtCiRange > 0 ? (est.ciMin - gt.ciMin) / gtCiRange : 0,
        ciMaxError: gtCiRange > 0 ? (gt.ciMax - est.ciMax) / gtCiRange : 0,
      };
    }

    for (const nPts of sampleSizes) {
      const seed = trial * 7 + 1;
      results.push(score(estimateRandom(model, d, nPts, seed), "random", nPts));
      results.push(score(estimateHalton(model, d, nPts, seed), "halton", nPts));
      results.push(score(estimateLHS(model, d, nPts, seed), "lhs", nPts));
      results.push(score(estimateSobol(model, d, nPts, seed), "sobol", nPts));

      // Optimization variants: use nPts as initial, optimize from top 4
      if (nPts >= 32) {
        results.push(
          score(estimateHaltonOptim(model, d, nPts, 4, 5, seed), "halton+optim(4,5)", nPts),
        );
        results.push(
          score(
            estimateHaltonOptimBatched(model, d, nPts, 4, 5, seed),
            "halton+batchOptim(4,5)",
            nPts,
          ),
        );
        results.push(
          score(
            estimateHaltonOptimBatched(model, d, nPts, 8, 10, seed),
            "halton+batchOptim(8,10)",
            nPts,
          ),
        );
      }
    }
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────

function aggregateResults(results: Array<BenchResult>): Map<
  string,
  {
    d: number;
    N: number;
    strategy: string;
    nSamplePoints: number;
    meanWalltime: number;
    meanMuRangeErr: number;
    meanCiRangeErr: number;
    maxMuRangeErr: number;
    maxCiRangeErr: number;
    meanCalls: number;
  }
> {
  const groups = new Map<string, Array<BenchResult>>();
  for (const r of results) {
    const key = `${r.d}-${r.N}-${r.strategy}-${r.nSamplePoints}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(r);
  }

  const agg = new Map<string, any>();
  for (const [key, rs] of groups) {
    const n = rs.length;
    agg.set(key, {
      d: rs[0].d,
      N: rs[0].N,
      strategy: rs[0].strategy,
      nSamplePoints: rs[0].nSamplePoints,
      meanWalltime: rs.reduce((s, r) => s + r.walltime, 0) / n,
      meanMuRangeErr: rs.reduce((s, r) => s + r.muRangeError, 0) / n,
      meanCiRangeErr: rs.reduce((s, r) => s + r.ciRangeError, 0) / n,
      maxMuRangeErr: Math.max(...rs.map((r) => r.muRangeError)),
      maxCiRangeErr: Math.max(...rs.map((r) => r.ciRangeError)),
      meanCalls: rs.reduce((s, r) => s + r.nCalls, 0) / n,
    });
  }
  return agg;
}

console.log("=== estimateMinMax Benchmark ===\n");

const allResults: Array<BenchResult> = [];
const configs: Array<[number, number]> = [
  [2, 16],
  [2, 128],
  [4, 16],
  [4, 128],
  [8, 16],
  [8, 128],
  [8, 256],
  [16, 128],
  [16, 256],
  [32, 128],
];
const sampleSizes = [32, 64, 128, 256, 512];

for (const [d, N] of configs) {
  console.log(`Benchmarking d=${d}, N=${N}...`);
  const results = runBenchmark(d, N, sampleSizes, 3);
  allResults.push(...results);
}

const agg = aggregateResults(allResults);

// Print table
console.log("\n" + "─".repeat(130));
console.log(
  "d".padStart(3) +
    " " +
    "N".padStart(4) +
    " " +
    "Strategy".padEnd(28) +
    " " +
    "nPts".padStart(5) +
    " " +
    "calls".padStart(5) +
    " " +
    "ms".padStart(8) +
    " " +
    "μ-err%".padStart(8) +
    " " +
    "CI-err%".padStart(8) +
    " " +
    "μ-max%".padStart(8) +
    " " +
    "CI-max%".padStart(8),
);
console.log("─".repeat(130));

// Sort by d, N, nPts, strategy
const sorted = [...agg.values()].sort(
  (a, b) =>
    a.d - b.d ||
    a.N - b.N ||
    a.nSamplePoints - b.nSamplePoints ||
    a.strategy.localeCompare(b.strategy),
);

for (const r of sorted) {
  console.log(
    String(r.d).padStart(3) +
      " " +
      String(r.N).padStart(4) +
      " " +
      r.strategy.padEnd(28) +
      " " +
      String(r.nSamplePoints).padStart(5) +
      " " +
      r.meanCalls.toFixed(0).padStart(5) +
      " " +
      r.meanWalltime.toFixed(1).padStart(8) +
      " " +
      (r.meanMuRangeErr * 100).toFixed(1).padStart(8) +
      " " +
      (r.meanCiRangeErr * 100).toFixed(1).padStart(8) +
      " " +
      (r.maxMuRangeErr * 100).toFixed(1).padStart(8) +
      " " +
      (r.maxCiRangeErr * 100).toFixed(1).padStart(8),
  );
}

// Write JSON for HTML report generation
const jsonPath = "/tmp/bench_minmax_results.json";
const fs = await import("node:fs");
fs.writeFileSync(jsonPath, JSON.stringify(sorted, null, 2));
console.log(`\nResults written to ${jsonPath}`);
