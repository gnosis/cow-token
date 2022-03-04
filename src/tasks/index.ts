import { setupComputeMerkleRootTask } from "./compute-merkle-root";
import { setupDeployForwarder } from "./deploy-forwarder";
import { setupDeployment } from "./deployment";
import { setupBridgedTokenDeployerTask } from "./deployment-of-bridged-token-deployer";
import { setupTestClaimsTask } from "./test-claims";
import { setupTestDeploymentTask } from "./test-deployment";
import { setupTestExecuteProposalTask } from "./test-execute-proposal";
import { setupVerifyContractCodeTask } from "./verify-contract-code";

export function setupTasks(): void {
  setupBridgedTokenDeployerTask();
  setupComputeMerkleRootTask();
  setupDeployForwarder();
  setupDeployment();
  setupTestClaimsTask();
  setupTestDeploymentTask();
  setupTestExecuteProposalTask();
  setupVerifyContractCodeTask();
}
