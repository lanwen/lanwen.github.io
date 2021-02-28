---
title: "How to gracefully shutdown java application"
tags: ["java", "graceful"]
---

## In case you don't run spring boot web application...

In the spring boot web application that handled by default. However, what if we need to run something simple,
run until it got killed by some signal? What's an alternative to `while(true)`?

`shutdownHook` with `CountDownLatch` to the resque!

### The actual code

The code snippet itself is quite a simple:

```java
@Slf4j
public class Application {
    public static void main(String[] args) throws InterruptedException {
        var latch = new CountDownLatch(1);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("graceful shutdown...");

            // do all the shutdowns...

            latch.countDown(); // that unlocks the main thread
        }));

        // launch everything...
        log.info("execution...");
        latch.await();
    }
}
```

Worth adding, that in case of reactive flow it's worth of doing `.onTerminate(latch::countDown).subscribe()` so that
we quit the app naturally when the flow ends by any reason.

## More info on the topic:

Shutdown hooks however are not a guarantee to get a clear shutdown. In different cases they would not be executed:
 https://www.baeldung.com/jvm-shutdown-hooks
