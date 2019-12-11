---
title: "Drop filter for the Spring Cloud Gateway"
tags: ["spring-cloud", "filters", "tips"]
draft: false
---

Faced the absense of ready-to-use filter to do that out-of-the box. So had to write one. 
In my case that was useful to wildcard dosens of paths, but block explicitly a few of them.

### Filter

The filter itself is pretty straight-forward, just set the status and say that we've done.

```java
private static final GatewayFilter DROP_FILTER = (exchange, chain) -> {
        exchange.getResponse().setStatusCode(HttpStatus.NOT_FOUND);
        return exchange.getResponse().setComplete();
};
```

### Usage

We have to specify a new route, and what I don't really like in this case - still forced to specify the target uri. 
But don't worry, this endpoint won't be reached.

```java
@Bean
public RouteLocator routes(RouteLocatorBuilder builder) {
    return builder.routes()
            .route("dropped", route -> route
                    .path("/api/dropped")
                    .filters(spec -> spec.filter(DROP_FILTER))
                    .uri("https://lanwen.ru") // never reached
            )
            .build();
}
```

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

