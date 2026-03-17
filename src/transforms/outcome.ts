/**
 * Outcome (un)transforms for GP predictions.
 *
 * BoTorch trains models on transformed Y values (e.g., standardized, log-transformed).
 * After prediction, we must un-transform the posterior mean and variance back to
 * the original space. Each transform class implements the inverse mapping.
 *
 * The joint `untransform(mu, variance)` interface is essential: nonlinear transforms
 * (Log, Bilog, Power) need both mean and variance to correctly propagate uncertainty.
 *
 * These are MODEL-LEVEL transforms stored in `model.outcome_transform`.
 * Adapter-level transforms (LogY, BilogY, etc.) are applied by Ax BEFORE data
 * reaches BoTorch and are NOT in the model state — those are metadata-only,
 * handled by the caller.
 */

/**
 * Interface for all outcome untransforms.
 * Takes joint (mean, variance) in transformed space, returns (mean, variance)
 * in original space.
 */
export interface OutcomeUntransform {
  untransform(mu: number, variance: number): { mean: number; variance: number };
  /**
   * Scale a covariance value from transformed space to original space.
   * For linear transforms (Standardize): cov_orig = std² * cov_transformed.
   * For nonlinear transforms: returns raw GP covariance (no scaling applied),
   * since exact covariance untransform requires the full joint distribution.
   */
  untransformCovariance(cov: number): number;
}

/**
 * Standardize un-transformation.
 * BoTorch stores train_Y in standardized space (zero mean, unit variance).
 * Un-standardize: y = offset + scale * y_standardized
 * Linear transform, so exact: Var[a + b*Y] = b² Var[Y]
 */
export class StandardizeUntransform implements OutcomeUntransform {
  readonly mean: number;
  readonly std: number;

  constructor(mean: number, std: number) {
    this.mean = mean;
    this.std = std;
  }

  untransform(mu: number, variance: number): { mean: number; variance: number } {
    return {
      mean: this.mean + this.std * mu,
      variance: this.std * this.std * variance,
    };
  }

  untransformCovariance(cov: number): number {
    return this.std * this.std * cov;
  }
}

/**
 * Log un-transformation using exact log-normal distribution formulas.
 *
 * BoTorch trains on log(Y). The GP posterior gives (mu, sigma²) in log-space.
 * Since exp(Normal) = LogNormal, we have exact closed-form moments:
 *   E[Y] = exp(mu + sigma²/2)
 *   Var[Y] = (exp(sigma²) - 1) * exp(2*mu + sigma²)
 *
 * This matches BoTorch's `norm_to_lognorm_mean` and `norm_to_lognorm_variance`
 * in `botorch/models/transforms/utils.py`.
 */
export class LogUntransform implements OutcomeUntransform {
  untransform(mu: number, variance: number): { mean: number; variance: number } {
    return {
      mean: Math.exp(mu + variance / 2),
      variance: Math.expm1(variance) * Math.exp(2 * mu + variance),
    };
  }

  untransformCovariance(cov: number): number {
    return cov; // Nonlinear — no exact covariance scaling
  }
}

/**
 * Bilog un-transformation with delta method variance propagation.
 *
 * Bilog: sign(y) * log(|y| + 1) — symmetric log for signed data near zero.
 * Inverse: sign(z) * (exp(|z|) - 1)
 *
 * BoTorch provides NO analytic mean/variance for Bilog (only sample_transform).
 * We use the delta method: Var[f⁻¹(Y)] ≈ (f⁻¹)'(μ)² · Var[Y]
 * where (f⁻¹)'(z) = exp(|z|), so Var_original ≈ exp(2|μ|) · Var_transformed.
 */
export class BilogUntransform implements OutcomeUntransform {
  untransform(mu: number, variance: number): { mean: number; variance: number } {
    const absmu = Math.abs(mu);
    const deriv = Math.exp(absmu); // (f⁻¹)'(mu) = exp(|mu|)
    return {
      mean: mu >= 0 ? Math.exp(mu) - 1 : -(Math.exp(-mu) - 1),
      variance: deriv * deriv * variance,
    };
  }

  untransformCovariance(cov: number): number {
    return cov; // Nonlinear — no exact covariance scaling
  }
}

/**
 * Power (Yeo-Johnson) un-transformation with delta method variance propagation.
 *
 * Yeo-Johnson with parameter lambda. The inverse and its derivative depend on
 * the sign of z and the value of lambda.
 *
 * BoTorch provides NO analytic mean/variance for Power (only sample_transform).
 * We use the delta method: Var[f⁻¹(Y)] ≈ (f⁻¹)'(μ)² · Var[Y].
 */
export class PowerUntransform implements OutcomeUntransform {
  readonly power: number;
  readonly scalerMean: number | undefined;
  readonly scalerScale: number | undefined;

  /**
   * @param power - Yeo-Johnson lambda parameter
   * @param scalerMean - sklearn PowerTransformer's built-in scaler mean
   * @param scalerScale - sklearn PowerTransformer's built-in scaler scale (std)
   *
   * sklearn's PowerTransformer standardizes AFTER the YJ transform.
   * To invert: un-standardize first (z * scale + mean), then inverse YJ.
   *
   * Variance is propagated using CI-width matching (same as Ax), not delta
   * method, because the YJ inverse can be highly nonlinear and the delta
   * method underestimates variance.
   */
  constructor(
    power: number,
    scalerMean?: number,
    scalerScale?: number,
  ) {
    this.power = power;
    this.scalerMean = scalerMean;
    this.scalerScale = scalerScale;
  }

  untransform(mu: number, variance: number): { mean: number; variance: number } {
    // Full inverse: un-standardize (scaler) then inverse YJ
    const fullInverse = (z: number) => {
      let v = z;
      if (this.scalerScale !== undefined && this.scalerMean !== undefined) {
        v = v * this.scalerScale + this.scalerMean;
      }
      return this._inverseYeoJohnson(v);
    };

    const newMean = fullInverse(mu);

    // CI-width matching (matches Ax's match_ci_width):
    // Transform the CI endpoints and find variance that preserves CI width
    const FAC = 1.959963984540054; // norm.ppf(0.975) for 95% CI
    const sem = Math.sqrt(variance);
    const right = fullInverse(mu + FAC * sem);
    const left = fullInverse(mu - FAC * sem);
    const newSem = (right - left) / (2 * FAC);

    return {
      mean: newMean,
      variance: newSem * newSem,
    };
  }

  untransformCovariance(cov: number): number {
    return cov; // Nonlinear — no exact covariance scaling
  }

  private _inverseYeoJohnson(z: number): number {
    const lam = this.power;
    if (z >= 0) {
      if (Math.abs(lam) < 1e-10) {
        // lam ≈ 0: forward was log(y+1), inverse is exp(z) - 1
        return Math.exp(z) - 1;
      }
      // forward was ((y+1)^lam - 1) / lam, inverse:
      return Math.pow(z * lam + 1, 1 / lam) - 1;
    } else {
      if (Math.abs(lam - 2) < 1e-10) {
        // lam ≈ 2: forward was -log(-y+1), inverse is 1 - exp(-z)
        return 1 - Math.exp(-z);
      }
      // forward was -((-y+1)^(2-lam) - 1) / (2-lam), inverse:
      return 1 - Math.pow(-z * (2 - lam) + 1, 1 / (2 - lam));
    }
  }

}

/**
 * Chained outcome un-transformation.
 * Applies a sequence of transforms in REVERSE order (since we're un-transforming).
 * If BoTorch applied Log → Standardize (forward), we undo Standardize → Log (reverse).
 *
 * Each step receives the joint (mean, variance) from the previous step, which is
 * critical for nonlinear transforms that need both to propagate uncertainty.
 */
export class ChainedOutcomeUntransform implements OutcomeUntransform {
  readonly transforms: OutcomeUntransform[];

  constructor(transforms: OutcomeUntransform[]) {
    // Store in reverse order for un-transformation
    this.transforms = [...transforms].reverse();
  }

  untransform(mu: number, variance: number): { mean: number; variance: number } {
    let result = { mean: mu, variance };
    for (const tf of this.transforms) {
      result = tf.untransform(result.mean, result.variance);
    }
    return result;
  }

  untransformCovariance(cov: number): number {
    let result = cov;
    for (const tf of this.transforms) {
      result = tf.untransformCovariance(result);
    }
    return result;
  }
}
