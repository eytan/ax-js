// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Benchmark: CMA-ES vs Halton+batchOptim for GP posterior min/max estimation.
 *
 * Compares a minimal CMA-ES optimizer against the batched finite-difference
 * gradient approach for finding extrema of GP posterior CI bounds.
 *
 * Run: npx tsx test/bench_cmaes.ts
 */

import type { GPModelState, KernelState } from "../src/models/types.js";

import { SingleTaskGP } from "../src/models/single_task.js";

// ─── Helpers (shared with bench_minmax.ts) ────────────────────────────

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

function halton(index: number, base: number): number {
  let f = 1,
    r = 0,
    i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
  101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193,
  197, 199, 211, 223, 227, 229, 233, 239, 241, 251,
];

function scrambledHalton(n: number, d: number, seed: number = 42): Array<Array<number>> {
  const rng = makeRng(seed);
  const shifts = Array.from({ length: d }, () => rng());
  const pts: Array<Array<number>> = [];
  for (let i = 0; i < n; i++) {
    const pt: Array<number> = [];
    for (let j = 0; j < d; j++) {
      pt.push((halton(i + 1, PRIMES[j % PRIMES.length]) + shifts[j]) % 1);
    }
    pts.push(pt);
  }
  return pts;
}

// ─── GP Construction ──────────────────────────────────────────────────

function createSyntheticGP(n: number, d: number, seed: number = 42): SingleTaskGP {
  const rng = makeRng(seed);
  const trainX: Array<Array<number>> = [];
  for (let i = 0; i < n; i++) {
    const row: Array<number> = [];
    for (let j = 0; j < d; j++) {
      row.push(rng());
    }
    trainX.push(row);
  }
  const lengthscales: Array<number> = [];
  for (let j = 0; j < d; j++) {
    const base = j < d / 3 ? 0.1 : j < (2 * d) / 3 ? 0.5 : 2;
    lengthscales.push(base + rng() * 0.2);
  }
  const trainY: Array<number> = [];
  for (let i = 0; i < n; i++) {
    let y = 0;
    for (let j = 0; j < d; j++) {
      y += Math.sin((2 * Math.PI * trainX[i][j]) / lengthscales[j]) / (j + 1);
    }
    y += rng() * 0.1;
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
  const state: GPModelState = {
    model_type: "SingleTaskGP",
    train_X: trainX,
    train_Y: trainY,
    kernel,
    mean_constant: 0,
    noise_variance: 0.01,
    input_transform: { offset: new Array(d).fill(0), coefficient: new Array(d).fill(1) },
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

// ─── Minimal CMA-ES (box-constrained, d≤20) ──────────────────────────

interface CMAESOptions {
  maxGenerations: number;
  lambda?: number; // population size; default 4+3*ln(d)
  sigma0?: number; // initial step size; default 0.3
  tolFun?: number; // stop if best-worst < tolFun; default 1e-10
}

/**
 * Minimal CMA-ES optimizer for box-constrained [0,1]^d problems.
 * Minimizes f(x). For maximization, negate the objective.
 *
 * Returns { bestX, bestF, nEvals } where nEvals counts f evaluations.
 * evaluatePopulation(points: number[][]): number[] is called once per generation.
 */
function cmaes(
  d: number,
  x0: Array<number>,
  evaluatePopulation: (pts: Array<Array<number>>) => Array<number>,
  opts: CMAESOptions,
): { bestX: Array<number>; bestF: number; nEvals: number } {
  const lambda = opts.lambda ?? Math.max(4, Math.floor(4 + 3 * Math.log(d)));
  const mu = Math.floor(lambda / 2);
  const sigma0 = opts.sigma0 ?? 0.3;
  const tolFun = opts.tolFun ?? 1e-10;

  // Weights
  const rawW = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
  const sumW = rawW.reduce((a, b) => a + b, 0);
  const w = rawW.map((v) => v / sumW);
  const muEff = 1 / w.reduce((s, wi) => s + wi * wi, 0);

  // Adaptation parameters
  const cc = (4 + muEff / d) / (d + 4 + (2 * muEff) / d);
  const cs = (muEff + 2) / (d + muEff + 5);
  const c1 = 2 / ((d + 1.3) * (d + 1.3) + muEff);
  const cmu = Math.min(1 - c1, (2 * (muEff - 2 + 1 / muEff)) / ((d + 2) * (d + 2) + muEff));
  const damps = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (d + 1)) - 1) + cs;
  const chiN = Math.sqrt(d) * (1 - 1 / (4 * d) + 1 / (21 * d * d));

  // State
  let mean = x0.slice();
  let sigma = sigma0;
  // C stored as flat array (symmetric d x d), start with identity
  const C = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    C[i * d + i] = 1;
  }
  const pc = new Float64Array(d); // evolution path for C
  const ps = new Float64Array(d); // evolution path for sigma
  // Eigendecomposition: B = eigenvectors (columns), D = eigenvalues
  const B = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    B[i * d + i] = 1;
  }
  const diagD = new Float64Array(d);
  diagD.fill(1);

  let bestX = x0.slice();
  let bestF = Infinity;
  let nEvals = 0;
  let eigenUpdateCounter = 0;

  // Simple eigendecomposition for symmetric matrix (Jacobi rotation)
  function eigenDecomp(): void {
    // Copy C into working matrix
    const A = new Float64Array(C);
    const V = new Float64Array(d * d);
    for (let i = 0; i < d; i++) {
      V[i * d + i] = 1;
    }

    for (let sweep = 0; sweep < 50; sweep++) {
      let offDiag = 0;
      for (let p = 0; p < d; p++) {
        for (let q = p + 1; q < d; q++) {
          offDiag += A[p * d + q] * A[p * d + q];
        }
      }
      if (offDiag < 1e-30) {
        break;
      }

      for (let p = 0; p < d - 1; p++) {
        for (let q = p + 1; q < d; q++) {
          if (Math.abs(A[p * d + q]) < 1e-15) {
            continue;
          }
          const tau = (A[q * d + q] - A[p * d + p]) / (2 * A[p * d + q]);
          const t = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
          const c = 1 / Math.sqrt(1 + t * t);
          const s = t * c;
          // Rotate
          const app = A[p * d + p],
            aqq = A[q * d + q],
            apq = A[p * d + q];
          A[p * d + p] = app - t * apq;
          A[q * d + q] = aqq + t * apq;
          A[p * d + q] = 0;
          A[q * d + p] = 0;
          for (let r = 0; r < d; r++) {
            if (r === p || r === q) {
              continue;
            }
            const arp = A[r * d + p],
              arq = A[r * d + q];
            A[r * d + p] = c * arp - s * arq;
            A[p * d + r] = A[r * d + p];
            A[r * d + q] = s * arp + c * arq;
            A[q * d + r] = A[r * d + q];
          }
          for (let r = 0; r < d; r++) {
            const vrp = V[r * d + p],
              vrq = V[r * d + q];
            V[r * d + p] = c * vrp - s * vrq;
            V[r * d + q] = s * vrp + c * vrq;
          }
        }
      }
    }
    for (let i = 0; i < d; i++) {
      diagD[i] = Math.sqrt(Math.max(A[i * d + i], 1e-20));
    }
    B.set(V);
  }

  // Simple RNG for sampling
  const rng = makeRng(Math.floor(x0[0] * 1e6 + d * 137));
  function randn(): number {
    // Box-Muller
    const u1 = rng() || 1e-10;
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  for (let gen = 0; gen < opts.maxGenerations; gen++) {
    // Update eigendecomposition periodically
    if (eigenUpdateCounter >= 1 / (10 * (c1 + cmu) * d + 1e-20) || gen === 0) {
      eigenDecomp();
      eigenUpdateCounter = 0;
    }

    // Sample population
    const population: Array<Array<number>> = [];
    const z: Array<Array<number>> = []; // standard normal vectors
    const y: Array<Array<number>> = []; // B * D * z vectors
    for (let k = 0; k < lambda; k++) {
      const zk: Array<number> = [];
      const yk: Array<number> = [];
      for (let i = 0; i < d; i++) {
        zk.push(randn());
      }
      // yk = B * D * zk
      for (let i = 0; i < d; i++) {
        let v = 0;
        for (let j = 0; j < d; j++) {
          v += B[i * d + j] * diagD[j] * zk[j];
        }
        yk.push(v);
      }
      // xk = mean + sigma * yk, clamped to [0,1]
      const xk: Array<number> = [];
      for (let i = 0; i < d; i++) {
        xk.push(Math.max(0, Math.min(1, mean[i] + sigma * yk[i])));
      }
      z.push(zk);
      y.push(yk);
      population.push(xk);
    }

    // Evaluate
    const fvals = evaluatePopulation(population);
    nEvals += lambda;

    // Sort by fitness
    const indices = Array.from({ length: lambda }, (_, i) => i);
    indices.sort((a, b) => fvals[a] - fvals[b]);

    // Update best
    if (fvals[indices[0]] < bestF) {
      bestF = fvals[indices[0]];
      bestX = population[indices[0]].slice();
    }

    // Check convergence
    if (Math.abs(fvals[indices[0]] - fvals[indices[lambda - 1]]) < tolFun) {
      break;
    }

    // Weighted recombination
    const oldMean = mean.slice();
    mean = new Array(d).fill(0);
    for (let k = 0; k < mu; k++) {
      const idx = indices[k];
      for (let i = 0; i < d; i++) {
        mean[i] += w[k] * population[idx][i];
      }
    }
    // Clamp mean
    for (let i = 0; i < d; i++) {
      mean[i] = Math.max(0, Math.min(1, mean[i]));
    }

    // Compute weighted step in y-space
    const yw: Array<number> = new Array(d).fill(0);
    for (let i = 0; i < d; i++) {
      yw[i] = (mean[i] - oldMean[i]) / sigma;
    }

    // Invert B to get step in z-space for ps update
    // ps = (1-cs)*ps + sqrt(cs*(2-cs)*muEff) * C^{-1/2} * yw
    // C^{-1/2} * yw = B * D^{-1} * B^T * yw
    const BtYw = new Array(d).fill(0);
    for (let j = 0; j < d; j++) {
      let v = 0;
      for (let i = 0; i < d; i++) {
        v += B[i * d + j] * yw[i];
      }
      BtYw[j] = v / diagD[j];
    }
    const invsqrtCyw = new Array(d).fill(0);
    for (let i = 0; i < d; i++) {
      let v = 0;
      for (let j = 0; j < d; j++) {
        v += B[i * d + j] * BtYw[j];
      }
      invsqrtCyw[i] = v;
    }

    const csF = Math.sqrt(cs * (2 - cs) * muEff);
    for (let i = 0; i < d; i++) {
      ps[i] = (1 - cs) * ps[i] + csF * invsqrtCyw[i];
    }

    const psNorm = Math.sqrt(ps.reduce((s, v) => s + v * v, 0));
    const hsig =
      psNorm / Math.sqrt(1 - Math.pow(1 - cs, 2 * (gen + 1))) / chiN < 1.4 + 2 / (d + 1) ? 1 : 0;

    // Update pc
    const ccF = Math.sqrt(cc * (2 - cc) * muEff);
    for (let i = 0; i < d; i++) {
      pc[i] = (1 - cc) * pc[i] + hsig * ccF * yw[i];
    }

    // Update C
    const c1a = c1 * (1 - (1 - hsig * hsig) * cc * (2 - cc));
    for (let i = 0; i < d; i++) {
      for (let j = i; j < d; j++) {
        let rankMu = 0;
        for (let k = 0; k < mu; k++) {
          const idx = indices[k];
          rankMu += w[k] * y[idx][i] * y[idx][j];
        }
        C[i * d + j] = (1 - c1a - cmu) * C[i * d + j] + c1 * pc[i] * pc[j] + cmu * rankMu;
        C[j * d + i] = C[i * d + j];
      }
    }

    // Update sigma
    sigma *= Math.exp((cs / damps) * (psNorm / chiN - 1));
    sigma = Math.min(sigma, 2); // clamp to avoid explosion

    eigenUpdateCounter++;
  }

  return { bestX, bestF, nEvals };
}

// ─── Min/Max estimation strategies ────────────────────────────────────

interface MinMaxResult {
  muMin: number;
  muMax: number;
  ciMin: number;
  ciMax: number;
  nPoints: number;
  walltime: number;
  nCalls: number;
}

/** Halton + batched gradient optimization (from bench_minmax.ts). */
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
    const ciUp = mu + 1.96 * s;
    const ciLo = mu - 1.96 * s;
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

  cands.sort((a, b) => b.ciUp - a.ciUp);
  const maxPts = cands.slice(0, nStarts).map((c) => c.pt.slice());
  cands.sort((a, b) => a.ciLo - b.ciLo);
  const minPts = cands.slice(0, nStarts).map((c) => c.pt.slice());

  for (let step = 0; step < nSteps; step++) {
    const allPts: Array<Array<number>> = [];
    const starts = maxPts.length + minPts.length;
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

    let offset = 0;
    for (let si = 0; si < starts; si++) {
      const isMax = si < maxPts.length;
      const pt = isMax ? maxPts[si] : minPts[si - maxPts.length];
      const mu0 = pAll.mean[offset];
      const s0 = Math.sqrt(pAll.variance[offset]);
      const val0 = isMax ? mu0 + 1.96 * s0 : mu0 - 1.96 * s0;
      if (mu0 > muMax) {
        muMax = mu0;
      }
      if (mu0 < muMin) {
        muMin = mu0;
      }
      if (mu0 + 1.96 * s0 > ciMax) {
        ciMax = mu0 + 1.96 * s0;
      }
      if (mu0 - 1.96 * s0 < ciMin) {
        ciMin = mu0 - 1.96 * s0;
      }

      const grad: Array<number> = [];
      for (let j = 0; j < d; j++) {
        const muJ = pAll.mean[offset + 1 + j];
        const sJ = Math.sqrt(pAll.variance[offset + 1 + j]);
        const valJ = isMax ? muJ + 1.96 * sJ : muJ - 1.96 * sJ;
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

/** Halton + CMA-ES optimization. */
function estimateHaltonCMAES(
  model: SingleTaskGP,
  d: number,
  nInitial: number,
  maxGens: number,
  seed: number,
): MinMaxResult {
  const t0 = performance.now();
  let nCalls = 0;

  // Phase 1: Halton initial evaluation
  const pts = scrambledHalton(nInitial, d, seed);
  const pred = batchPredict(model, pts);
  nCalls++;

  let muMin = Infinity,
    muMax = -Infinity;
  let ciMin = Infinity,
    ciMax = -Infinity;
  let bestMaxIdx = 0,
    bestMinIdx = 0;
  let bestCiUp = -Infinity,
    bestCiLo = Infinity;

  for (let i = 0; i < nInitial; i++) {
    const mu = pred.mean[i];
    const s = Math.sqrt(pred.variance[i]);
    const ciUp = mu + 1.96 * s;
    const ciLo = mu - 1.96 * s;
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
    if (ciUp > bestCiUp) {
      bestCiUp = ciUp;
      bestMaxIdx = i;
    }
    if (ciLo < bestCiLo) {
      bestCiLo = ciLo;
      bestMinIdx = i;
    }
  }

  // Phase 2: CMA-ES for maximizing ciUp (minimize -ciUp)
  const lambda = Math.max(4, Math.floor(4 + 3 * Math.log(d)));
  const resultMax = cmaes(
    d,
    pts[bestMaxIdx],
    (pop) => {
      const p = batchPredict(model, pop);
      nCalls++;
      const vals: Array<number> = [];
      for (let i = 0; i < pop.length; i++) {
        const mu = p.mean[i];
        const s = Math.sqrt(p.variance[i]);
        const ciUp = mu + 1.96 * s;
        // Track globals while we're at it
        if (mu > muMax) {
          muMax = mu;
        }
        if (mu < muMin) {
          muMin = mu;
        }
        if (ciUp > ciMax) {
          ciMax = ciUp;
        }
        if (mu - 1.96 * s < ciMin) {
          ciMin = mu - 1.96 * s;
        }
        vals.push(-ciUp); // minimize negative
      }
      return vals;
    },
    { maxGenerations: maxGens, lambda, sigma0: 0.3 },
  );

  // Phase 2b: CMA-ES for minimizing ciLo
  const resultMin = cmaes(
    d,
    pts[bestMinIdx],
    (pop) => {
      const p = batchPredict(model, pop);
      nCalls++;
      const vals: Array<number> = [];
      for (let i = 0; i < pop.length; i++) {
        const mu = p.mean[i];
        const s = Math.sqrt(p.variance[i]);
        const ciLo = mu - 1.96 * s;
        if (mu > muMax) {
          muMax = mu;
        }
        if (mu < muMin) {
          muMin = mu;
        }
        if (mu + 1.96 * s > ciMax) {
          ciMax = mu + 1.96 * s;
        }
        if (ciLo < ciMin) {
          ciMin = ciLo;
        }
        vals.push(ciLo); // already minimizing
      }
      return vals;
    },
    { maxGenerations: maxGens, lambda, sigma0: 0.3 },
  );

  // Final evaluation of best points
  const finalPts = [resultMax.bestX, resultMin.bestX];
  const pFinal = batchPredict(model, finalPts);
  nCalls++;
  for (let i = 0; i < 2; i++) {
    const mu = pFinal.mean[i];
    const s = Math.sqrt(pFinal.variance[i]);
    if (mu > muMax) {
      muMax = mu;
    }
    if (mu < muMin) {
      muMin = mu;
    }
    if (mu + 1.96 * s > ciMax) {
      ciMax = mu + 1.96 * s;
    }
    if (mu - 1.96 * s < ciMin) {
      ciMin = mu - 1.96 * s;
    }
  }

  const totalEvals = nInitial + resultMax.nEvals + resultMin.nEvals + 2;
  return {
    muMin,
    muMax,
    ciMin,
    ciMax,
    nPoints: totalEvals,
    walltime: performance.now() - t0,
    nCalls,
  };
}

// ─── Ground truth ─────────────────────────────────────────────────────

function groundTruth(model: SingleTaskGP, d: number, nDense: number = 20_000): MinMaxResult {
  const t0 = performance.now();
  const pts = scrambledHalton(nDense, d, 999);
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
      if (mu - 1.96 * s < ciMin) {
        ciMin = mu - 1.96 * s;
      }
      if (mu + 1.96 * s > ciMax) {
        ciMax = mu + 1.96 * s;
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
  muRangeError: number;
  ciRangeError: number;
  ciMinError: number;
  ciMaxError: number;
}

function runBenchmark(
  d: number,
  N: number,
  nInitial: number,
  nTrials: number = 3,
): Array<BenchResult> {
  const results: Array<BenchResult> = [];

  for (let trial = 0; trial < nTrials; trial++) {
    const model = createSyntheticGP(N, d, trial * 1000 + d * 100 + N);
    const gt = groundTruth(model, d, 20_000);
    const gtCiRange = gt.ciMax - gt.ciMin;
    const gtMuRange = gt.muMax - gt.muMin;

    function score(est: MinMaxResult, strategy: string): BenchResult {
      const muRange = est.muMax - est.muMin;
      const ciRange = est.ciMax - est.ciMin;
      return {
        d,
        N,
        strategy,
        nSamplePoints: est.nPoints,
        walltime: est.walltime,
        nCalls: est.nCalls,
        muRangeError: gtMuRange > 0 ? (gtMuRange - muRange) / gtMuRange : 0,
        ciRangeError: gtCiRange > 0 ? (gtCiRange - ciRange) / gtCiRange : 0,
        ciMinError: gtCiRange > 0 ? (est.ciMin - gt.ciMin) / gtCiRange : 0,
        ciMaxError: gtCiRange > 0 ? (gt.ciMax - est.ciMax) / gtCiRange : 0,
      };
    }

    const seed = trial * 7 + 1;

    // Pure Halton (baseline)
    results.push(
      score(
        (() => {
          const t0 = performance.now();
          const pts = scrambledHalton(nInitial, d, seed);
          const pred = batchPredict(model, pts);
          let muMin = Infinity,
            muMax = -Infinity,
            ciMin = Infinity,
            ciMax = -Infinity;
          for (let i = 0; i < nInitial; i++) {
            const mu = pred.mean[i];
            const s = Math.sqrt(pred.variance[i]);
            if (mu < muMin) {
              muMin = mu;
            }
            if (mu > muMax) {
              muMax = mu;
            }
            if (mu - 1.96 * s < ciMin) {
              ciMin = mu - 1.96 * s;
            }
            if (mu + 1.96 * s > ciMax) {
              ciMax = mu + 1.96 * s;
            }
          }
          return {
            muMin,
            muMax,
            ciMin,
            ciMax,
            nPoints: nInitial,
            walltime: performance.now() - t0,
            nCalls: 1,
          };
        })(),
        `halton(${nInitial})`,
      ),
    );

    // Halton + batchOptim (4 starts, 5 steps)
    results.push(
      score(estimateHaltonOptimBatched(model, d, nInitial, 4, 5, seed), `halton+batchOptim(4,5)`),
    );

    // Halton + batchOptim (8 starts, 10 steps)
    results.push(
      score(estimateHaltonOptimBatched(model, d, nInitial, 8, 10, seed), `halton+batchOptim(8,10)`),
    );

    // Halton + CMA-ES (10 generations)
    results.push(score(estimateHaltonCMAES(model, d, nInitial, 10, seed), `halton+cmaes(10gen)`));

    // Halton + CMA-ES (20 generations)
    results.push(score(estimateHaltonCMAES(model, d, nInitial, 20, seed), `halton+cmaes(20gen)`));

    // Halton + CMA-ES (30 generations)
    results.push(score(estimateHaltonCMAES(model, d, nInitial, 30, seed), `halton+cmaes(30gen)`));
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────

function aggregateResults(results: Array<BenchResult>): Array<any> {
  const groups = new Map<string, Array<BenchResult>>();
  for (const r of results) {
    const key = `${r.d}-${r.N}-${r.strategy}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(r);
  }

  const agg: Array<any> = [];
  for (const [, rs] of groups) {
    const n = rs.length;
    agg.push({
      d: rs[0].d,
      N: rs[0].N,
      strategy: rs[0].strategy,
      nSamplePoints: Math.round(rs.reduce((s, r) => s + r.nSamplePoints, 0) / n),
      meanWalltime: rs.reduce((s, r) => s + r.walltime, 0) / n,
      meanMuRangeErr: rs.reduce((s, r) => s + r.muRangeError, 0) / n,
      meanCiRangeErr: rs.reduce((s, r) => s + r.ciRangeError, 0) / n,
      maxCiRangeErr: Math.max(...rs.map((r) => r.ciRangeError)),
      meanCalls: rs.reduce((s, r) => s + r.nCalls, 0) / n,
      meanCiMinErr: rs.reduce((s, r) => s + r.ciMinError, 0) / n,
      meanCiMaxErr: rs.reduce((s, r) => s + r.ciMaxError, 0) / n,
    });
  }
  return agg;
}

console.log("=== CMA-ES vs Halton+batchOptim Benchmark ===\n");

const allResults: Array<BenchResult> = [];
const configs: Array<[number, number, number]> = [
  // [d, N, nInitial]
  [4, 128, 128],
  [4, 128, 256],
  [8, 128, 128],
  [8, 128, 256],
  [8, 256, 128],
  [8, 256, 256],
  [16, 128, 128],
  [16, 128, 256],
];

for (const [d, N, nInit] of configs) {
  console.log(`Benchmarking d=${d}, N=${N}, nInitial=${nInit}...`);
  const results = runBenchmark(d, N, nInit, 3);
  allResults.push(...results);
}

const agg = aggregateResults(allResults);
const sorted = agg.sort(
  (a: any, b: any) => a.d - b.d || a.N - b.N || a.strategy.localeCompare(b.strategy),
);

// Print table
const hdr =
  "d".padStart(3) +
  " " +
  "N".padStart(4) +
  " " +
  "Strategy".padEnd(30) +
  " " +
  "nPts".padStart(6) +
  " " +
  "calls".padStart(6) +
  " " +
  "ms".padStart(9) +
  " " +
  "mu-err%".padStart(9) +
  " " +
  "CI-err%".padStart(9) +
  " " +
  "CI-max%".padStart(9) +
  " " +
  "ciMin-e%".padStart(9) +
  " " +
  "ciMax-e%".padStart(9);

console.log("\n" + "-".repeat(hdr.length));
console.log(hdr);
console.log("-".repeat(hdr.length));

for (const r of sorted) {
  console.log(
    String(r.d).padStart(3) +
      " " +
      String(r.N).padStart(4) +
      " " +
      r.strategy.padEnd(30) +
      " " +
      String(r.nSamplePoints).padStart(6) +
      " " +
      r.meanCalls.toFixed(0).padStart(6) +
      " " +
      r.meanWalltime.toFixed(1).padStart(9) +
      " " +
      (r.meanMuRangeErr * 100).toFixed(2).padStart(9) +
      " " +
      (r.meanCiRangeErr * 100).toFixed(2).padStart(9) +
      " " +
      (r.maxCiRangeErr * 100).toFixed(2).padStart(9) +
      " " +
      (r.meanCiMinErr * 100).toFixed(2).padStart(9) +
      " " +
      (r.meanCiMaxErr * 100).toFixed(2).padStart(9),
  );
}

// Write JSON
const jsonPath = "/tmp/cmaes_bench_results.json";
const fs = await import("node:fs");
fs.writeFileSync(jsonPath, JSON.stringify(sorted, null, 2));
console.log(`\nResults written to ${jsonPath}`);
