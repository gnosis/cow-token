import { DeploymentProposalSettings } from "../ts";

export interface Args {
  claims: string;
  settings: string;
}

export interface BridgeParameter {
  multiTokenMediatorGnosisChain: string;
  multiTokenMediatorETH: string;
  amountToRelay: string;
}

export interface Settings
  extends Omit<DeploymentProposalSettings, "virtualCowToken"> {
  gnosisDao: string;
  gnoPrice: string;
  nativeTokenPriceOnETH: string;
  nativeTokenPriceOnGnosisChain: string;
  bridge: BridgeParameter;
}
