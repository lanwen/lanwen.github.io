---
title: "How to ignore partial Jest snapshot diffs"
tags: ["jest", "tests", "js", "aws-cdk"]
---

## Or how to help with CDK lambda snapshot diffs

I use aws-cdk to deploy lambdas for a while already, as it's a quite convenient way to define all the infra with nice 
constructs library. It's also quite handy to have snapshots tests, which could show what exactly changed in the resulting
template without many efforts from your side to maintain the test. 

Usually the definition of the lambda looks like this:

```javascript
new lambda.Function(this, "Function", {
    runtime: lambda.Runtime.GO_1_X,
    handler: "main",
    memorySize: 128,
    code: lambda.Code.fromAsset("../lambdas/bin"),
});
```

if we write a snapshot test:

```javascript
test('should be generated', () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});
```

on a next change of a code it would fail, complaining on the different hash. Most of the time, we don't really care about the
hash in the parameters and thus have to workaround that diff to be in a valid position if nothing else changed.

One of the ways to solve that - usage of the filters:

```javascript
test('should be generated', () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot({
        Parameters: expect.any(Object)
    });
});
```

However, I didn't get how to ignore some deep object fields, referring the parameter. So better solution would be to use
a [snapshot serializer](https://jestjs.io/docs/en/configuration#snapshotserializers-arraystring).

Right before the test do:

```javascript
expect.addSnapshotSerializer({
    test: val => typeof val === 'string' && val.match(/AssetParameters([A-Fa-f0-9]{64})(\w+)/),
    print: val => '"AssetParameters-[HASH REMOVED]"',
})

expect.addSnapshotSerializer({
    test: val => typeof val === 'string' && val.match(/(\w+) for asset\s?(version)?\s?"([A-Fa-f0-9]{64})"/),
    print: val => {
        return '"' + val.replace(/(\w+ for asset)\s?(version)?\s?"([A-Fa-f0-9]{64})"/, '$1 [HASH REMOVED]') + '"';
    },
})
```

then snapshot would become stable:

```diff
    "Parameters": Object {
-     "AssetParameterscd85abc75dd09d2d637d4725a0d4c4e38e2fa628960e69be0d16bcde580f92f2ArtifactHashFCB193A6": Object {
-       "Description": "Artifact hash for asset \"cd85abc75dd09d2d637d4725a0d4c4e38e2fa628960e69be0d16bcde580f92f2\"",
+     "AssetParameters-[HASH REMOVED]": Object {
+       "Description": "Artifact hash for asset [HASH REMOVED]",
        "Type": "String",
      },
```

code of the serializer could be obviously smarter, as of now, it would destroy the difference between different assets if 
you have multiple. However, I wouldn't recommend snapshot tests for that kind of checks, as they are more for generic checks
that all fine.

More to read:
- https://medium.com/@luisvieira_gmr/jest-snapshot-serializers-6a96f5c362a1
