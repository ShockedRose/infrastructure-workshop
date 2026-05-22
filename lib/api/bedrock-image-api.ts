import { Duration } from "aws-cdk-lib";
import { RestApi, LambdaIntegration } from "aws-cdk-lib/aws-apigateway";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export interface BedrockImageApiResources {
  readonly api: RestApi;
  readonly bedrockLambda: Function;
  readonly generateImageUrl: string;
}

export function createBedrockImageApi(
  scope: Construct,
  deployEnvironment: string
): BedrockImageApiResources {
  const bedrockLambda = new Function(scope, "BedrockImageLambda", {
    runtime: Runtime.NODEJS_20_X,
    handler: "index.handler",
    timeout: Duration.seconds(60),
    code: Code.fromInline(`const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
        const client = new BedrockRuntimeClient({ region: "us-west-2" });

        exports.handler = async (event) => {
          console.log("Event:", JSON.stringify(event));
          try {
            const body = JSON.parse(event.body);
            const prompt = body.prompt;

            if (!prompt) {
               return {
                statusCode: 400,
                body: JSON.stringify({ error: "Prompt is required" })
              };
            }

            const input = {
              modelId: "stability.sd3-5-large-v1:0",
              contentType: "application/json",
              accept: "application/json",
              body: JSON.stringify({
                prompt,
              })
            };

            const command = new InvokeModelCommand(input);
            const response = await client.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            const base64Image = responseBody.images[0];

            return {
              statusCode: 200,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: base64Image })
            };
          } catch (err) {
            console.error("Error invoking Bedrock:", err);
            return {
              statusCode: 500,
              body: JSON.stringify({ error: err.message })
            };
          }
        };
      `),
  });

  bedrockLambda.addToRolePolicy(
    new PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [
        "arn:aws:bedrock:*::foundation-model/stability.sd3-5-large-v1:0",
      ],
    })
  );

  const api = new RestApi(scope, "BedrockImageApi", {
    restApiName: `${deployEnvironment}-BedrockImageApi`,
    description: "API to generate images using Bedrock",
    defaultCorsPreflightOptions: {
      allowOrigins: ["*"],
      allowMethods: ["POST", "OPTIONS"],
    },
  });

  const generateResource = api.root.addResource("generate-image");
  generateResource.addMethod(
    "POST",
    new LambdaIntegration(bedrockLambda, {
      timeout: Duration.seconds(29),
    })
  );

  const bedrockApiBaseUrl = api.url.endsWith("/") ? api.url : `${api.url}/`;

  return {
    api,
    bedrockLambda,
    generateImageUrl: `${bedrockApiBaseUrl}generate-image`,
  };
}