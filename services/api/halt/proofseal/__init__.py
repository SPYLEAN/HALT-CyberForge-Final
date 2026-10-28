"""ProofSeal: independent verification of a SafeCut plan, sealed with a certificate and signature.

ProofSeal never imports halt.safecut. It recomputes coverage, business impact, constraints and
optimality from the raw scenario, so a bug in SafeCut shows up as a failed claim.
"""
