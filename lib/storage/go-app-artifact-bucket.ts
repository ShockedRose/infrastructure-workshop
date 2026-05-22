import { RemovalPolicy } from "aws-cdk-lib";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export function createGoAppArtifactBucket(
  scope: Construct,
  deployEnvironment: string
): Bucket {
  return new Bucket(scope, "GoAppArtifactBucket", {
    bucketName: `shockedrose-${deployEnvironment}-goapp-artifact-bucket`,
    removalPolicy: RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
  });
}