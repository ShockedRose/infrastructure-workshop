import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Vpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  TargetType,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { CONTAINER_PORT } from "../shared/constants";

export interface GoAppComputeProps {
  readonly deployEnvironment: string;
  readonly vpc: Vpc;
  readonly albSecurityGroup: SecurityGroup;
  readonly goAppEcrRepo: Repository;
  readonly goCdRole: Role;
}

export interface GoAppComputeResources {
  readonly cluster: Cluster;
  readonly logGroup: LogGroup;
  readonly alb: ApplicationLoadBalancer;
  readonly targetGroup: ApplicationTargetGroup;
  readonly ecsTaskExecutionRole: Role;
  readonly ecsTaskRole: Role;
  readonly goAppServiceName: string;
  readonly taskFamily: string;
}

export function createGoAppCompute(
  scope: Construct,
  props: GoAppComputeProps
): GoAppComputeResources {
  const {
    deployEnvironment,
    vpc,
    albSecurityGroup,
    goAppEcrRepo,
    goCdRole,
  } = props;

  const cluster = new Cluster(scope, "GoAppCluster", {
    clusterName: `${deployEnvironment}-goapp-cluster`,
    vpc,
    containerInsights: true,
  });

  const logGroup = new LogGroup(scope, "GoAppLogGroup", {
    logGroupName: `/ecs/${deployEnvironment}-goapp`,
    retention: RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  const alb = new ApplicationLoadBalancer(scope, "GoAppAlb", {
    vpc,
    internetFacing: true,
    securityGroup: albSecurityGroup,
    loadBalancerName: `${deployEnvironment}-goapp-alb`,
  });

  const targetGroup = new ApplicationTargetGroup(scope, "GoAppTargetGroup", {
    vpc,
    protocol: ApplicationProtocol.HTTP,
    port: CONTAINER_PORT,
    targetType: TargetType.IP,
    healthCheck: {
      path: "/health",
      healthyHttpCodes: "200",
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
    },
    deregistrationDelay: Duration.seconds(15),
  });

  alb.addListener("HttpListener", {
    port: 80,
    protocol: ApplicationProtocol.HTTP,
    defaultTargetGroups: [targetGroup],
  });

  const ecsTaskExecutionRole = new Role(scope, "GoAppTaskExecutionRole", {
    assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    managedPolicies: [
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy"
      ),
    ],
  });
  goAppEcrRepo.grantPull(ecsTaskExecutionRole);

  const ecsTaskRole = new Role(scope, "GoAppEcsTaskRole", {
    assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    description: "Task role for Go Fargate tasks",
  });

  const goAppServiceName = `${deployEnvironment}-goapp-service`;
  const taskFamily = `${deployEnvironment}-goapp`;

  goCdRole.addToPrincipalPolicy(
    new PolicyStatement({
      sid: "PassRolesToEcs",
      effect: Effect.ALLOW,
      actions: ["iam:PassRole"],
      resources: [ecsTaskExecutionRole.roleArn, ecsTaskRole.roleArn],
      conditions: {
        StringLike: {
          "iam:PassedToService": ["ecs-tasks.amazonaws.com"],
        },
      },
    })
  );

  new StringParameter(scope, "GoAppClusterNameParam", {
    parameterName: `/${deployEnvironment}/goapp/cluster-name`,
    stringValue: cluster.clusterName,
  });

  new StringParameter(scope, "GoAppServiceNameParam", {
    parameterName: `/${deployEnvironment}/goapp/service-name`,
    stringValue: goAppServiceName,
  });

  return {
    cluster,
    logGroup,
    alb,
    targetGroup,
    ecsTaskExecutionRole,
    ecsTaskRole,
    goAppServiceName,
    taskFamily,
  };
}
