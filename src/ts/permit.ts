import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import IERC20Metadata from "@openzeppelin/contracts/build/contracts/IERC20Metadata.json";
import IERC20Permit from "@openzeppelin/contracts/build/contracts/IERC20Permit.json";
import { BigNumber, BigNumberish, Contract, Signature, utils } from "ethers";
import { _TypedDataEncoder } from "ethers/lib/utils";

export interface Permit {
  token: string;
  owner: string;
  spender: string;
  value: BigNumberish;
  deadline: BigNumberish;
  nonce?: BigNumberish;
}

export async function signPermit(
  signer: SignerWithAddress,
  permit: Permit,
): Promise<Signature> {
  if (signer.address.toLowerCase() != permit.owner.toLowerCase()) {
    throw new Error("Permit signer must be the owner");
  }
  if (signer.provider == undefined) {
    throw new Error("Signer must have a provider set");
  }
  const tokenMetadata = new Contract(permit.token, IERC20Metadata.abi).connect(
    signer.provider,
  );
  const tokenPermit = new Contract(permit.token, IERC20Permit.abi).connect(
    signer.provider,
  );
  const [populatedNonce, name, domainSeparator, network] = await Promise.all([
    permit.nonce ?? tokenPermit.nonces(signer.address),
    tokenMetadata.name(),
    tokenPermit.DOMAIN_SEPARATOR(),
    signer.provider.getNetwork(),
  ]);
  const signedData = {
    owner: signer.address,
    spender: permit.spender,
    value: BigNumber.from(permit.value),
    nonce: BigNumber.from(populatedNonce),
    deadline: BigNumber.from(permit.deadline),
  };
  const domain = {
    name,
    version: "1",
    chainId: network.chainId,
    verifyingContract: permit.token,
  };
  if (domainSeparator != _TypedDataEncoder.hashDomain(domain)) {
    // Note: this function assumes that the ERC-712 domain separator follows the
    // "common choice" pattern specified (but not enforced) by EIP-2612. This is
    // the case for CowToken but might be different in the case of other tokens.
    // In principle, this function could be implemented by using the domain
    // separator returned by the contract, but would require manually building
    // everything needed for generating EIP-712 signatures from scratch as of now.
    throw new Error(
      `Unsupported domain separator format for token at address ${permit.token}`,
    );
  }
  return utils.splitSignature(
    await signer._signTypedData(
      domain,
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      signedData,
    ),
  );
}
