import { constants } from "ethers";
import { SafeCreationSettings, VirtualTokenCreationSettings } from "../proposal";

export const dummyVirtualTokenCreationSettings: VirtualTokenCreationSettings =
{
    merkleRoot: constants.HashZero,
    usdcToken: constants.AddressZero,
    gnoToken: constants.AddressZero,
    gnoPrice: "0",
    wrappedNativeToken: constants.AddressZero,
    nativeTokenPrice: "0",
};

export const dummyteamConrollerSettings: SafeCreationSettings = {
    owners: [3].map((i) => "0x".padEnd(42, i.toString())),
    threshold: 1,
};
