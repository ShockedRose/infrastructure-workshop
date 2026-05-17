import { SecretValue } from "aws-cdk-lib";
import { PipelineProject } from "aws-cdk-lib/aws-codebuild";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import {
  CodeBuildAction,
  GitHubSourceAction,
  ManualApprovalAction,
} from "aws-cdk-lib/aws-codepipeline-actions";
import { Role } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface GoAppCdPipelineProps {
  readonly deployEnvironment: string;
  readonly repositoryOwner: string;
  readonly goAppRepoName: string;
  readonly goAppBranchName: string;
  readonly goCdRole: Role;
  readonly goAppArtifactBucket: Bucket;
  readonly goAppDockerProject: PipelineProject;
  readonly ensureEcsServiceProject: PipelineProject;
}

/** Manual approval before Go app deploy for higher environments only. */
function requiresDeployApproval(env: string): boolean {
  return env === "staging" || env === "prod";
}

export function createGoAppCdPipeline(
  scope: Construct,
  props: GoAppCdPipelineProps
): Pipeline {
  const {
    deployEnvironment,
    repositoryOwner,
    goAppRepoName,
    goAppBranchName,
    goCdRole,
    goAppArtifactBucket,
    goAppDockerProject,
    ensureEcsServiceProject,
  } = props;
  const gitHubToken = SecretValue.secretsManager("github-token");

  const goAppSourceOutput = new Artifact("GoAppSourceOutput");
  const goAppBuildOutput = new Artifact("GoAppBuildOutput");

  const goAppPipeline = new Pipeline(scope, "GoAppCDPipeline", {
    pipelineName: `${deployEnvironment}-GoApp-CD-Pipeline`,
    role: goCdRole,
    artifactBucket: goAppArtifactBucket,
  });

  goAppPipeline.addStage({
    stageName: "Source",
    actions: [
      new GitHubSourceAction({
        owner: repositoryOwner,
        repo: goAppRepoName,
        actionName: "GoAppSource",
        branch: goAppBranchName,
        output: goAppSourceOutput,
        oauthToken: gitHubToken,
      }),
    ],
  });

  if (requiresDeployApproval(deployEnvironment)) {
    goAppPipeline.addStage({
      stageName: "ApproveDeployment",
      actions: [
        new ManualApprovalAction({
          actionName: "ApproveGoAppDeploy",
          additionalInformation: `Approve Go application (ECS) deployment to ${deployEnvironment}.`,
          role: goCdRole,
        }),
      ],
    });
  }

  goAppPipeline.addStage({
    stageName: "Build",
    actions: [
      new CodeBuildAction({
        actionName: "DockerBuildAndPush",
        project: goAppDockerProject,
        input: goAppSourceOutput,
        outputs: [goAppBuildOutput],
        role: goCdRole,
      }),
    ],
  });

  goAppPipeline.addStage({
    stageName: "DeployEcsApp",
    actions: [
      new CodeBuildAction({
        actionName: "DeployEcsViaAppCdk",
        project: ensureEcsServiceProject,
        input: goAppBuildOutput,
        role: goCdRole,
      }),
    ],
  });

  return goAppPipeline;
}
