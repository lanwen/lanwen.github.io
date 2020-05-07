---
title: "How to subscribe a pulsar function on the earliest position"
tags: ["pulsar", "pulsar-functions"]
---

[Pulsar functions](https://pulsar.apache.org/docs/en/functions-overview/) are great way of doing something simple with
the messages in topic. However, at the moment of the 2.5.1 pulsar,
the default version of a subscription points to the latest position, and you can't change it within the function creation call. 
Which means function would see only messages after function was created. How to adjust that?
Let's find out.

First of all, function config builder allow you setup subscription name among other things:

```java
FunctionConfig.builder().subName("subscription-name")
```

### Create subscription directly

Just do it directly right before the function creation call.

```java
pulsarAdmin.topics().createSubscription("topic", "subscription-name", MessageId.earliest);
```

However, this would create `Shared` type of subscription, which could mixup the 
messages in a target topic. Which leads to the next option.

### Create and close consumer immediately

```java
pulsarClient.newConsumer()
                .subscriptionType(SubscriptionType.Failover)
                .consumerName(UUID.randomUUID())
                .subscriptionName("subscription-name")
                .subscriptionInitialPosition(SubscriptionInitialPosition.Earliest)
                .topic("topic")
                .subscribe()
                .close();
``` 

Without receiving messages that would leave subscription which you can just simply pickup
by a function. That wouldn't work with `Exclusive` type of subscription, 
but you can set up everything here.

### Rewind running subscription

```java
pulsarAdmin.topics().resetCursor("topic", "subscription-name", MessageId.earliest);
```

Can't really find a usecase for that from my side, but this option worth mentioning as well.

Hopefully, that would help to mitigate the current miss of the API, which have been
requested for change in [apache/pulsar#6531](https://github.com/apache/pulsar/issues/6531)