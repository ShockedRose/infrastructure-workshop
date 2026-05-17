import { Peer, Port, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { CONTAINER_PORT } from "../shared/constants";

export interface GoAppNetworkResources {
  readonly vpc: Vpc;
  readonly albSecurityGroup: SecurityGroup;
  readonly serviceSecurityGroup: SecurityGroup;
}

export function createGoAppNetwork(scope: Construct): GoAppNetworkResources {
  const vpc = new Vpc(scope, "AppVpc", {
    maxAzs: 2,
    natGateways: 1,
    subnetConfiguration: [
      {
        cidrMask: 24,
        name: "ingress",
        subnetType: SubnetType.PUBLIC,
      },
    ],
  });

  const albSecurityGroup = new SecurityGroup(scope, "AlbSecurityGroup", {
    vpc,
    description: "Security group for the Go app Application Load Balancer",
    allowAllOutbound: true,
  });
  albSecurityGroup.addIngressRule(
    Peer.anyIpv4(),
    Port.tcp(80),
    "Public HTTP access to Go app"
  );

  const serviceSecurityGroup = new SecurityGroup(scope, "ServiceSecurityGroup", {
    vpc,
    description: "Security group for the Go app Fargate tasks",
    allowAllOutbound: true,
  });
  serviceSecurityGroup.addIngressRule(
    albSecurityGroup,
    Port.tcp(CONTAINER_PORT),
    "Allow ALB to reach Go app container"
  );

  return {
    vpc,
    albSecurityGroup,
    serviceSecurityGroup,
  };
}
