import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { createBedrockImageApi } from "./api/bedrock-image-api";
import { createGoAppCompute } from "./compute/go-app-compute";
import { createGoAppCdRole } from "./identity/go-app-cd-role";
import { createGoAppNetwork } from "./networking/go-app-network";
import { createGoAppBuildProjects } from "./pipeline/go-app-build-projects";
import { createGoAppCdPipeline } from "./pipeline/go-app-cd-pipeline";
import { createGoAppRepositories } from "./registry/go-app-repositories";
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
      repositoryOwner,
      goAppRepoName,
      goAppBranchName,
    } = props;
    const account = Stack.of(this).account;

    const bedrockImageApi = createBedrockImageApi(this, DEPLOY_ENVIRONMENT);
    const goAppArtifactBucket = createGoAppArtifactBucket(
      this,
      DEPLOY_ENVIRONMENT
    );
    const repositories = createGoAppRepositories(this, DEPLOY_ENVIRONMENT);
    const goCdRole = createGoAppCdRole(this, {
      deployEnvironment: DEPLOY_ENVIRONMENT,
      account,
      goAppArtifactBucket,
    });
    const network = createGoAppNetwork(this);
    const compute = createGoAppCompute(this, {
      deployEnvironment: DEPLOY_ENVIRONMENT,
      vpc: network.vpc,
      albSecurityGroup: network.albSecurityGroup,
      goAppEcrRepo: repositories.goAppEcrRepo,
      goCdRole,
    });
    const buildProjects = createGoAppBuildProjects(this, {
      deployEnvironment: DEPLOY_ENVIRONMENT,
      goCdRole,
      goAppEcrRepo: repositories.goAppEcrRepo,
      goBaseGolangEcrRepo: repositories.goBaseGolangEcrRepo,
      goBaseAlpineEcrRepo: repositories.goBaseAlpineEcrRepo,
      cluster: compute.cluster,
      vpc: network.vpc,
      serviceSecurityGroup: network.serviceSecurityGroup,
      targetGroup: compute.targetGroup,
      ecsTaskExecutionRole: compute.ecsTaskExecutionRole,
      ecsTaskRole: compute.ecsTaskRole,
      logGroup: compute.logGroup,
      goAppServiceName: compute.goAppServiceName,
      taskFamily: compute.taskFamily,
      bedrockGenerateImageUrl: bedrockImageApi.generateImageUrl,
    });

    createGoAppCdPipeline(this, {
      deployEnvironment: DEPLOY_ENVIRONMENT,
      repositoryOwner,
      goAppRepoName,
      goAppBranchName,
      goCdRole,
      goAppArtifactBucket,
      goAppDockerProject: buildProjects.goAppDockerProject,
      ensureEcsServiceProject: buildProjects.ensureEcsServiceProject,
    });

    new CfnOutput(this, "GoAppWebServerURL", {
      value: `http://${compute.alb.loadBalancerDnsName}`,
      description: "URL of the Go web server served by the ECS Fargate service",
      exportName: `${DEPLOY_ENVIRONMENT}-GoApp-WebServer-URL`,
    });

    new CfnOutput(this, "GoAppClusterName", {
      value: compute.cluster.clusterName,
      exportName: `${DEPLOY_ENVIRONMENT}-GoApp-Cluster-Name`,
    });

    new CfnOutput(this, "GoAppServiceName", {
      value: compute.goAppServiceName,
      exportName: `${DEPLOY_ENVIRONMENT}-GoApp-Service-Name`,
    });

  }
}
