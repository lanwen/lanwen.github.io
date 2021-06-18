---
title: "Complex checks for a specific path for a ServerHttpSecurity"
tags: ["spring-framework", "spring-security", "java"]
---

## Situation

Imagine you have a JWT token, which was successfully parsed, brought some authorities and now you have to check them
in some non-trivial way. 

Everyone knows `.hasAuthority`, `.hasRole` authorize exchange specifications, however `.access` is not that popular. How to use it?


### Example

You have some complex object as a principal - carefully parsed separately, and you need to check some properties of 
that principal along with authorities.

```java
 .pathMatchers(HttpMethod.GET, "/{id}/item")
        .access((authentication, ctx) -> Mono
                .zip(
                        authentication
                            .map(auth -> auth.getAuthorities().stream().anyMatch(e -> e.getAuthority().equals("SCOPE_read:item"))),
                        authentication
                            .map(Authentication::getPrincipal)
                            .map(CustomPrincipal.class::cast)
                            .map(principal -> principal.id().equals(ctx.getVariables().get("id"))),
                        (scope, variable) -> scope && variable
                )
                .map(AuthorizationDecision::new)
        )
```

### What happens here?

First, we have to provide an implementation of `ReactiveAuthorizationManager<AuthorizationContext>` interface, 
with just one method to implement: 

```java
Mono<AuthorizationDecision> check(Mono<Authentication> authentication, AuthorizationContext ctx)
```

Since it's just one method - in the example that represented by a lambda. 

Next, zipping together authority check with a principal check. Result of the zip (combined with logical `AND`) would be then 
converted to an `AuthorizationDecision`. Pay attention to how request context allows us to grab a path variable `{id}` value via 
`ctx.getVariables()`.

That's it! Functional way to write a complicated precondition.