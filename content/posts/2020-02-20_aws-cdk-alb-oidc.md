---
title: "How to secure target behind AWS ALB with OIDC and cdk"
tags: ["aws", "aws-cdk", "cloudformation", "security"]
---

Recently found a tremendous article on [How to secure something with ALB authentication?](https://cloudonaut.io/how-to-secure-your-devops-tools-with-alb-authentication/).

Article opens a number of neat usecases for additional security layers, or a way to get info about users without implementing the whole OIDC stuff
on your own.

### So...

To get it done, I've taken [AWS CDK](https://aws.amazon.com/cdk) version `1.24.0`, and found that it's pretty hard to do, actually!

> As a side note: I already had some [nice experience](/posts/tags/aws-cdk) with cdk, so you could check my other posts.

The whole feature of [Authenticate Users Using an Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html) 
wasn't supported in the CDK on high level. "_That's sad, but not terrible_", - thought I.

### And...

Prepared to get my hands dirty and opened a dedicated documentation [Using AWS CloudFormation Constructs Directly](https://docs.aws.amazon.com/cdk/latest/guide/cfn_layer.html) page.

The nice thing about CDK is that you always can fallback to the raw CF constructions. That's super powerful, but sometimes could be quite annoying to do the most of heavy-lifting on your own. 
So the better approach would be to adjust only a small piece of a resulting template.

#### Sidenote

As a rule of thumb in my infrastructure definitions I prefer to use JavaScript. 
TypeScript is cool, but too verbose when you just grab components. I still would recommend TS for the library/component development.

## Preconditions

Let's assume you already have something you want to call, and a listener you would like to attach to your new rule with auth. 
As well as some target. My original idea was to use lambda, doing some shady stuff using your email from the ID token.

```javascript
const targets = require('@aws-cdk/aws-elasticloadbalancingv2-targets');
const lambda = require('@aws-cdk/aws-lambda');
const elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');

const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, "Listener", { 
    listenerArn: "arn:aws:elasticloadbalancing:...:...:listener/app/listnr-17DIUG621IW/9a3d87dsm5479f7f6/c99ba2344014371",
    securityGroupId: "sg-0e315ff"
});

const fn = new lambda.Function(this, 'ManagementLambda', {
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: 'handlers/handler',
    code: lambda.Code.fromAsset('lambdas/src/'),
});

const target = new elbv2.ApplicationTargetGroup(this, "ManagementLambdaTargetGroup", {
    targets: [new targets.LambdaTarget(fn)],
})
```

With some regular code to add a new rule:

```javascript

const rule = new elbv2.ApplicationListenerRule(this, "CertManagementListenerRule", {
    priority: 5,
    listener: listener,
    hostHeader: 'internal.lanwen.ru',
});

rule.addTargetGroup(target);
```

## Where the magic comes

The most scary part is not big, but requires some api reference and debug to get it right.

First, we need to give our existing action an order, as it's required when you have 2 of them. 
Since the first one will be auth, default one goes to the second place.
This is a great example of an ability to change the props directly even the hi-level constructs doesn't provide you a nice way to do it.
 
```javascript
rule.actions[0].order = 2;
```

Since we're not using ts, we should do same things cdk doing during conversion on our own.

I just copied the approach used in the process of the node construction in the lib, when you do `addTargetGroup`.
CDK this way safely converts new action to a proper low-level construction without need from our side to directly
manipulate CF object definition with all that unpretty deep-nested stuff.
```javascript
rule.node.defaultChild.actions = cdk.Lazy.anyValue({
    produce: () => [{
        authenticateOidcConfig: { // the whole interface generated from the cfn, so already available as is
            authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
            clientId: "1",
            clientSecret: "2",
            issuer: "https://accounts.google.com",
            tokenEndpoint: "https://oauth2.googleapis.com/token",
            userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo"

            //don't forget to change timeout and cookie name
        },
        type: "authenticate-oidc",
        order: 1
    }, ...rule.actions] // here we pass previous action after our new
});
```

## Summary

As a conclusion - that's great to have an ability to fine-tune anything. It's not easy, but takes not that much code,
comparing to go CFN resources directly, it took me a while until it finally clicked. Snapshot tests help here a lot!

Also, don't forget that ALB requires internet access to make this feature work.

The issue to support: [aws/aws-cdk#6308](https://github.com/aws/aws-cdk/issues/6308) 