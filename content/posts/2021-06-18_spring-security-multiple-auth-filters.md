---
title: "Multiple authorization tokens checks in a Spring Security within WebFilters"
tags: ["spring-framework", "spring-security", "java"]
---

## Situation

It happens, that you have to change a token type. Or just want to secure a service with different auth mechanics. 
For example, standard JWT and some other custom header with another JWT from internal service. How to achieve that? 

NOTE: For those who can't remember the difference between _auth**e**ntication_ and _auth**o**rization_ (like me) - first comes the one
with `e` - same as with alphabet, then the one with `o` after an initial `auth`.

So here, we don't touch authorization, as mechanic is the same for any kind of token to ensure if it would give enough rights
or not. Instead, we're more interested in how to provide all the necessary authorities, assuming we have 2 ways of providing a token.

### First, we need to setup a regular auth.

Defining a `SecurityWebFilterChain` bean with all the configuration.

```java
@Bean
public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
            .authorizeExchange(spec -> spec.pathMatchers("/info", "/health").permitAll())
            .oauth2ResourceServer(server -> server.jwt(
                    jwt -> jwt
                        .jwtDecoder(customDecoder("say friend and enter"))
                        .jwtAuthenticationConverter(new CustomTokenConverterForAComplicatedPrincipal())
            ))
            .build();
}
```

Some rules to verify a jwt could be implemented like this:

```java
static ReactiveJwtDecoder customDecoder(String secret) {
            var decoder = NimbusReactiveJwtDecoder.withSecretKey(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HMACSHA256"))
                    .macAlgorithm(MacAlgorithm.HS256)
                    .build();

            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                    new JwtTimestampValidator(),
                    new JwtClaimValidator<>("type", claim -> WHITELISTED_TYPE.equals(String.valueOf(claim).toUpperCase())),
                    new JwtClaimValidator<>("id", Objects::nonNull),
                    new JwtClaimValidator<>("scope", Objects::nonNull)
            ));
            return decoder;
}
```

And a converter to get something out of a token:

```java
public class CustomTokenConverterForAComplicatedPrincipal implements Converter<Jwt, Mono<? extends AbstractAuthenticationToken>> {

    @Override
    public Mono<? extends AbstractAuthenticationToken> convert(Jwt source) {
        return Mono.fromSupplier(() -> {
            var user = new MagePrincipal(
                    MagePrincipal.Type.valueOf(source.getClaimAsString("type").toUpperCase()),
                    source.getClaimAsString("id")
            );
            return new PreAuthenticatedAuthenticationToken( // this constructor would give authenticated token
                    user, // principal
                    null, // here credentials - we don't want to store any
                    source.getClaimAsStringList("scope")
                            .stream()
                            .map(scope -> "SCOPE_" + scope)
                            .map(SimpleGrantedAuthority::new)
                            .collect(Collectors.toList())
            );
        });
    }
}
```

This converter provides a proper authenticated token (`PreAuthenticatedAuthenticationToken`), which is already 
authenticated and later could be authorized based on the authorities in the original JWT.

### Another type of token

Now how to handle another type of the JWT token in another header?

Let's assume we want to have both user-based auth, and server-to-server JWT auth in another, `X-Felloship-Auth-Token` header.

Then we need to create a filter, which in our case have to be an `AuthenticationWebFilter`:

```java
public class ServiceAuthenticationFilter extends AuthenticationWebFilter {

    public static String HEADER = "X-Felloship-Auth-Token";

    public ServiceAuthenticationFilter(String secret, String dst) {
        super(authManager(secret, dst)); // AuthenticationWebFilter requires ReactiveAuthenticationManager instance
        setServerAuthenticationConverter(exchange -> Mono // quite simple converter which would grab a token string directly from
                // a custom header and provide it to authentication manager as a bearer one. At this point token is 
                // not yet authenticated
                .justOrEmpty(exchange.getRequest().getHeaders().getFirst(ServiceAuthenticationFilter.HEADER))
                .map(BearerTokenAuthenticationToken::new)
        );
        // this part is required to trigger the filter only on header presence. In other cases filter just skips the request
        setRequiresAuthenticationMatcher(exchange -> exchange.getRequest().getHeaders().containsKey(ServiceAuthenticationFilter.HEADER)
                ? ServerWebExchangeMatcher.MatchResult.match()
                : ServerWebExchangeMatcher.MatchResult.notMatch()
        );
    }

    /**
     * This method would prepare an authentication manager which would convert 
     * a BearerTokenAuthenticationToken into PreAuthenticatedAuthenticationToken with an internal role attached. 
     * Later, an authorization filter would check this token 
     * and authorities to make a decision - should we pass the request or not.
     * @param secret for simplicity, jst is signed with a secret
     * @param dst service to service communication better to have with a clear source and destination written in a token
     * @return manager which would decode a token, verify it and if all good - create an authenticated token
     */
    static ReactiveAuthenticationManager authManager(String secret, String dst) {
        // it needs to know to parse a token, thus we need to create a proper decoder
        var authenticationManager = new JwtReactiveAuthenticationManager(jwtDecoder(secret, dst)); 
        // if jwt was successfully validated, we can use it to create a proper principal and a list of authorities
        authenticationManager.setJwtAuthenticationConverter(jwt -> Mono.just(new PreAuthenticatedAuthenticationToken(
                jwt.getClaim("src"),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_INTERNAL"))
        )));

        return authenticationManager;
    }

    /**
     * Decoder is the part which actually converts and verifies a jwt string as a real jwt token. Here we define what
     * kind of claims we actually expect from the token
     * @param secret just a string for a HMAC alg
     * @param dst destination to check if the token was specifically for us. Actually, aud and iss params exist for this purpose,
     *            but to complicate things we use our own claim names
     * @return decoder to take care of the string token
     */
    static ReactiveJwtDecoder jwtDecoder(String secret, String dst) {
        var decoder = NimbusReactiveJwtDecoder.withSecretKey(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HMACSHA512"))
                .macAlgorithm(MacAlgorithm.HS512)
                .build();

        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtTimestampValidator(),
                new JwtClaimValidator<>("dst", claim -> String.valueOf(claim).equals(dst)),
                new JwtClaimValidator<>("src", Objects::nonNull)
        ));
        return decoder;
    }
}
```

In the example given, `dst` and `src` claims are used, as it's easy to showcase some custom validators, however there are
special `aud` and `iss` claims for exactly this purpose exist. For `iss` (issuer) a dedicated `JwtIssuerValidator` can 
be found in spring. For `aud` it could be done same way as for `dst` with the only difference - it is an array of strings, 
and they are written as urls.

### How to apply the filter

The last bit of the process - place this filter correctly. As this one is authentication filter, it has to be added near 
existing authentication filter like that:

```java
public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
            .addFilterAfter( // since we have a match filter defined, doesn't really matter in our case before or after
                new ServiceAuthenticationFilter("this door only for hobbits - that's the secret!", "hobbiton-destination"),
                SecurityWebFiltersOrder.AUTHENTICATION // here is the most meaningful thing
            )
            .authorizeExchange(spec -> spec.pathMatchers("/info", "/health").permitAll())
            // ... other configuration, including the default jwt configuration
```

Then in tests just call endpoints authenticated by both ways simultaneously and sequentually, as well as without auth at all,
and you're good to go!