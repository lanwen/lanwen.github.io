---
title: "How to create a custom Jenkins Pipeline DSL"
tags: ["groovy", "jenkins", "ci"]
---

## And why would you need that?

I personally don't like Jenkins and would recommend considering alternatives if possible - like GitHub Actions, simple 
AWS Lambdas or something else to keep away from the Jenkins. However, despite the Jenkins in 2021 still more like a poorly 
written automation framework, always in a PoC stage, it's still a thing. I actually admire Jenkins for being such a 
customizable thing - you can do whatever you want, if you have some extensive time to debug and really know what do you
want.

I wanted to get a short version of our deployment pipeline copied across dozens of projects in a mostly the same shape with 
exclusion for a few configuration properties. The officially recommended way of dealing with that kind of duplication - 
moving everything into a shared lib. We obviously had that already for steps, however, how to extract the entire pipeline?

Well, that's the point where official documentation becomes vague - most of the stuff it could suggest is to create a 
`var/backendPipeline.groovy` file with `def call() {}` method. That's simple - our steps work this way. I assume you aware of
the _scripting_ and _declarative_ pipeline difference. So most of the time it's recommended by the community to extract your 
pipeline as a *scripting* pipeline to be flexible in the things and feed it with params. But would that work with 
a *declarative* pipeline? 

Yes, it would. Because of the _always-in-PoC-stage_ fame of Jenkins, some declarative pipeline features that wasn't more 
than a hack without much of support for parameters and actually extraction to a library came unnoticed by the wide community.
That was released quite for a while ago and now should be stable: https://www.jenkins.io/blog/2017/10/02/pipeline-templates-with-shared-libraries/

So back to the question - how to reuse the pipeline really and make it configurable? That are two different questions.

## Configuring your pipeline

First, it's always good to have a nice, static configuration which gives a definition of what has to be done. That would
help later to test, extend or adjust a pipeline without changing much in projects using it. Also, that would enable us to 
change anytime from the declarative to scripting approach of a pipeline. So good starting point would be to define a structure
in terms of maps of maps of... maps to understand more about parameters really needed. On this stage some parameters can actually
be completely wiped out and replaced by simple checks of the file presence, scm variables or implicit usage of other params.

For example instead of defining type of the project like _java_ or _go_ - you could just check if `pom.xml`, `build.gradle` or `go.mod` file
is there (more on that later).

### How it could look on this stage? 

Let's start with the method accepting a `Map`:
```groovy
// vars/backendPipeline.groovy
def call(Map params) 
```

In the `Jenkinsfile` that would look something like:

```groovy
backendPipeline([
        branch: "main",
        images: ["app": "DockerImageNameParam", "proxy": "ProxyDockerImageNameParam"], 
        deploy: ["path", "./"],
])
```

Then in the pipeline itself just access params as simple as `params.branch` or `params.images.app`. 

Most of the time, you can stop here and go straight to the pipeline itself. However, how to make it more specific to your 
domain and describe things in a self-documented way?

### Groovy magic

What is really cool - `Jenkinsfile`s are still kinda... groovy. Not fully, but almost. Thus, we can you some magic of groovy DSLs.
I found a great article which explains mostly everything https://sandstorm.de/de/blog/post/how-to-create-a-dsl-with-groovy.html,
so I would only mention a few caveats and the end-result.

My DSL expected to look like this:

```groovy
backendPipeline {
    branch "master"

    // module expected to build a docker image and inject it as a parameter during the deployment with the name
    module "app", export: "DockerImage"
    module "proxy", export: "ProxyDockerImage"

    stack("service") {
        // this is an optional parameter in case we don't need to deploy to both envs we have
        only "staging" // default: "staging" and "prod"

        params { // some parameters we have to specify manually depending on the env
            staging = [
                RemoteBucketParam: "lksd4nnl.s3.aws.com",
            ]

            prod = [
                RemoteBucketParam: "lksd4nnl.s3.aws.com"
            ]
        }
    }
}
```

> NOTE: As you can see - not that much changed compared to a naive Map-like solution, just with some syntax sugar it reads slightly better...
> So if it's worth of maintaining a bunch of additional code for the DSL itself... not sure, but I like human-readable DSLs, and it's fun to develop them!

Following the mentioned article, code to support the DSL should be like bunch of configuration classes, wrapped with the 
DSL providers:

(place it just before the `call` method)
```groovy
class BackendPipelineConfiguration {
    // default values better always to have explicit
    // that would allow to omit them in the dsl on use and make it more compact
    String branch = "master" 
    Map<String, StackConfiguration> stacks = [:]
    Map<String, String> modules = [:] // that would hold results of `module "app", export: "DockerImage"`
}

class StackConfiguration {
    List<String> envs = ["staging", "prod"] // `only "env"` would override this list entirely
    Map<String, Map<String, String>> params = [:]
}

class BackendPipelineDSL {
    private final BackendPipelineConfiguration conf

    BackendPipelineDSL(BackendPipelineConfiguration conf) {
        this.conf = conf
    }

    // the simplest possible thing for the dsl - just a method assigning the value
    // args could have default values, so that calling method without args would still do something
    // keeping it configurable
    void branch(String branch) {
        this.conf.branch = branch
    }

    // this case is interesting, as it would be called as 
    // `module "app", export: "DockerImage"` - with both named and unnamed params
    // however, groovy moves named params to the first place as a map, so the method call above is actually 
    // module([export: "DockerImage"], "app")
    void module(Map<String, String> args, String name) {
        this.conf.modules[name] = args.export
    }

    // we could go as deep as we need to define more DSL levels with some namespace
    // so here it would be part `stack("service") { ... }` delegating to a StackConfigurationDSL with
    // StackConfiguration as an object to store result
    void stack(String name, Closure details) {
        def stack = new StackConfiguration()
        details.resolveStrategy = Closure.DELEGATE_FIRST
        details.delegate = new StackConfigurationDSL(stack)
        details()
        this.conf.stacks[name] = stack
    }

    // this method is purely for tests
    static BackendPipelineConfiguration create(Closure body) { 
        def conf = new BackendPipelineConfiguration()
        body.resolveStrategy = Closure.DELEGATE_FIRST
        body.delegate = new BackendPipelineDSL(conf)
        body()
        return conf
    }
}


class StackConfigurationDSL {
    private final StackConfiguration conf

    StackConfigurationDSL(StackConfiguration conf) {
        this.conf = conf
    }

    // replaces the content entirely, as we need either 2 default envs or just one specific
    void only(String env) {
        this.conf.envs = [env]
    }

    // we don't have to create a full-featured object to store params if just a map is enough
    void params(Closure body) {
        Map<String, Map<String, String>> params = [:]
        body.resolveStrategy = Closure.DELEGATE_FIRST
        body.delegate = params
        body()
        // don't forget to bring it back to an object we use later
        this.conf.params = params
    }
}
```

### Is everything correct?

To debug and understand if it's a right configuration jenkins provides a nice hack - *Replay* for your pipeline.
If you open any pipeline execution, you could replay it, adjusting the content. Just paste classes of the DSL and do the following to print the structure:

```groovy
println groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(BackendPipelineDSL.create {
  // here goes the actual DSL content...
}))
```

That would print some JSON with the structure, which later easy to use for debugging.

>NOTE: Script security would block json methods by default, so better to use temp jenkins instance to actually debug this part.
> Also nothing stops from writing a few unit tests...


## Declarative pipeline

After we're done with the configuration, time to actually use that. Wouldn't paste here the entire result, as it's really
project specific, however here are a few moments:

### How to get a configuration available

```groovy
def call(body) {
    // evaluate the body block, and collect configuration into the object
    def conf = new BackendPipelineConfiguration()
    body.resolveStrategy = Closure.DELEGATE_FIRST
    body.delegate = new BackendPipelineDSL(conf)
    body()

    pipeline {
        // entire declarative pipeline... here you can access conf.branch, conf.modules...
    }
}
```

Some examples suggest calling a closure argument as `script` instead of `body` - don't do that mistake - that would break
the jenkins pipeline as it has `script {}` block. Same works with other reserved words - to avoid confusion and some weird bugs - 
better to choose names not used by the pipeline itself in the dsl or variables (or keep it under control).

### Nested stages

One of the greatest features of the declarative pipeline - nested stages. So it could be something like

```groovy
stages {
    stage("build") {
        stages {
            stage("java") {
                // ...
            }
        }
    }
}
```

The cool thing - is that you can place `when` condition on a top level stage to skip an entire set with just one condition.
If your condition is dependent purely on the configuration - you can even check something before the agent like this:

```groovy
stage('infrastructure') {
    when {
        expression { return conf.deploy == null } // or some other prop
        beforeAgent true // pay attention to this
    }
    agent any

    stages {
        // ...
    }
}
```

if the condition evaluates to false - it wouldn't even start an agent to skip the set of stages - so that would be quite fast!

### More on conditions

This one would allow to check if it's java gradle project and act accordingly:
```groovy
when {
    expression { return fileExists("build.gradle") }
}
```

### More on config usage

Obviously not everything could be expressed via the declarative pipeline. In that case - scripting one could be
embedded into the declarative:

```groovy
stage("docker build & push") {
    steps {
        script {
            def images = [:] // this variable would be available in another stage after
            for (module in conf.modules) {
                // some custom step returning the result
                // pay attention to env.JOB_BASE_NAME and other global envs - they are quite useful to avoid
                // unnessessary params
                images[module.value] = buildAndPush(env.JOB_BASE_NAME + "-" + module.key, module.key)
            }
        }
    }
}
stage('deploy') {
    steps {
        script {
            // iterate over the map and list from the config to create a stage via scripted pipeline
            for (stack in conf.stacks) {
                for (env in stack.value.envs) {
                    stage("${stack.key}:${env}") {
                        // some custom step from the vars/deploy.groovy file
                        deploy("${stack.key}-${env}", [ Env: env ] + images + stack.value.params.staging)
                    }
                }
            }
        }
    }
}
```

## Summary

That's it, later this pipeline could be gracefully replaced with another one with the same config or other way around - 
keeping the logic it could be another way of configuration (yaml?).