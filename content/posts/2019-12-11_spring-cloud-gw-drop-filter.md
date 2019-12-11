---
title: "Drop filter for the Spring Cloud Gateway"
tags: ["spring-cloud", "filters", "tips"]
draft: false
---

In my case that was useful to wildcard a bunch of paths, but block explicitly a few of them. 
Solve that we could in two ways:

### 1. Filter

The filter itself is pretty straight, just set the status code and say that we've finished.

```java
private static final GatewayFilter DROP_FILTER = (exchange, chain) -> {
        exchange.getResponse().setStatusCode(HttpStatus.NOT_FOUND);
        return exchange.getResponse().setComplete();
};
```

### 1.1 Usage

We have to specify a new route - what I don't really like in this case - still forced to specify the target uri. 
But don't worry, this endpoint won't be reached.

```java
@Bean
public RouteLocator routes(RouteLocatorBuilder builder) {
    return builder.routes()
            .route("dropped", route -> route
                    .path("/api/dropped")
                    .filters(spec -> spec.filter(DROP_FILTER))
                    .uri("http://upstream") // never reached
            )
            .build();
}
```

### 2. "Drop-schema" uri

With some [black magic](https://twitter.com/spencerbgibb/status/1204861992424628229) we can point to an 
unexistent schema and save 6 lines with the same effect!

```java
@Bean
public RouteLocator routes(RouteLocatorBuilder builder) {
    return builder.routes()
            .route("dropped", route -> route
                    .path("/api/dropped")
                    .filters(spec -> spec.setStatus(404))
                    .uri("drop://request")
            )
            .build();
}
```

The trick is that all the filters will skip the processing passing to the next one, only status one will apply. 

The difference here comparing with the drop filter, 
is that request still passes the whole chain (what is not a big deal with quite low number of default filters).

### Testing

To test that we could use [mockserver](http://www.mock-server.com/) and [REST-assured](http://rest-assured.io/) libs.

```java
MockServerClient srv = ClientAndServer.startClientAndServer(PortFactory.findFreePort());

@LocalServerPort
private int port;

@Test
void shouldNotRouteTo() {
    var request = HttpRequest.request().withMethod("GET").withPath("/api/dropped");
    srv.when(request).respond(HttpResponse.response().withBody("OK"));
    
    given()
            .port(port)
            .get("/api/dropped")
            .then()
            .statusCode(404);

    assertThat(srv.retrieveRecordedRequests(request)).hasSize(0);
}
```

