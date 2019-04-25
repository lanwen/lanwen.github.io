---
title: "AWS CDK dev preview"
tags: ["aws", "aws-cdk", "cloudformation"]
---

So I was able to solve my task with this way. My requirements were mainly that I want to have bucket in a different 
region than `us-east-1`, so I need to pass the lambda version somehow to another region

First definitions:
```javascript:title=cdk.js (Definitions)
const cdk = require('@aws-cdk/cdk');
const lambda = require('@aws-cdk/aws-lambda');
const s3 = require('@aws-cdk/aws-s3');
const cfr = require('@aws-cdk/aws-cloudfront');
const iam = require('@aws-cdk/aws-iam');
const cf = require('@aws-cdk/aws-cloudformation');
const r53 = require('@aws-cdk/aws-route53');

const sha256 = require('sha256-file');

const CF_HOSTED_ZONE_ID = 'Z2FDTNDATAQYW2';
const LAMBDA_OUTPUT_NAME = 'LambdaOutput';
const LAMBDA_EDGE_STACK_NAME = 'stack-name';
const DOMAIN_NAME = 'example.com';
const CERTIFICATE_ARN = 'arn:aws:acm:us-east-1:<aid>:certificate/<cert>';

const app = new cdk.App();
```

Then the edge lambda stack itself:
```javascript:title=cdk.js (Edge Lambda stack)
class LambdaStack extends cdk.Stack {
  constructor(parent, id, props) {
    super(parent, id, props);

    const override = new lambda.Function(this, 'your-lambda', {
      runtime: lambda.Runtime.NodeJS810,
      handler: 'index.handler',
      code: lambda.Code.asset('./lambda'),
      role: new iam.Role(this, 'AllowLambdaServiceToAssumeRole', {
        assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal('lambda.amazonaws.com'),
          new iam.ServicePrincipal('edgelambda.amazonaws.com'),
        ),
        managedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
      })
    });

    // this way it updates version only in case lambda code changes
    const version = override.addVersion(':sha256:' + sha256('./lambda/index.js'));

   // the main magic to easily pass the lambda version to stack in another region
    new cdk.CfnOutput(this, LAMBDA_OUTPUT_NAME, {
      value: cdk.Fn.join(":", [
        override.functionArn,
        version.functionVersion
      ])
    });
  }
}
```

Then cloud front definition:

```javascript:title=cdk.js (CloudFront)
class StaticSiteStack extends cdk.Stack {
  constructor(parent, id, props) {
    super(parent, id, props);

    const lambdaProvider = new lambda.SingletonFunction(this, 'Provider', {
      uuid: 'f7d4f730-4ee1-11e8-9c2d-fa7ae01bbebc',
      code: lambda.Code.asset('./cfn'),
      handler: 'stack.handler',
      timeout: 60,
      runtime: lambda.Runtime.NodeJS810,
    });

    // to allow aws sdk call inside the lambda
    lambdaProvider.addToRolePolicy(
      new iam.PolicyStatement()
        .allow()
        .addAction('cloudformation:DescribeStacks')
        .addResource(`arn:aws:cloudformation:*:*:stack/${LAMBDA_EDGE_STACK_NAME}/*`)
    );

   // This basically goes to another region to edge stack and grabs the version output
    const stackOutput = new cf.CustomResource(this, 'StackOutput', {
      lambdaProvider,
      properties: {
        StackName: LAMBDA_EDGE_STACK_NAME,
        OutputKey: LAMBDA_OUTPUT_NAME,
        // just to change custom resource on code update
        LambdaHash: sha256('./lambda/index.js')
      }
    });

    const bucket = new s3.Bucket(this, 'bucket', {
      publicReadAccess: true // not really sure I need this permission actually
    });

    const origin = {
      domainName: bucket.domainName,
      id: 'origin1',
      s3OriginConfig: {}
    };

    // CloudFrontWebDistribution will simplify a lot, 
    // but it doesn't support  lambdaFunctionAssociations in any way :(
    const distribution = new cfr.CfnDistribution(this, 'WebSiteDistribution', {
      distributionConfig: {
        aliases: ['site.example.com', '*.site.example.com'],
        defaultCacheBehavior: {
          allowedMethods: ['GET', 'HEAD'],
          cachedMethods: ['GET', 'HEAD'],
          defaultTtl: 60,
          maxTtl: 60,
          targetOriginId: origin.id,
          viewerProtocolPolicy: cfr.ViewerProtocolPolicy.RedirectToHTTPS,
          forwardedValues: {
            cookies: {
              forward: 'none'
            },
            queryString: false
          },
          lambdaFunctionAssociations: [
            {
              eventType: 'viewer-request',
              lambdaFunctionArn: stackOutput.getAtt('Output')
            }
          ]
        },
        defaultRootObject: 'index.html',
        enabled: true,
        httpVersion: cfr.HttpVersion.HTTP2,
        origins: [
          origin
        ],
        priceClass: cfr.PriceClass.PriceClass100,
        viewerCertificate: {
          acmCertificateArn: CERTIFICATE_ARN,
          sslSupportMethod: cfr.SSLMethod.SNI
        }
      },
      tags: [{
        key: 'stack',
        value: this.name
      }]
    });

    const zone = new r53.HostedZoneProvider(this, {
      domainName: DOMAIN_NAME
    }).findAndImport(this, 'MyPublicZone');

    new r53.AliasRecord(this, 'BaseRecord', {
      recordName: 'site',
      zone: zone,
      target: {
        asAliasRecordTarget: () => ({
          hostedZoneId: CF_HOSTED_ZONE_ID,
          dnsName: distribution.distributionDomainName
        })
      }
    });

    new r53.AliasRecord(this, 'StarRecord', {
      recordName: '*.site',
      zone: zone,
      target: {
        asAliasRecordTarget: () => ({
          hostedZoneId: CF_HOSTED_ZONE_ID,
          dnsName: distribution.distributionDomainName
        })
      }
    });

    new cdk.CfnOutput(this, 'Bucket', {
      value: `s3://${bucket.bucketName}`
    });

    new cdk.CfnOutput(this, 'CfDomain', {
      value: distribution.distributionDomainName
    });

    new cdk.CfnOutput(this, 'CfId', {
      value: distribution.distributionId
    });

    // to reverify it was really updated to a proper version
    new cdk.CfnOutput(this, 'LambdaEdge', {
      value: stackOutput.getAtt('Output')
    });
  }
}
```

Then stack creation

```javascript:title=cdk.js (Stack creation)
const ls = new LambdaStack(app, LAMBDA_EDGE_STACK_NAME, {
  env: {
    region: 'us-east-1'
  }
});

new StaticSiteStack(app, 'cf-stack').addDependency(ls);

app.run();
```

To test that it works:

```javascript:title=/lambda/index.js (Edge lambda)
exports.handler = (event, context, callback) => {
  console.log("REQUEST", JSON.stringify(event));

  const status = '200';
  const headers = {
    'content-type': [{
      key: 'Content-Type',
      value: 'application/json'
    }]
  };

  const body = JSON.stringify(event, null, 2);
  return callback(null, {status, headers, body});
};
```
Custom resource 

```javascript:title=/cfn/stack.js (Custom resource)
exports.handler = (event, context) => {
  console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));

  const aws = require("aws-sdk");
  const response = require('cfn-response');

  const {RequestType, ResourceProperties: {StackName, OutputKey}} = event;

  if (RequestType === 'Delete') {
    return response.send(event, context, response.SUCCESS);
  }

  const cfn = new aws.CloudFormation({region: 'us-east-1'});

  cfn.describeStacks({StackName}, (err, {Stacks}) => {
    if (err) {
      console.log("Error during stack describe:\n", err);
      return response.send(event, context, response.FAILED, err);
    }

    const Output = Stacks[0].Outputs
      .filter(out => out.OutputKey === OutputKey)
      .map(out => out.OutputValue)
      .join();

    response.send(event, context, response.SUCCESS, {Output});
  });
};
```

don't forget to add `/cfn/cfn-response.js` file with a content listed here:
https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-lambda-function-code.html
