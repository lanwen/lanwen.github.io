---
title: "AWS CDK dev preview"
tags: ["aws", "aws-cdk", "cloudformation"]
---

Recently got an idea to organize a PR preview in github for my frontend code utilising S3 and CloudFront capabilites.
I've found a nice [article](https://mk.gg/continuously-deploy-static-site-aws-codebuild-cloudfront-lambda-1/) 
describing the basics. But since we are using configuration as a code approach - that was quite a good task to finally 
try a new [AWS CDK](https://github.com/awslabs/aws-cdk) tool to work with CloudFormation (version *0.28.0*).

### Spoiler
What can I say right now - is that this tool is really promising and I've enjoyed to write a code with it. But still this tool
lack a lot of UX. Documentation and examples are not full and hight level API is not stable yet at all.

## Process

First of all I've tried to find a ready-to-use example of Lambda@Edge and found only [issue](https://github.com/awslabs/aws-cdk/issues/1575).
Explanations didn't help much, so I've moved into discovery on how to achieve my goal. With multiple sources I've found that the only working way 
is to publish somehow a version, then get that and pass into CloudFront. 

The main issue which made my case quite more complex than examples was mainly that I want to have bucket in a different 
region than `us-east-1`, so I need to pass the lambda version somehow to another region.

#### Definitions

Of all required things:

_cdk.js (Definitions)_
```js
const cdk = require('@aws-cdk/cdk');
const lambda = require('@aws-cdk/aws-lambda');
const s3 = require('@aws-cdk/aws-s3');
const cfr = require('@aws-cdk/aws-cloudfront');
const iam = require('@aws-cdk/aws-iam');
const cf = require('@aws-cdk/aws-cloudformation');
const r53 = require('@aws-cdk/aws-route53');

const sha256 = require('sha256-file');

// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/quickref-route53.html
const CF_HOSTED_ZONE_ID = 'Z2FDTNDATAQYW2'; 

// To share between stacks easily
const LAMBDA_OUTPUT_NAME = 'LambdaOutput';
const LAMBDA_EDGE_STACK_NAME = 'stack-name';
// Will be used as *.domain to handle pr preview requests
const DOMAIN_NAME = 'example.com';
// This cert should be created in us-east-1!
const CERTIFICATE_ARN = 'arn:aws:acm:us-east-1:<aid>:certificate/<cert>';

const app = new cdk.App();
```

so we need bunch of services involved and also something to get a hash of a file to update a version when its really needed.

#### Lambda stack

Then the edge lambda stack itself. Quite similar to any CloudFormation/AWS CDK examples:

_cdk.js (Edge Lambda stack)_
```js
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
   // this output is required
    new cdk.CfnOutput(this, LAMBDA_OUTPUT_NAME, {
      value: cdk.Fn.join(":", [
        override.functionArn,
        version.functionVersion
      ])
    });
  }
}
```

#### Huge definition of CloudFront

It could be way less verbosive in case built-in hight-level api of aws cdk will support edge lamdas. 
This stack definition contains the CloudFront definition itself, 
S3 bucket to serve static files from and also a custom resource lambda to fetch the edge lambda version

_cdk.js (CloudFront)_
```js
class StaticSiteStack extends cdk.Stack {
  constructor(parent, id, props) {
    super(parent, id, props);

    /* 
     * Custom resource lambda to query the edge lambda stack
    */
    const lambdaProvider = new lambda.SingletonFunction(this, 'Provider', {
      /* 
         to avoid multiple lambda deployments 
         in case we will use that custom resource multiple times 
       */
      uuid: 'f7d4f730-4ee1-11e8-9c2d-fa7ae01bbebc', 
      code: lambda.Code.asset('./cfn'),
      handler: 'stack.handler',
      timeout: 60,
      runtime: lambda.Runtime.NodeJS810,
    });

    /*
        To allow aws sdk call inside the lambda
        Such a nice API!
    */
    lambdaProvider.addToRolePolicy(
      new iam.PolicyStatement()
        .allow()
        /* 
           obviously you will need another policy 
           in case you will choose another way to query the version 
         */
        .addAction('cloudformation:DescribeStacks')
        .addResource(`arn:aws:cloudformation:*:*:stack/${LAMBDA_EDGE_STACK_NAME}/*`)
    );

   // This basically goes to another region to edge stack and grabs the version output
    const stackOutput = new cf.CustomResource(this, 'StackOutput', {
      lambdaProvider,
      properties: {
        StackName: LAMBDA_EDGE_STACK_NAME,
        OutputKey: LAMBDA_OUTPUT_NAME,
        /* just to change custom resource on code update */
        LambdaHash: sha256('./lambda/index.js')
      }
    });

    // Here we will upload our website
    const bucket = new s3.Bucket(this, 'bucket', {
      publicReadAccess: true // not really sure I need this permission actually
    });

    const origin = {
      domainName: bucket.domainName,
      id: 'origin1',
      s3OriginConfig: {}
    };

    // CloudFrontWebDistribution will simplify a lot, 
    // but it doesn't support  lambdaFunctionAssociations in any way right now :(
    const distribution = new cfr.CfnDistribution(this, 'WebSiteDistribution', {
      distributionConfig: {
        aliases: ['site.' + DOMAIN_NAME, '*.site.' + DOMAIN_NAME],
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
    }).findAndImport(this, 'MyPublicZone'); // Name can be anything

    new r53.AliasRecord(this, 'BaseRecord', {
      recordName: 'site', // Meaningful part only, ommiting  DOMAIN_NAME
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

    // Bunch of outputs to see everything manually
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

### Stack creation

_cdk.js (Stack creation)_
```js
const ls = new LambdaStack(app, LAMBDA_EDGE_STACK_NAME, {
  env: {
    region: 'us-east-1' // note that edge can be deployed only here
  }
});

new StaticSiteStack(app, 'cf-stack').addDependency(ls);

app.run();
```

### Custom resource lambda code

Custom resource lambda which will grab the output

_/cfn/stack.js (Custom resource)_
```js
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


## To test that it works:

We can create fake lambda with debug output first

_/lambda/index.js (Edge lambda)_
```js
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

The real lambda btw looks something like this:

```javascript
exports.handler = (event, context, callback) => {
  console.log("REQUEST", JSON.stringify(event));

  const {request} = event.Records[0].cf;
  const {host} = request.headers;

  if (host && host.length) {
    const [subdomain] = host[0].value.split(".");

    if (subdomain) {
      const [number, ...service] = subdomain.split('-');

      if (number && service) {
        const path = require('path');

        if (!path.extname(request.uri)) {
          request.uri = '/index.html';
        }

        request.uri = `/preview/${service.join("-")}/${number}${request.uri}`;
      }

      return callback(null, request);
    }
  }

  callback("Missing Host header");
};
```
