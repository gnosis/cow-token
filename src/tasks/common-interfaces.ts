import { DeploymentProposalSettings } from "../ts";

export interface Args {
  claims: string;
  settings: string;
}

export interface Settings
  extends Omit<DeploymentProposalSettings, "virtualCowToken"> {
  gnoPrice: string;
  nativeTokenPriceOnETH: string;
  nativeTokenPriceOnGnosisChain: string;
  multiTokenMediatorGnosisChain: string;
}
