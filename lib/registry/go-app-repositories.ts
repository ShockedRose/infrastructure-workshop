import { RemovalPolicy } from "aws-cdk-lib";
import { Repository, TagMutability } from "aws-cdk-lib/aws-ecr";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { CONTAINER_NAME } from "../shared/constants";

export interface GoAppRepositories {
  readonly goAppEcrRepo: Repository;
  readonly goBaseGolangEcrRepo: Repository;
  readonly goBaseAlpineEcrRepo: Repository;
}

export function createGoAppRepositories(
  scope: Construct,
  deployEnvironment: string
): GoAppRepositories {
  const goAppEcrRepo = new Repository(scope, "GoAppEcrRepo", {
    repositoryName: `${deployEnvironment}-${CONTAINER_NAME}`,
    removalPolicy: RemovalPolicy.DESTROY,
    emptyOnDelete: true,
    imageTagMutability: TagMutability.MUTABLE,
    lifecycleRules: [{ maxImageCount: 4 }],
  });

  const goBaseGolangEcrRepo = new Repository(scope, "GoBaseGolangEcrRepo", {
    repositoryName: `${deployEnvironment}-${CONTAINER_NAME}-base-golang`,
    removalPolicy: RemovalPolicy.DESTROY,
    emptyOnDelete: true,
    imageTagMutability: TagMutability.MUTABLE,
    lifecycleRules: [{ maxImageCount: 4 }],
  });

  const goBaseAlpineEcrRepo = new Repository(scope, "GoBaseAlpineEcrRepo", {
    repositoryName: `${deployEnvironment}-${CONTAINER_NAME}-base-alpine`,
    removalPolicy: RemovalPolicy.DESTROY,
    emptyOnDelete: true,
    imageTagMutability: TagMutability.MUTABLE,
    lifecycleRules: [{ maxImageCount: 4 }],
  });

  new StringParameter(scope, "GoAppEcrRepoUriParam", {
    parameterName: `/${deployEnvironment}/goapp/ecr-repo-uri`,
    stringValue: goAppEcrRepo.repositoryUri,
  });

  new StringParameter(scope, "GoBaseGolangEcrRepoUriParam", {
    parameterName: `/${deployEnvironment}/goapp/ecr-base-golang-uri`,
    stringValue: goBaseGolangEcrRepo.repositoryUri,
  });

  new StringParameter(scope, "GoBaseAlpineEcrRepoUriParam", {
    parameterName: `/${deployEnvironment}/goapp/ecr-base-alpine-uri`,
    stringValue: goBaseAlpineEcrRepo.repositoryUri,
  });

  return {
    goAppEcrRepo,
    goBaseGolangEcrRepo,
    goBaseAlpineEcrRepo,
  };
}
