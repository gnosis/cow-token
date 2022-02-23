import { SafeCreationSettings, BridgeParameter } from "../src/ts";

export const dummyteamControllerSettings: SafeCreationSettings = {
  owners: [3].map((i) => "0x".padEnd(42, i.toString())),
  threshold: 1,
};

export const dummyBridgeParameters: BridgeParameter = {
  multiTokenMediatorGnosisChain: "0x" + "01".repeat(20),
  multiTokenMediatorETH: "0x" + "02".repeat(20),
  arbitraryMessageBridgeETH: "0x" + "03".repeat(20),
};
