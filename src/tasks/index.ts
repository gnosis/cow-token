import { setupDeployForwarder } from "./deploy-forwarder";
import { setupDeployment } from "./deployment";
import { setupBridgedTokenDeployerTask } from "./deployment-of-bridged-token-deployer";
import { setupTestClaimsTask } from "./test-claims";
import { setupTestDeploymentTask } from "./test-deployment";
import { setupVerifyContractCodeTask } from "./verify-contract-code";

export function setupTasks(): void {
  setupDeployForwarder();
  setupDeployment();
  setupTestClaimsTask();
  setupTestDeploymentTask();
  setupVerifyContractCodeTask();
  setupBridgedTokenDeployerTask();
}
