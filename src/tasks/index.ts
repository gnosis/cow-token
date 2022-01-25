import { setupDeployForwarder } from "./deploy-forwarder";
import { setupDeployment } from "./deployment";
import { setupTestClaimsTask } from "./test-claims";
import { setupTestDeploymentTask } from "./test-deployment";
import { setupVerifyContractCodeTask } from "./verify-contract-code";

export function setupTasks(): void {
  setupDeployForwarder();
  setupDeployment();
  setupTestClaimsTask();
  setupTestDeploymentTask();
  setupVerifyContractCodeTask();
}
