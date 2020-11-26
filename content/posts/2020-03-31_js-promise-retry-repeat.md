---
title: "How to retry or repeat JavaScript promise"
tags: ["javascript", "coding"]
---

Working with some scripts around aws-cdk sometimes requires repeatable call. 
These little helpers could easify polling of something, 
in case you don't want to bring something more powerful like RXJS.

This one just picks up the failed promise and tries to repeat that.

```javascript
async function retry(fn, retriesLeft = 5, interval = 1000) {
    return await fn.catch(async error => {
        console.error(`[retries: ${retriesLeft}]:`, error.message);
        if (retriesLeft) {
            await new Promise(r => setTimeout(r, interval));
            return retry(fn, retriesLeft - 1, interval);
        } else {
            throw new Error('Max retries count reached');
        }
    });
}
```

This one is a bit smarter and actively checking if the result in expected state.

```javascript
async function repeat(fn, until, retriesLeft = 5, interval = 1000) {
    const result = await fn();
    if (!until(result)) {
        if (retriesLeft) {
            await new Promise(r => setTimeout(r, interval));
            return repeat(fn, until, retriesLeft - 1, interval)
        }
        throw new Error('Max repeats count reached');
    }

    return result;
}
```