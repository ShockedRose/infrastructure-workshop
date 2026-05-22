import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { createBedrockImageApi } from "./api/bedrock-image-api";
// import { createGoAppCompute } from "./compute/go-app-compute";
import { createGoAppCdRole } from "./identity/go-app-cd-role";
// import { createGoAppNetwork } from "./networking/go-app-network";
// import { createGoAppBuildProjects } from "./pipeline/go-app-build-projects";
// import { createGoAppCdPipeline } from "./pipeline/go-app-cd-pipeline";
// import { createGoAppRepositories } from "./registry/go-app-repositories";
import { createGoAppArtifactBucket } from "./storage/go-app-artifact-bucket";

interface InfrastructureWorkshopStackProps extends StackProps {
  DEPLOY_ENVIRONMENT: string;
  repositoryOwner: string;
  goAppRepoName: string;
  goAppBranchName: string;
}

export class InfrastructureWorkshopStack extends Stack {
  constructor(scope: Construct, id: string, props: InfrastructureWorkshopStackProps) {
    super(scope, id, props);

    const {
      DEPLOY_ENVIRONMENT,
      // repositoryOwner,
      // goAppRepoName,
      // goAppBranchName,
    } = props;

    const account = Stack.of(this).account;

    const bedrockImageApi = createBedrockImageApi(this, DEPLOY_ENVIRONMENT);
    const goAppArtifactBucket = createGoAppArtifactBucket(
      this,
      DEPLOY_ENVIRONMENT
    );

    const goCdRole = createGoAppCdRole(this, {
      deployEnvironment: DEPLOY_ENVIRONMENT,
      account,
      goAppArtifactBucket,
    });
  }
}
