#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { InfrastructureWorkshopStack } from '../lib/infrastructure-workshop-stack';

const app = new App();


const deployEnvironment =
  process.env.DEPLOY_ENVIRONMENT || app.node.tryGetContext("env");
if (!deployEnvironment) {
  throw new Error(
    "Set DEPLOY_ENVIRONMENT when deploying (via CI CodeBuild). For local synth/testing use: `cdk deploy --context env=dev/staging/prod` with DEPLOY_ENVIRONMENT set to the same."
  );
}

const contextEnv =
  app.node.tryGetContext(deployEnvironment) as { goAppBranchName?: string } | undefined;

const repositoryOwner = app.node.tryGetContext("repositoryOwner");
const goAppRepoName = app.node.tryGetContext("goAppRepoName");
const goAppBranchName =
  contextEnv?.goAppBranchName || app.node.tryGetContext("goAppBranchName");

const account =
  process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT || app.node.tryGetContext("account");
const region =
  process.env.AWS_REGION ||
  process.env.CDK_DEFAULT_REGION ||
  app.node.tryGetContext("region") ||
  "us-east-1";

if (!repositoryOwner || typeof repositoryOwner !== "string") {
  throw new Error(
    '`repositoryOwner` is required in infrastructure/cdk.json "context"'
  );
}
if (!goAppRepoName || typeof goAppRepoName !== "string") {
  throw new Error(
    '`goAppRepoName` is required in infrastructure/cdk.json "context"'
  );
}
if (!goAppBranchName || typeof goAppBranchName !== "string") {
  throw new Error(
    `Missing goAppBranchName for '${deployEnvironment}': define it under infrastructure/cdk.json "context"."${deployEnvironment}".goAppBranchName`
  );
}
if (!account || typeof account !== "string") {
  throw new Error(
    "AWS account not set for deployment (AWS_ACCOUNT_ID or CDK_DEFAULT_ACCOUNT)."
  );
}


new InfrastructureWorkshopStack(app, `${deployEnvironment}-Infrastructure-Stack`, {
  DEPLOY_ENVIRONMENT: deployEnvironment,
  repositoryOwner,
  goAppRepoName,
  goAppBranchName,
  env: { account, region },
  description: `Stack for the ${deployEnvironment} infrastructure (VPC, ECS, Bedrock proxy API, Go app CI/CD pipeline) deployed via CDK.`,
});