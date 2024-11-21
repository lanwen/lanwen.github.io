---
title: "Deploying External Secrets with eksctl and Pod Identity Association"
tags: ["k8s", "external-secrets", "eksctl"]
draft: false
---

# eksctl

We use eksctl to provision eks clusters in aws, which is despite being not GitOps-friendly, still provides nice capabilities to manage clusters with a limited quantity.
Once the cluster is created, there is often a need to integrate it with other aws services, or manage secrets. Recently, I found a nice article, which explains how [Pod Identity Association](https://dev.to/aws-builders/easy-aws-permissions-for-your-eks-workloads-pod-identity-an-easy-way-to-grant-aws-access-13oj?mc_cid=d32592fc02&mc_eid=32f8ba6a79) works in simple terms. This article helped to understand relationship with service accounts and open the way to adopt it for other usecases.

## Prerequisites

The concept is relatively fresh, so it could be still tools that didn't upgraded their aws sdk to the version, that supports it, so it might be worth checking, if the tool uses at least `1.47.11` aws go sdk. I learned that from the [`aws-load-balancer-controller` issue](https://github.com/kubernetes-sigs/aws-load-balancer-controller/issues/3503), which also gives some context on how it actually works.

## Using with eksctl

### First of all, why

This mechanics helps a lot to eliminate intermediate trust provider, since communication happens directly via API based on the new identity:

```json
"Principal": {
    "Service": "pods.eks.amazonaws.com"
},
```

so any role, that allows assumption for this principal, will be able to have Pod Identity Association and directly used by the service account without updates of the OIDC stuff. It greatly helps to define permissions right in the eksctl config.

### How

It's well explained in the [oficial docs for eksctl](https://eksctl.io/usage/pod-identity-associations/#eks-pod-identity-associations), but here is an example:

```yaml
---
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  version: "1.29"
  name: lab
  region: eu-central-1
  tags:
    lab.lanwen.dev/cluster/type: home

addons:
  - name: eks-pod-identity-agent # required for `iam.podIdentityAssociations`

iam:
  podIdentityAssociations:
    - serviceAccountName: aws-load-balancer-controller
      namespace: kube-system
      createServiceAccount: true
      wellKnownPolicies:
        awsLoadBalancerController: true
```

eksctl tries to be quite smart here and can be used directly to create everything required if the role is used directly by the pod. For example, in this case, it will create both `kube-system/aws-load-balancer-controller` service account, as well as the **CloudFormation** stack, which includes the role, having trust relationship containing:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "pods.eks.amazonaws.com"
            },
            "Action": [
                "sts:AssumeRole",
                "sts:TagSession"
            ]
        }
    ]
}
```

as well as a bunch of permissions, embedded into eksctl provision knowledge to do everything to manage load balancers.

However, we can do more here and can add inline policies (as well as attached by arn) to help bootstraping something without the need to deal with aws access secrets!
It might be worth noting, that during iteration over the policy, it can be convenient to immediately apply changes too existing cluster using config and two commands:

```bash
eksctl update podidentityassociation -f config.yaml || true
eksctl create podidentityassociation -f config.yaml || true
```

For me one or another could fail in case I had to add a new polic (update will fail with not found), or update existing (create will fail as already existing), how while scripting it might be worth having both this way.

## Usecase

Let's imagine, that we need to manage secrets using GitOps approach, and don't pay crazy bills with hundreds of secrets, pulled from aws. Obvious choice would be to use [SealedSecrets](https://github.com/bitnami-labs/sealed-secrets). I wouldn't go here in the details on how painful it could be to manage hundreds of secrets with it, but it's a valid option! However, once the target secret is encrypted, you have to keep around the original *encryption key secret*, until you re-encrypt all the secrets with the new key (but then, you would need to keep that key around) - and somehow share that key with other clusters if they are provisioned from the same git repo. 

README [suggests](https://github.com/bitnami-labs/sealed-secrets?tab=readme-ov-file#manual-key-management-advanced), that you can use the `SealedSecret` for that purpose, but then, you have to have that initial seed key somewhere. Chicken and the egg problem?

There is, actually, a way to quickly download the current master key to share it later with another cluster:

```bash
kubectl \
  get secrets \
  --namespace=kube-system \
  --selector="sealedsecrets.bitnami.com/sealed-secrets-key=active" \
  --output=yaml \
  | yq 'del(.items[].metadata.resourceVersion,.items[].metadata.uid,.items[].metadata.annotations."kubectl.kubernetes.io/last-applied-configuration",.items[].metadata.creationTimestamp)' | yq '.items[0]' > master-secret.yaml 
```

However, that's a manual action, which opens up this dangerous secret to a local env. 

This can be avoided using another project for secret management - [External Secrets](https://external-secrets.io/latest/introduction/getting-started/), which potentially, could be used completely instead of sealed secrets, but since requests to aws secrets are not free, it can become an expensive alternative (but way more convenient for sure!).

### External Secrets

Everything starts with the proper eksctl config:

```yaml
---
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  version: "1.29"
  name: lab
  region: eu-central-1
  tags:
    lab.lanwen.dev/cluster/type: home

addons:
  - name: eks-pod-identity-agent # required for `iam.podIdentityAssociations`

iam:
  podIdentityAssociations:
    # https://github.com/external-secrets/external-secrets/issues/2951#issuecomment-2016979039
    - serviceAccountName: external-secrets # name is important for the helm installation method, but can be adjusted via params
      namespace: external-secrets
      createServiceAccount: true
      permissionPolicy:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Action: [
              "secretsmanager:GetResourcePolicy",
              "secretsmanager:GetSecretValue",
              "secretsmanager:DescribeSecret",
              "secretsmanager:ListSecretVersionIds"
            ]
            Resource:
              - "arn:aws:secretsmanager:eu-central-1:000111222333:secret:/lab/*"
            Condition:
              StringEquals:
                aws:ResourceTag/cluster: "home" # nice way to open up secrets for External Secrets via tags

# Security Controls will appreciate this log if you're interested about things happening about cluster (not free though)
cloudWatch:
  clusterLogging:
    logRetentionInDays: 7
    enableTypes:
      - "audit"
```

Once cluster created with eksctl (or only `podidentityassociation`), External Secrets have to be installed. I usually use helm, but as a template engine - this way it's more predictable and reproducible, especially in scripts:

```bash
kubectl create namespace external-secrets --dry-run=client -o yaml | kubectl apply -f -
helm repo add external-secrets https://charts.external-secrets.io

# to get a new version
# helm repo update external-secrets && helm search repo external-secrets --versions
EXTERNAL_SECRETS_VERSION=0.9.20 # always fix versions in scripts!

helm template external-secrets --version "${EXTERNAL_SECRETS_VERSION}" external-secrets/external-secrets \
    -n external-secrets \
| kubectl apply -f -
```

That should start controller already with the right permissions. Don't forget to recreate the pod if you change the role, as it's not updated during runtime.

Then, important part - `SecretStorage` as well as `ExternalSecret`:

```yaml
# template/00-external-secrets-base-secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: base-secret-store
  namespace: kube-system # same as sealed-secrets ns
spec:
  provider:
    aws:
      service: SecretsManager
      region: eu-central-1
      # role: <more about roles below>
```

Here comes a little bit of a tricky understanding - once you use *Pod Identity Association*, which could be checked with:

```bash
aws eks list-pod-identity-associations --cluster-name lab

{
    "associations": [
        {
            "clusterName": "lab",
            "namespace": "external-secrets",
            "serviceAccount": "external-secrets",
            "associationArn": "arn:aws:eks:eu-central-1:000111222333:podidentityassociation/lab/i-e2bewwrravvqumiinu",
            "associationId": "i-e2bewwrravvqumiinu"
        }
    ]
}

# with more info about the role via:
# see https://github.com/external-secrets/external-secrets/issues/2951#issuecomment-1954767547 for example
aws eks describe-pod-identity-association --cluster-name mycluster-0 --association-id a-9n44rhfah0x0jnybz | jq
{
  "association": {
    "clusterName": "mycluster-0",
    "namespace": "security",
    "serviceAccount": "external-secrets",
    "roleArn": "arn:aws:iam::xxx:role/xplane-external-secrets-mycluster-0",
    "associationArn": "arn:aws:eks:eu-west-3:xxx:podidentityassociation/mycluster-0/a-9n44rhfah0x0jnybz",
    "associationId": "a-9n44rhfah0x0jnybz",
    "tags": {
      "crossplane-providerconfig": "default",
      "crossplane-kind": "podidentityassociation.eks.aws.upbound.io",
      "crossplane-name": "xplane-external-secrets-mycluster-0-brp5f-rg8ps"
    },
    "createdAt": "2024-02-20T18:36:43.903000+01:00",
    "modifiedAt": "2024-02-20T18:36:43.903000+01:00"
  }
}
```

External Secrets pod will already operate as assumed role, created with policy in the eks config. And that will be the default permission for the `SecretStore` to fetch secrets.

### BUT

It can be extended further with more fine-grained role assumption chain. Externally, or using crossplane, for every secret group, can be created a new policy and attached to a role, which has now assume role policy:

```json
{
    Version: "2012-10-17"
    Statement: [{
      Action: [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
      Effect: "Allow"
      Principal: {
        AWS: <role ARN from the pod identity association>
      }
    }]
}
```

and then, this role can be specified by the store to be assumed when fetching secrets. So follow the schema: eksctl creates an initial role with the pod identity association `->` for a specific service account `->` this account allows for pod to assume the role `->` that role allows to assume very specific role for the `SecretStore`

### MasterSecret

Once downloaded initially, we can upload the Sealed encryption keypair to secrets manager as is, following the structure. To bring it back to the target namespace, this manifest is required:

```yaml
#template/01-external-secrets-master-external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: "sealed-secrets-seedkey" # final secret will have the same name
  namespace: kube-system
spec:
  secretStoreRef:
    name: base-secret-store 
    kind: SecretStore

  refreshInterval: "0" # we don't plan to change the seed key in-place automatically, so disable the refetch

  target:
    template:
      type: kubernetes.io/tls
      metadata:
        labels:
          sealedsecrets.bitnami.com/sealed-secrets-key: active # this will tell sealed secrets to use it

  data:
    - secretKey: "tls.crt" # this will become a `data: tls.crt` structure at the target secret
      remoteRef:
        key: /lab/secret # key is actually name of the secret
        property: "tls.crt" # property inside of the secret (if used a simple generic key-value secret type)
        decodingStrategy: Base64 # since we copied the value as is from the key secret, it's already base64 encoded, so no need to encode it again
    - secretKey: "tls.key" # just the same thing for another field. 
      remoteRef:
        key: /lab/secret
        property: "tls.key"
        decodingStrategy: Base64
```

Once deployed:

```bash
kubectl apply -f template/00-external-secrets-base-secret-store.yaml
kubectl apply -f template/01-external-secrets-master-external-secret.yaml
kubectl wait externalsecret -n kube-system "$(yq '.metadata.name' template/01-external-secrets-master-external-secret.yaml)" --for=condition=Ready --timeout=1m
```

we can continue with the sealed secrets init:

```bash
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets

# helm repo update sealed-secrets && helm search repo sealed-secrets --versions
# to get chart to release mapping
SEALED_SECRETS_VERSION=2.16.1

helm template sealed-secrets --version "${SEALED_SECRETS_VERSION}" sealed-secrets/sealed-secrets  \
    -n kube-system \ # mentioned by readme of the project
    --set-string fullnameOverride=sealed-secrets-controller \ # with this you won't have to constantly specify controller name using kubeseal
    --set-string keyrenewperiod=0 \ # since we manage our key manually, disabling renew (more in readme)
    --include-crds \
| kubectl apply -f - -n kube-system
```

After that, we should be good to go for `SealedSecrets`
