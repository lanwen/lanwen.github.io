---
title: "How to debug a pulsar function using testcontainers"
tags: ["pulsar", "pulsar-functions"]
---

[Pulsar functions](https://pulsar.apache.org/docs/en/functions-overview/) are a very nice concept to do something simple 
with zero infrastructure around to run. However, official documentation lacks of precise details on how to debug a function.

It is assumed, you already have pulsar up and running, you already somehow built and uploaded a jar there with all 
necessary params passed properly. That could be tough. Beside that, proposed local runner won't show everything as it would be 
in a cluster mode. So some of the [issues](https://github.com/apache/pulsar/issues/6883) could be discovered only after deployments.

So how we can make it way less painful? The awesome [testcontainers](https://www.testcontainers.org/) project along with the gradle flexibility would help.

## TL;DR

I've prepared a [small demo project](https://github.com/lanwen/pulsar-functions-example) to showcase valuable moments. 
Check out other than master branches too, some additions there could be interesting as well!

## Project structure and gradle highlights

To fully emulate e2e fashion better to organize the project as a multimodule-project where function classes and dependencies - one module and 
everything related to tests - in another dedicated one.

```shell script
|__ functions
| |_ build.gradle
|__ tests
| |_ build.gradle
|
|__ build.gradle
|__ settings.gradle
``` 

The root project file is quite simple and defines platform dependencies (which will allow us to omit versions in nested modules).

_build.gradle_
```groovy
plugins {
    id 'java'
}

allprojects { // to avoid some repeating in nested modules
    apply plugin: 'java'

    repositories {
        jcenter()
    }

    dependencies {
        // check out dependabot to update the version automatically! :)
        testImplementation platform('org.junit:junit-bom:5.6.2') 
        // our precious and main hero
        testImplementation platform('org.testcontainers:testcontainers-bom:1.14.1') 
        // to simplify some consumer/producer code
        testImplementation platform('io.projectreactor:reactor-bom:Dysprosium-SR7') 

        testImplementation 'org.junit.jupiter:junit-jupiter'
    }
}
```

Functions module describes what we carry in the jar, so pick wisely. Classloader which used for functions, was extended from pulsar's own,
so classes of pulsar are available at runtime anyway, and we could skip that in the jar.

_functions/build.gradle_
```groovy
plugins {
    // this one would help with building uberjar
    id 'com.github.johnrengelman.shadow' version '5.2.0'
    id 'java'
}

// pulsar docker container runs java 8, so until you build that on your own, 
// functions have to be compiled 1.8 too
sourceCompatibility = targetCompatibility = JavaVersion.VERSION_1_8

dependencies {
    // that would be provided by pulsar for us and 
    // its needed when you want to use extended api of the pulsar functions
    compileOnly 'org.apache.pulsar:pulsar-functions-api:2.5.0'
    // this one would be packed along with the jar
    implementation 'com.fasterxml.jackson.core:jackson-databind:2.11.0'
}
```

The most complicated gradle file is the test one. We need to grab the functions jar along with the test dependencies.

_tests/build.gradle_
```groovy
plugins {
    id 'java'
}

// in tests, we are more flexible on the language level
sourceCompatibility = targetCompatibility = JavaVersion.VERSION_11

dependencies {
    testImplementation 'org.testcontainers:pulsar'

    testImplementation 'io.projectreactor:reactor-core'

    // there is a shaded version with "original" suffix which didn't 
    // work for me with some dependency conflicts, which is odd, but I didn't investigate deeper
    testImplementation 'org.apache.pulsar:pulsar-client-admin:2.5.0'

    // this one is a local runner to simplify debug. 
    // It's slightly different from the cluster mode, 
    // but helps with simple debug tasks. Exclusions here attempt 
    // to play around a mess with different ways of using logging and absence of default configuration
    // maybe could work without, but I didn't dive deeper
    testImplementation('org.apache.pulsar:pulsar-functions-local-runner-original:2.5.0') {
        exclude group: 'log4j'
        exclude group: 'org.slf4j', module: 'slf4j-log4j12'
    }

    testCompileOnly project(':functions') // just for IDE which don't pick up classpath rearrangement
}

test {
    def functionsProject = project(':functions')

    dependsOn functionsProject.shadowJar

    // Rearrange test classpath, add compiled JAR instead of main classes
    // so it takes test compile, runtime classpath with the uber jar as a new one.
    // Initially that was done to test functions in the same module as tests, now its optional.
    // Pay attention to shadowJar task, which is result of the shadow plugin.
    classpath = project.sourceSets.test.output 
                    + configurations.testRuntimeClasspath 
                    + files(functionsProject.shadowJar.archiveFile)
    // would be used in tests
    systemProperty "functions.jar.path", file(functionsProject.shadowJar.archiveFile)
    systemProperty "functions.raw.jar.path", file(functionsProject.jar.archiveFile)

    useJUnitPlatform()
}
```

## Required boilerplate 

To actually work with functions, we have to make sure our infrastructure works properly - pulsar container, 
producer and consumer, as well as logging. 

#### Pulsar

Testcontainers project documentation is the best place to get the latest recommended way of doing things. So here I
provide the code with minimum details.

```java
// version better to match with deps
private static final PulsarContainer PULSAR = new PulsarContainer("2.5.0") 
        .withCommand("bin/pulsar", "standalone") // default one disables worker
        // not a log, as it keeps output compact without additional config - good for debug, 
        // not really good for real tests
        .withLogConsumer(outputFrame -> System.out.print(outputFrame.getUtf8String()))
        // default waiter doesn't work for function worker being available, 
        // leading to 500 on upload otherwise
        .waitingFor(Wait.forLogMessage(".*Function worker service started.*", 1));

private static PulsarAdmin pulsarAdmin;
private static PulsarClient pulsarClient;

static {
    // that's totally optional, but helps to target container via cli during debug
    PULSAR.setPortBindings(List.of(
            "8080:" + PulsarContainer.BROKER_HTTP_PORT,
            "6650:" + PulsarContainer.BROKER_PORT
    ));
    PULSAR.start();
}

@BeforeAll
static void beforeAll() throws PulsarClientException, PulsarAdminException {
    pulsarAdmin = PulsarAdmin.builder()
            .serviceHttpUrl(PULSAR.getHttpServiceUrl())
            .build();
    pulsarClient = PulsarClient.builder()
            .serviceUrl(PULSAR.getPulsarBrokerUrl())
            .build();
}
```

#### Logging

To see output of the code around our tests, we could use already available in classpath log4j2. 
It just lacks the config. Ours is quite simple.

_resources/log4j2-test.xml_
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN">
    <Appenders>
        <Console name="Console" target="SYSTEM_OUT">
            <PatternLayout pattern="%d{HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n"/>
        </Console>
    </Appenders>
    <Loggers>
        <Root level="info">
            <AppenderRef ref="Console"/>
        </Root>
    </Loggers>
</Configuration>
```

#### Producer and consumer

I'm a big fan of the reactor project as it represents even complicated flows in a declarative pipelines, which are 
simple to understand after some practice. Will leave the code as is, as it's not the topic of this article.

_consumer_
```java
static Flux<Message<byte[]>> consumer(PulsarClient client, String testInputsTopic) {
    return Flux
            .usingWhen(
                    Mono.fromCompletionStage(() -> client.newConsumer()
                            .subscriptionType(SubscriptionType.Exclusive)
                            .consumerName("consumer-" + UUID.randomUUID())
                            .subscriptionName("subscription-" + UUID.randomUUID())
                            .topic(testInputsTopic)
                            .subscribeAsync()
                    ),
                    consumer -> Mono.fromCompletionStage(consumer::receiveAsync)
                            .delayUntil(msg -> Mono.fromCompletionStage(consumer.acknowledgeAsync(msg)))
                            .repeat(),
                    consumer -> Mono.fromCompletionStage(consumer.closeAsync())
            )
            .doOnNext(msg -> {
                System.out.printf("[%s]: %s (key:%s)%n", testInputsTopic, new String(msg.getData()), msg.getKey());
            });
}
```

To support both string and json content, for the convenience better to create two producers.

_producer_
```java
static Flux<MessageId> json(PulsarClient client, String testInputsTopic) {
        return Flux
                .usingWhen(
                        Mono.fromCompletionStage(() -> client.newProducer(Schema.JSON(Map.class))
                                .hashingScheme(HashingScheme.Murmur3_32Hash)
                                .topic(testInputsTopic).createAsync()
                        ),
                        producer -> Flux.interval(Duration.ofSeconds(2))
                                .map(i -> producer
                                        .newMessage()
                                        .key(UUID.randomUUID().toString())
                                        .value(Map.of("value", i + "-" + UUID.randomUUID()))
                                        .sendAsync()
                                )
                                .flatMap(Mono::fromCompletionStage),
                        producer -> Mono.fromCompletionStage(producer.closeAsync())
                );
    }

    static Flux<MessageId> string(PulsarClient client, String testInputsTopic) {
        return Flux
                .usingWhen(
                        Mono.fromCompletionStage(() -> client.newProducer(Schema.STRING)
                                .hashingScheme(HashingScheme.Murmur3_32Hash)
                                .topic(testInputsTopic).createAsync()
                        ),
                        producer -> Flux.interval(Duration.ofSeconds(2))
                                .map(i -> producer
                                        .newMessage()
                                        .key(UUID.randomUUID().toString())
                                        .value(i + "-" + UUID.randomUUID())
                                        .sendAsync()
                                )
                                .flatMap(Mono::fromCompletionStage),
                        producer -> Mono.fromCompletionStage(producer.closeAsync())
                );
    }
```

## Tests

As you survived at this point through the massive code examples,
now it's real time to dig into interesting things. I managed to get working 4 ways of running 
functions within the tests, which are the most used ones: cluster and local mode for extremely simple function,
as well as function with external dependency (jackson in my case).

Actually, the local runner uses exactly the same function config, so any test could be rotated back and force 
using one of the runner:
- for the local runner
  ```java
    LocalRunner.builder().functionConfig(conf.build()).build().start(false);
  ``` 
- for the cluster mode
  ```java
    pulsarAdmin.functions().createFunction(conf.build(), System.getProperty(FUNCTIONS_JAR_PATH_PROPERTY)); 
  ```
  
Let's describe the test structure. First of all, read the article regarding [custom functions subscriptions](../pulsar-functions-custom-subscription),
that would help to also catch messages, published before the function started.

After that, we need to start our debug consumer for input topic to see what's happening and to warm up this topic with a few messages.

```java
Disposable listener = Consumer.consumer(pulsarClient, TEST_INPUTS_TOPIC).subscribe();
Producer.json(pulsarClient, TEST_INPUTS_TOPIC).take(2).blockLast(Duration.ofMinutes(1));
// or (in case of string payload)
Producer.string(pulsarClient, TEST_INPUTS_TOPIC).take(2).blockLast(Duration.ofMinutes(1));
```

Next step - define functions config and actually create and run with functions above:

```java
FunctionConfig.FunctionConfigBuilder conf = FunctionConfig.builder()
            .tenant("public")       // already available in the container
            .namespace("default")   // already available in the container
            .inputs(List.of(TEST_INPUTS_TOPIC))
            .output(TEST_OUTPUT_TOPIC)
            // for the cluster mode this one duplicates tha passed parameter. 
            // Works there without it, so dunno why it exists
            // as we are forced to define the runtime
            .jar(System.getProperty(FUNCTIONS_JAR_PATH_PROPERTY)) 
            .runtime(FunctionConfig.Runtime.JAVA)
            .name("function-" + UUID.randomUUID().toString())
            // this one would be different depending on the 
            // function class - simple or a complex one with deps
            .className(ExclamationFunction.class.getName());
```

Then run consumer for output topic and block on the producer. That's it, everything ready for the debug - check the 
example project for the ready-to-use example.

## Few things worth mention

#### Function logs

When you launch function via local runner - then the log should be visible right after. With cluster mode log is not exposed
in the console output, so it's hard sometimes to understand what's happening. To get the right log path, just print it using:
```java
System.out.println(String.format(
    "docker exec %s cat /tmp/functions/%s/%s/%s/%s-0.log", 
    PULSAR.getContainerId(), conf.getTenant(), conf.getNamespace(), conf.getName(), conf.getName()
));
```

#### De/Serialization

I wasn't able to get working SerDe as it's intended, 
so I just embedded the class usage and filled an issue [apache/pulsar#6883](https://github.com/apache/pulsar/issues/6883).


#### Additional features

I also noticed that logs topic as well as dlq works only with the local runner. Maybe, that somehow related to the issue mentioned above. 
Or maybe, not :) Most probably it could be subject of another article.