---
title: "Junit 5 extension model to pump your parameterization"
tags: ["junit5", "tests", "java"]
---

[Parameterized tests](https://junit.org/junit5/docs/current/user-guide/#writing-tests-parameterized-tests) in Junit 5 
are an extremely powerful tool, as can replace dozens of test 
methods with just one, accepting different arguments. Default providers could cover already 
most of the cases. However, sometimes it's not enough to express the test logic in a way it would be
easy to read and understand, as it's too generic.

## Task

Imagine, we're testing complicated logic of the API gateway with a bunch of microservices behind.
That way we would get up and running container with the gateway, as well as the mockserver playing 
the final destination role. The only thing left - do a http call to the gateway and await for a 
request landing in the mockserver.

> NOTE: I'm assuming that everything is inside the docker, as it greatly simplifies fake network configuration,
as well as abstracts us away from the gateway and mockserver nature.

## Naive solution

That's already perfectly solvable with the `@CsvSource`

```java
@ParameterizedTest
@CsvSource({
        "GET, /api/users, /*, 404, false",
        "POST, /api/users, /*, 404, false",
        "GET, /api/users/me, /users/me, 200, true",
        "GET, /api/info, /info, 200, true",
})
void shouldRouteTo(String method, String requestPath, String upstreamPath, int expectedStatus, boolean reached) {
```

And then, within the test just setup mock to listen upstream path and 
check if reached and if status code of a request different from expected.

However, this approach have a few significant drawbacks:

- Just take a look on the arguments number - hard to read and add more - what if we need another optional arg - like header?
    That would require us to adjust all lines to contain something on the proper place - easy to make a typo!
- Hard to maintain separate lists, grouped logically - more services and paths to check - harder it gets to add new in a proper place.

`@MethodSource` would definitely help here, with a more complicated object as an argument.

### @MethodSource improvements

Now, getting something like:

```java
@ParameterizedTest
@MethodSource("routesCommon")
@MethodSource("routesNotFound")
void shouldRouteTo(TestRouteDetails route) 
```

we have power to apply some pre-processing in the methods. It could help us, for example, to handle different virtual hosts 
passed as additional argument. 

Just go for a loop, stream or specific algorithm and add a
parameter to objects used for test data definitions. 

Should work fine, however, still could be improved.

### Default method tests in an interface

JUnit 5 supports test methods declared as interface default methods. That gives us some options
on how we could group method sources. We could declare test method along the list of annotations (referencing method source names),
but provide the method source itself in the implementation class!

```java
interface GatewayTest {

    @ParameterizedTest
    @MethodSource("routes")
    default void shouldRouteTo(TestRouteDetails route) {
        // testing...
    }   

    MockServer mock(); // if we still need to pass some case specific things from implementations back to interface test
}

class ServiceMainTest implements GatewayTest {
    // declare the routes method
    static List<TestRouteDetails> routes() {
}
```

JUnit would be smart enough to pick it up from the implementation and execute everything the same way, 
as if test method be in the implementation class. 

However, this schema is still not flexible enough - we still want to have multiple groups within the class
and that could be different from class to class. 

Here comes to the light an extension point called `ArgumentsProvider`.

## Custom ArgumentsProvider

Nice option here would be to get rid of the required hardcoded specific method name, 
as well as annotate any kind of method, which then will be discovered automatically and combined with an info from the annotation.

Let's define a dedicated annotation for that.

```java
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@interface Host {
    String value();
}
```

Also, we need a provider itself
```java
class RoutesProvider implements ArgumentsProvider {
    @Override
    public Stream<? extends Arguments> provideArguments(ExtensionContext context) throws Exception {
        Object testInstance = context.getTestInstance().orElse(null);
    
        List<Method> methods = ReflectionSupport.findMethods( // these *Support classes are really great
                context.getRequiredTestClass(),
                method -> method.isAnnotationPresent(Host.class),
                HierarchyTraversalMode.BOTTOM_UP // doesn't play a big role until you have several levels
        );
        
        // Just a developer experience - would be weird if after test class execution nothing happens. 
        // Better to explicitly tell that something wrong
        if (methods.isEmpty()) { 
            throw new IllegalStateException(String.format(
                    "No routes providers found in the class <%s> annotated with <@%s> and returning list of <%s>",
                    context.getRequiredTestClass().getName(),
                    Host.class.getName(),
                    TestRouteDetails.class.getName() 
            ));
        }

        return methods.stream()
                .flatMap(method -> CollectionUtils
                        .toStream(ReflectionSupport.invokeMethod(method, testInstance))
                        .filter(arg -> arg instanceof TestRouteDetails)
                        .map(TestRouteDetails.class::cast)
                        // Adding some meta info from the annotation to the list of arguments
                        .map(route -> Arguments.of(method.getAnnotation(Host.class).value(), route))
                );
    }
}
```

That's mostly copy of the default method source provider - with the difference that it doesn't have to be generic at all.
Only our case and some assumptions.

Last bit - annotate test method (in the interface) with `@ArgumentsSource(RoutesProvider.class)`

Then we can add as many methods with test routes as we want with any name we want and clear semantic:

```java
@Host("auth.lanwen.ru")
static List<TestRouteDetails> routesHost() {
    return List.of(
            TestRouteDetails.of("GET", "/oauth/token", "/oauth/token", 200, true),
            TestRouteDetails.of("POST", "/oauth/token", "/oauth/token", 200, true)
    );
}

@Host("gate.lanwen.ru")
static List<TestRouteDetails> routesGate() {
    return List.of(
            TestRouteDetails.of("GET", "/auth/oauth/token", "/oauth/token", 200, true)
    );
}
```

Thanks to JUnit 5, in the test report all tests would contain string representation of arguments in their names, so 
it would be easy to find class, group and concrete line with test route in case of failure.

You could go further and annotate each class with some annotation, providing an additional context. Like, something you 
would pass to docker, before it starts containers (I use it to pass upstream network aliases to docker).