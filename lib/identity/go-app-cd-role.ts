import { Stack } from "aws-cdk-lib";
import {
  CompositePrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface GoAppCdRoleProps {
  readonly deployEnvironment: string;
  readonly account: string;
  readonly goAppArtifactBucket: Bucket;
  readonly goAppFrontendBucket: Bucket;
}

export function createGoAppCdRole(
  scope: Construct,
  props: GoAppCdRoleProps
): Role {
  const stack = Stack.of(scope);
  const { deployEnvironment, account, goAppArtifactBucket, goAppFrontendBucket } = props;

  return new Role(scope, "GoAppCdRole", {
    assumedBy: new CompositePrincipal(
      new ServicePrincipal("codepipeline.amazonaws.com"),
      new ServicePrincipal("codebuild.amazonaws.com")
    ),
    inlinePolicies: {
      GitHubAndArtifactsAndEcr: new PolicyDocument({
        statements: [
          new PolicyStatement({
            sid: "ArtifactBucketRW",
            effect: Effect.ALLOW,
            actions: ["s3:GetObject*", "s3:GetBucket*", "s3:List*", "s3:PutObject*"],
            resources: [
              goAppArtifactBucket.bucketArn,
              `${goAppArtifactBucket.bucketArn}/*`,
            ],
          }),
          new PolicyStatement({
            sid: "FrontendBucketDeploy",
            effect: Effect.ALLOW,
            actions: [
              "s3:GetObject*",
              "s3:GetBucket*",
              "s3:List*",
              "s3:PutObject*",
              "s3:DeleteObject*",
            ],
            resources: [
              goAppFrontendBucket.bucketArn,
              `${goAppFrontendBucket.bucketArn}/*`,
            ],
          }),
          new PolicyStatement({
            sid: "GithubTokenSecret",
            effect: Effect.ALLOW,
            actions: [
              "secretsmanager:GetSecretValue",
              "kms:Decrypt",
              "kms:DescribeKey",
            ],
            resources: [
              `arn:aws:secretsmanager:${stack.region}:${account}:secret:github-token-*`,
            ],
          }),
          new PolicyStatement({
            sid: "EcsDeploy",
            effect: Effect.ALLOW,
            actions: [
              "ecs:*",
              "elasticloadbalancing:DescribeTargetGroups",
              "elasticloadbalancing:DescribeListeners",
              "elasticloadbalancing:DescribeRules",
              "elasticloadbalancing:DescribeTags",
              "elasticloadbalancing:RegisterTargets",
              "elasticloadbalancing:DeregisterTargets",
            ],
            resources: ["*"],
          }),
          new PolicyStatement({
            sid: "CloudFormationGoAppEcs",
            effect: Effect.ALLOW,
            actions: [
              "cloudformation:CreateStack",
              "cloudformation:UpdateStack",
              "cloudformation:DeleteStack",
              "cloudformation:DescribeStacks",
              "cloudformation:DescribeStackEvents",
              "cloudformation:DescribeStackResource",
              "cloudformation:DescribeStackResources",
              "cloudformation:GetTemplate",
              "cloudformation:ValidateTemplate",
              "cloudformation:CreateChangeSet",
              "cloudformation:DescribeChangeSet",
              "cloudformation:ExecuteChangeSet",
              "cloudformation:DeleteChangeSet",
              "cloudformation:ContinueUpdateRollback",
              "cloudformation:ListStackResources",
              "cloudformation:ListChangeSets",
            ],
            resources: [
              `arn:aws:cloudformation:${stack.region}:${account}:stack/${deployEnvironment}-goapp-ecs-app/*`,
            ],
          }),
          new PolicyStatement({
            sid: "CdkBootstrapVersionRead",
            effect: Effect.ALLOW,
            actions: ["ssm:GetParameter", "ssm:GetParameters"],
            resources: [
              `arn:aws:ssm:${stack.region}:${account}:parameter/cdk-bootstrap/*/version`,
            ],
          }),
          new PolicyStatement({
            sid: "AssumeCdkBootstrapRoles",
            effect: Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [
              `arn:aws:iam::${account}:role/cdk-*-deploy-role-${account}-${stack.region}`,
              `arn:aws:iam::${account}:role/cdk-*-file-publishing-role-${account}-${stack.region}`,
              `arn:aws:iam::${account}:role/cdk-*-lookup-role-${account}-${stack.region}`,
              `arn:aws:iam::${account}:role/cdk-*-image-publishing-role-${account}-${stack.region}`,
            ],
          }),
          new PolicyStatement({
            sid: "CwLogsCodeBuild",
            effect: Effect.ALLOW,
            actions: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
            ],
            resources: ["arn:aws:logs:*:*:*"],
          }),
        ],
      }),
    },
  });
}
