---
title: "AWS Client VPN with mutual TLS"
tags: ["aws", "aws-cdk", "cloudformation", "vpn"]
---

AWS not that far ago announced managed [Client VPN](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/what-is.html),
which is a really simple way of scalable and easy-to-maintain solution. 

To get it done, I've taken [AWS CDK](https://aws.amazon.com/cdk) version `1.20.0`, 
I already had some [nice experience](/posts/tags/aws-cdk) with it, 
so all new things trying to do with this lib.

### To get it work, we need only a few things:

- Some VPC we want to connect to.
- Certificate Authority which gives us server and a client cert for the mutual TLS 
  (_that's the simplest way to start if you don't have already an AD_)

I've found in a [good blog post](https://www.performancemagic.com/2019/01/10/client-vpn-mutual-auth/) overall process with some pictures.
So here I would publish only code, only hardcore :D

## VPN Endpoint

We need to start with some imports and class definition:

```javascript
const cdk = require('@aws-cdk/core');
const ec2 = require('@aws-cdk/aws-ec2');
const logs = require('@aws-cdk/aws-logs');
const certmgr = require('@aws-cdk/aws-certificatemanager');

class VpnStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // this variable we would pass assuming you already have a certificate
        // you could use the same for a server and a client endpoint parts of the config
        // if all the client ones would have the same CA
        const {certArn} = props;
    }
}

module.exports = { VpnStack };
```

Next step - add all the requirements - VPC and certs.

```javascript
const vpc = ec2.Vpc.fromLookup(this, 'ClientVpnVpc', {
    // I'm using default one, 
    // but obviously you could create new or choose another existing.
    // this action will require explicitly defined region and account 
    // and creates a context file to cache the knowledge 
    // (or fetches it from the aws before the synth).
    // About region and acc I would show later, but for me it looks weird, 
    // why I have to define it once more?
    isDefault: true 
});
```

To import certs I'm using a bit more verbose version, 
but I beleive it gives some validation in the background.

```javascript
const clientCert = certmgr.Certificate.fromCertificateArn(
    this,
    'ClientCertificate',
    certArn
);
const serverCert = certmgr.Certificate.fromCertificateArn(
    this,
    'ServerCertificate',
    certArn
);
```

Also, I find it better to create a logging group in advance

```javascript
const logGroup = new logs.LogGroup(this, 'ClientVpnLogGroup', {
    retention: logs.RetentionDays.THREE_MONTHS
});

const logStream = logGroup.addStream('ClientVpnLogStream');
```

The most important step, is to create endpoint itself:

```javascript
const endpoint = new ec2.CfnClientVpnEndpoint(this, 'ClientVpnEndpoint', {
    authenticationOptions: [{ // actually, don't know if I enable both - would it require both or just pick the one?
        type: "certificate-authentication", 
        mutualAuthentication: {
            clientRootCertificateChainArn: clientCert.certificateArn
        }
    }],
    // Nice article where this CIDR comes from (spoiler: its random private)
    // https://openvpn.net/community-resources/numbering-private-subnets/
    // Also it shouldn't clash with existing subnets
    clientCidrBlock: "10.27.0.0/20",
    connectionLogOptions: {
        enabled: true,
        cloudwatchLogGroup: logGroup.logGroupName,
        cloudwatchLogStream: logStream.logStreamName
    },
    serverCertificateArn: serverCert.certificateArn,
    // If you need to route all the traffic through the VPN (not only for the resources inside, turn this off)
    splitTunnel: true,
    // You can omit this, 
    // but then private resources and private hosted zone resolution won't work, 
    // since on your client side it wouldn't be delivered anyhow
    // at least Tunnelblick says nothing about DNS when this is empty
    dnsServers: ["172.1.0.2"] // vpc cidr base + .2 (Mine was 172.1.0.0/16)
});
```

You can expand the subnets using something like a [subnet calculator](https://mxtoolbox.com/subnetcalculator.aspx#) tool.

Last two steps to get it working:

```javascript
// I didn't have a private/isolated subnets in a default vpc, so got the public ones.
vpc.publicSubnets.map(subnet => new ec2.CfnClientVpnTargetNetworkAssociation(this, 'ClientVpnNetworkAssociation-' + subnet.subnetId, {
    clientVpnEndpointId: endpoint.ref,
    subnetId: subnet.subnetId
}));

// This thing is designed more for AD controls, so for the mutual TLS its quite permissive
// To control precisely, you could assign a security group, but for now its not implemented in the CF yet.
new ec2.CfnClientVpnAuthorizationRule(this, 'ClientVpnAuthRule', {
    clientVpnEndpointId: endpoint.ref,
    targetNetworkCidr: "0.0.0.0/0",
    authorizeAllGroups: true,
    description: "Allow all"
});
```

Links to check improvements: [aws/aws-cdk#4233](https://github.com/aws/aws-cdk/pull/4233) and [aws-cloudformation/aws-cloudformation-coverage-roadmap#199](https://github.com/aws-cloudformation/aws-cloudformation-coverage-roadmap/issues/199)

## Launch it!

```javascript
const cdk = require('@aws-cdk/core');
const { VpnStack } = require('../lib/vpn-stack');

const app = new cdk.App();
new VpnStack(app, 'client-vpn', {
    // this thing can be passed as a context param or as a aws parameter, 
    // but I'm getting that from a shell script and pass it with a file which then read here
    // a bit hacky, but works!
    certArn: "some existing arn",
    // to enable vpc discovery in the stack explicit env variables required with region and account
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});
```

## Testing

Worth mentioning, that AWS CDK provides a test framework to test the definition! 
Definitely nice thing to have during the regular build pipeline.

Won't list the full test, but it's generated by the `cdk` tool when init the new project.

### That's all, folks!

As a next steps we could think about certificate authority management as well as different things around vpn 
if you use that to hide your infrastructure to be only employee-accessible.