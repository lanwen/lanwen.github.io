---
title: "Multiple authorization tokens types in a Spring Security within the same header"
tags: ["spring-framework", "spring-security", "java"]
---

## Introduction

This is a follow-up post with some discoveries, noticed when implementing the strategy described in [Multiple authorization tokens checks in a Spring Security within WebFilters](/posts/spring-security-multiple-auth-filters/), but with a same header used.
In general, it's mostly the same, however, includes some non-obvious moments, worth noting.

## ReactiveAuthenticationManagerResolver (way №1)

This should be an alternative to the method described further down below via security matchers and filters.

The point is that you implement `ReactiveAuthenticationManagerResolver<ServerWebExchange>`
```java
public Mono<ReactiveAuthenticationManager> resolve(ServerWebExchange context) {
```

Then we have the entire request to match and provide our authentication manager:
```java
 if (context.getRequest().getURI().getPath().startsWith("/special/path")) {
    return new CustomTokenAuthenticationManager();
 }
 // else fallback to something else
```

Later, enable that resolver in the chain:

```java
 .oauth2ResourceServer(server -> server
                .authenticationManagerResolver(resolver))
```

## The main security configuration (way №2)

As you may know, all the fancy dsl for the spring security is just a way to configure a chain of security filters.
So, here is a top of configuration tricks to get a desired result:


### 1. Security matchers

It could be, that parts of the configuration should be applied only to some requests. That becomes especially important
once you have to deal with auth filters and don't want to handle all possible resources within. So you need to explicitly specify the 
`securityMatcher`, after which, the actual configuration follows:

```java
 return http
            .securityMatcher(ServerWebExchangeMatchers.pathMatchers("/actuator/**")).authorizeExchange()
            .pathMatchers("/actuator/**")
            .permitAll()
```

then, after `.and()`, again:

```java 
.and() 
    .securityMatcher(new NegatedServerWebExchangeMatcher(ServerWebExchangeMatchers.pathMatchers("/actuator/**")))
    .addFilterAfter(new CustomTokenAuthWebFilter(), SecurityWebFiltersOrder.AUTHORIZATION)
    .oauth2ResourceServer()
    .jwt()...
```

here, some duplication visible, however, it's not that bad, as allows us to have a granular configuration for different types of preferred security configuration.
Note the `NegatedServerWebExchangeMatcher` - a neat way to exclude some paths from the following configuration. It's important
to emphasize, that `securityMatcher` is just a low-level precondition, the configuration following that starts only after the following dsl method call (thus same `pathMatchers` path). 

### 2. Multiple auth filters - which handles the token

It's quite easy to operate with different headers, as then it's clear which filter should handle what. But what to do with the same default `Authorization` header?

The answer is - use `setRequiresAuthenticationMatcher` on all the non-default filters. It should check during the early stage if the request could be authenticated with this filter.

```java 
public class CustomTokenAuthWebFilter extends AuthenticationWebFilter {

    public CustomTokenAuthWebFilter() {
        super(new CustomTokenAuthenticationManager()); // custom manager if the token is not a JWT
        setRequiresAuthenticationMatcher(exchange -> {
            return okay(exchange) // "okay" is the custom check to understand if it's an exchange we can handle
                ? ServerWebExchangeMatcher.MatchResult.match()
                : ServerWebExchangeMatcher.MatchResult.notMatch();
        });
        // this is how do we convert from the string header to the actual auth object, 
        // later verified by the auth manager.
        setServerAuthenticationConverter(new ServerBearerTokenAuthenticationConverter());
    }
}

public class CustomTokenAuthenticationManager implements AuthenticationManager {

    @Override
    public Authentication authenticate(Authentication authentication) throws AuthenticationException {
        if (authentication instanceof BearerTokenAuthenticationToken a) { // ServerBearerTokenAuthenticationConverter produces this type of auth objects
            return convertTokenToAuthentication(a.getToken()) // some custom logic of how to parse the token if it's not a jwt
                .map(principal -> new PreAuthenticatedAuthenticationToken(principal, null, List.of())) // this way we say that we're good with the principal and it could be checked for athorization (was authentication)
                .orElseThrow(() -> new BadCredentialsException("Failed to get principal out of the given token"));
        }

        throw new InvalidBearerTokenException("Invalid token");
    }
}
```

The important part here is that once our matcher got triggered and our filter handles the request, it could either authenticate the request, or reject it entirely. It couldn't skip it afterwards (at least I didn't find a way to do that).

### 3. Custom prefixes, pre-conversions of the token

To pass the token to the auth manager, we need to convert it to the `Authentication` object. 
In the case of the `Bearer` type of the token, it's `BearerTokenAuthenticationToken` class, parsed by `ServerBearerTokenAuthenticationConverter` class. 
If we don't want to strip away `Bearer` prefix ourselves, do some sanity checks, we could delegate that to the converter and later, adjust the token to our needs.

```java
.oauth2ResourceServer()
.bearerTokenConverter(exchange -> {
    return converter // instantiated somewhere before instance of ServerBearerTokenAuthenticationConverter
        .convert(exchange)
        .cast(BearerTokenAuthenticationToken.class)
        .map(bearer -> {
            String token = bearer.getToken();
            // strip away the custom prefix
            if (token.startsWith(TOKEN_PREFIX)) {
                return new BearerTokenAuthenticationToken(token.substring(TOKEN_PREFIX.length()));
            }
            return new BearerTokenAuthenticationToken(token);
        })
        .cast(Authentication.class);
})
```

After that, just the regular configuration of the resource server. Don't forget to call `authorizeExchange()` with the proper matchers.

### 4. JWKS configuration

To point the spring to the JWKS endpoint, all you need to do is just:

```java
NimbusReactiveJwtDecoder.withJwkSetUri(jwksUrl).jwsAlgorithm(SignatureAlgorithm.RS256).build()
```

and expose that as the bean:

```java
 @Bean
 public ReactiveJwtDecoder jwtDecoder() { ... }
```

or via the dsl.

### 5. Testing

To test that later, the most convenient way is to use the `MockServer` and configure it to return the JWKS endpoint response.

Use the junit5 extension:
```java
@MockServerTest("spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost:${mockServerPort}/mocked.jwks")
```

Create a few helpers:

```java
 // somewhere in set up 
 mockServerClient
     .when(HttpRequest.request().withPath("/mocked.jwks"))
     .respond(
         HttpResponse
             .response()
             .withStatusCode(201)
             .withContentType(MediaType.APPLICATION_JSON)
             .withBody(keyset())
     );

// ... 
static RSABase64EncodedKeyPair KEYPAIR = generateKeyPair();
public record RSABase64EncodedKeyPair(String publicKey, String privateKey) {}

public static RSABase64EncodedKeyPair generateKeyPair() {
    RSAKey pair = new RSAKeyGenerator(2048).generate();
    return new RSABase64EncodedKeyPair(
        Base64.getEncoder().encodeToString(pair.toRSAPublicKey().getEncoded()),
        Base64.getEncoder().encodeToString(pair.toRSAPrivateKey().getEncoded())
    );
}

private String keyset() {
    var jwkSet = new JWKSet(jwk(KEYPAIR.publicKey()));
    return jwkSet.toString(true);
}
```

And to actually create a token in tests:

```java
public static RSAKey jwk(String pubkey) {
    return new RSAKey.Builder(parsePublicKey(pubkey)).keyIDFromThumbprint().build().toPublicJWK();
}
    
public static String jwt() {
    RSAKey key = new RSAKey.Builder(Keys.parsePublicKey(KEYPAIR.publicKey()))
        .privateKey(parsePrivateKey(KEYPAIR.privateKey()))
        // this is useful to check for example, rotation
        .keyIDFromThumbprint()
        .build();
    var jwt = new SignedJWT(
        new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(),
        new JWTClaimsSet.Builder()
            .subject("test")
            .issuer(AUTH_ISSUER)
            .audience(AUTH_AUDIENCE)
            .expirationTime(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
            .build()
    );
    jwt.sign(new RSASSASigner(key));
    return jwt.serialize();
}

public static RSAPrivateKey parsePrivateKey(String key) {
    byte[] byteKey = Base64.getDecoder().decode(key);
    var spec = new PKCS8EncodedKeySpec(byteKey);
    KeyFactory kf = KeyFactory.getInstance("RSA");
    return (RSAPrivateKey) kf.generatePrivate(spec);
}

public static RSAPublicKey parsePublicKey(String key) {
    byte[] byteKey = Base64.getDecoder().decode(key.getBytes());
    X509EncodedKeySpec X509publicKey = new X509EncodedKeySpec(byteKey);
    KeyFactory kf = KeyFactory.getInstance("RSA");
    return (RSAPublicKey) kf.generatePublic(X509publicKey);
}
```

## Conclusion

These are the top 5 things worth me a few days of an intensive debug. I hope that could reduce the time of introducing the good authorization to your project.
