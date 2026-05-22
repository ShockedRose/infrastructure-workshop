import { Fn, Stack } from "aws-cdk-lib";
import {
  BuildSpec,
  LinuxBuildImage,
  PipelineProject,
} from "aws-cdk-lib/aws-codebuild";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { ApplicationTargetGroup } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Role } from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { CONTAINER_NAME, CONTAINER_PORT } from "../shared/constants";

export interface GoAppBuildProjectsProps {
  readonly deployEnvironment: string;
  readonly goCdRole: Role;
  readonly goAppEcrRepo: Repository;
  readonly goBaseGolangEcrRepo: Repository;
  readonly goBaseAlpineEcrRepo: Repository;
  readonly cluster: Cluster;
  readonly vpc: Vpc;
  readonly serviceSecurityGroup: SecurityGroup;
  readonly targetGroup: ApplicationTargetGroup;
  readonly ecsTaskExecutionRole: Role;
  readonly ecsTaskRole: Role;
  readonly logGroup: LogGroup;
  readonly goAppServiceName: string;
  readonly taskFamily: string;
  readonly bedrockGenerateImageUrl: string;
}

export interface GoAppBuildProjects {
  readonly goAppDockerProject: PipelineProject;
  readonly ensureEcsServiceProject: PipelineProject;
}

export function createGoAppBuildProjects(
  scope: Construct,
  props: GoAppBuildProjectsProps
): GoAppBuildProjects {
  const stack = Stack.of(scope);
  const {
    deployEnvironment,
    goCdRole,
    goAppEcrRepo,
    goBaseGolangEcrRepo,
    goBaseAlpineEcrRepo,
    cluster,
    vpc,
    serviceSecurityGroup,
    targetGroup,
    ecsTaskExecutionRole,
    ecsTaskRole,
    logGroup,
    goAppServiceName,
    taskFamily,
    bedrockGenerateImageUrl,
  } = props;

  const goAppDockerProject = new PipelineProject(scope, "GoAppDockerBuildProject", {
    projectName: `${deployEnvironment}-goapp-docker-build`,
    role: goCdRole,
    environment: {
      buildImage: LinuxBuildImage.AMAZON_LINUX_2_5,
      privileged: true,
    },
    environmentVariables: {
      AWS_ACCOUNT_ID: { value: stack.account },
      AWS_DEFAULT_REGION: { value: stack.region },
      ECR_REPO_URI: { value: goAppEcrRepo.repositoryUri },
      ECR_REPO_NAME: { value: goAppEcrRepo.repositoryName },
      CONTAINER_NAME: { value: CONTAINER_NAME },
      GOLANG_BASE_IMAGE: {
        value: `${goBaseGolangEcrRepo.repositoryUri}:1.25-alpine`,
      },
      ALPINE_BASE_IMAGE: {
        value: `${goBaseAlpineEcrRepo.repositoryUri}:3.20`,
      },
    },
    buildSpec: BuildSpec.fromObject({
      version: "0.2",
      phases: {
        pre_build: {
          commands: [
            "echo Logging in to Amazon ECR...",
            "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com",
            "IMAGE_TAG=${CODEBUILD_RESOLVED_SOURCE_VERSION:=latest}",
            "IMAGE_TAG=${IMAGE_TAG:0:7}",
            "echo Building tag $IMAGE_TAG",
          ],
        },
        build: {
          commands: [
            "echo Building Docker image using ECR base layers...",
            "docker build --build-arg GOLANG_BASE=$GOLANG_BASE_IMAGE --build-arg ALPINE_BASE=$ALPINE_BASE_IMAGE -t $ECR_REPO_NAME:$IMAGE_TAG .",
            "docker tag $ECR_REPO_NAME:$IMAGE_TAG $ECR_REPO_URI:$IMAGE_TAG",
            "docker tag $ECR_REPO_NAME:$IMAGE_TAG $ECR_REPO_URI:latest",
          ],
        },
        post_build: {
          commands: [
            "echo Pushing images to ECR...",
            "docker push $ECR_REPO_URI:$IMAGE_TAG",
            "docker push $ECR_REPO_URI:latest",
            "echo Writing imagedefinitions.json...",
            'printf \'[{"name":"%s","imageUri":"%s:%s"}]\' "$CONTAINER_NAME" "$ECR_REPO_URI" "$IMAGE_TAG" > imagedefinitions.json',
            "cat imagedefinitions.json",
          ],
        },
      },
      artifacts: {
        files: ["imagedefinitions.json", "cdk/**/*"],
      },
    }),
  });

  const subnetIdsComma = Fn.join(",", vpc.publicSubnets.map((s) => s.subnetId));
  const vpcAzsComma = Fn.join(",", vpc.availabilityZones);
  const ensureEcsServiceProject = new PipelineProject(
    scope,
    "EnsureEcsServiceProject",
    {
      projectName: `${deployEnvironment}-goapp-ecs-cdk-deploy`,
      role: goCdRole,
      environment: {
        buildImage: LinuxBuildImage.AMAZON_LINUX_2_5,
      },
      environmentVariables: {
        AWS_ACCOUNT_ID: { value: stack.account },
        AWS_DEFAULT_REGION: { value: stack.region },
        CLUSTER_NAME: { value: cluster.clusterName },
        SERVICE_NAME: { value: goAppServiceName },
        TASK_FAMILY: { value: taskFamily },
        CONTAINER_NAME: { value: CONTAINER_NAME },
        CONTAINER_PORT: { value: String(CONTAINER_PORT) },
        VPC_ID: { value: vpc.vpcId },
        VPC_AZS: { value: vpcAzsComma },
        PUBLIC_SUBNET_IDS: { value: subnetIdsComma },
        SECURITY_GROUP_IDS: { value: serviceSecurityGroup.securityGroupId },
        TARGET_GROUP_ARN: { value: targetGroup.targetGroupArn },
        EXECUTION_ROLE_ARN: { value: ecsTaskExecutionRole.roleArn },
        TASK_ROLE_ARN: { value: ecsTaskRole.roleArn },
        LOG_GROUP_NAME: { value: logGroup.logGroupName },
        BEDROCK_API_URL: {
          value: bedrockGenerateImageUrl,
        },
        DEPLOY_ENVIRONMENT: { value: deployEnvironment },
        ECS_STACK_NAME: { value: `${deployEnvironment}-goapp-ecs-app` },
      },
      buildSpec: BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            "runtime-versions": {
              nodejs: "20",
            },
            commands: [
              "echo Listing directory contents from .",
              "ls .",
              'echo "Installing application CDK (ECS) dependencies..."',
              "cd cdk && npm ci",
              "cd ..",
            ],
          },
          pre_build: {
            commands: [
              "export IMAGE_URI=$(python3 -c \"import json; print(json.load(open('imagedefinitions.json'))[0]['imageUri'])\")",
              "export CDK_DEFAULT_ACCOUNT=$AWS_ACCOUNT_ID",
              "export CDK_DEFAULT_REGION=$AWS_DEFAULT_REGION",
              "echo Deploying stack with image $IMAGE_URI",
            ],
          },
          build: {
            commands: [
              "set -e",
              "cd cdk && npx cdk deploy EcsApp --require-approval never",
            ],
          },
        },
      }),
    }
  );

  goAppEcrRepo.grantPullPush(goCdRole);
  goBaseGolangEcrRepo.grantPull(goCdRole);
  goBaseAlpineEcrRepo.grantPull(goCdRole);

  return {
    goAppDockerProject,
    ensureEcsServiceProject,
  };
}