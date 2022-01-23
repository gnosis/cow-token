import { setupDeploymentProposal } from "./deployment-proposal";
import { setupTestClaimsTask } from "./test-claims";
import { setupTestDeploymentTask } from "./test-deployment";
import { setupVerifyContractCodeTask } from "./verify-contract-code";

export function setupTasks(): void {
  setupDeploymentProposal();
  setupTestClaimsTask();
  setupTestDeploymentTask();
  setupVerifyContractCodeTask();
}
