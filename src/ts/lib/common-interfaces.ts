import { DeploymentProposalSettings } from "..";

export interface Args {
  claims: string;
  settings: string;
}

export interface VirtualTokenSettings {
  gnoPrice: string;
  nativeTokenPrice: string;
}

export interface BridgeParameter {
  multiTokenMediatorGnosisChain: string;
  multiTokenMediatorETH: string;

}

export interface Settings
  extends Omit<DeploymentProposalSettings, "virtualCowToken"> {
  virtualCowToken: VirtualTokenSettings;
}
