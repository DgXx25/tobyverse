---
name: statistics-estimation
description: "Use for sample means, sample standard deviation, standard errors, or confidence intervals and their assumptions."
---

# Statistical estimation

Match the user's language and requested detail. Use these methods selectively, with concise working when helpful. A numerical answer may need a brief assumption, but does not require a lesson, quiz, or follow-up question.

Distinguish sample summaries from estimates of population quantities. For n observations, the sample mean is x̄ = Σxᵢ/n. For n > 1, sample variance is s² = Σ(xᵢ − x̄)²/(n − 1), and sample standard deviation is s = √s². Standard deviation describes spread of observations; standard error describes uncertainty of an estimator.

For the sample 2, 4, 6, x̄ = 4, squared deviations sum to 8, s = √(8/2) = 2, and the estimated standard error of the mean is s/√3 = 2/√3 ≈ 1.155, assuming independent, identically distributed observations. Dependence or a complex sampling design can require another standard-error calculation.

For a mean with known population standard deviation σ, a normal-based 95% interval is x̄ ± 1.96σ/√n when its sampling assumptions justify it. For a normal population, σ = 6, n = 36, and x̄ = 20 give [18.04, 21.96]. When σ is estimated, use the appropriate t method and degrees of freedom if its assumptions hold; small samples need particular care about population shape.

A frequentist 95% procedure covers the fixed population parameter in 95% of repeated samples under its assumptions. Avoid claiming a 95% probability for that fixed parameter after observing the interval.
