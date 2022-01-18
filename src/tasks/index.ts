import { setupTestDeploymentTask } from "./test-deployment";
import { setupVerifyContractCodeTask } from "./verify-contract-code";

export function setupTasks(): void {
  setupTestDeploymentTask();
  setupVerifyContractCodeTask();
}
