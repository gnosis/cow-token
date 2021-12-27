import { ExecutableClaim, ProvenClaim } from "../src/ts";

export function fullyExecuteClaim(claim: ProvenClaim): ExecutableClaim {
  return {
    ...claim,
    claimedAmount: claim.claimableAmount,
  };
}
