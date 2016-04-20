<!--- This Source Code Form is subject to the terms of the Mozilla Public
    - License, v. 2.0. If a copy of the MPL was not distributed with this
    - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->



rho-contracts.js
===============

Racket-style Higher-Order Contracts in Plain JavaScript

## Table of Content
[Installation](#installation)  
[Introduction](#introduction)  
[Run-time vs Compile-time](#runtime)  
[Higher-order contracts](#higher-order)  
[Blame, Blame-correctness, and Blame Tracking](#blame)  
[Contracts on Functions-as-Values](#functions-as-values)  
[Tutorial](#tutorial)  
[Basic Value Contracts](#basic-value)  
[Storing Custom Contracts](#storing)  
[Data Structure Contracts](#data-structure)  
[Contracts on Functions](#functions)  
[Contracts for Optional Arguments](#optargs)  
[Wrapping vs Checking](#wrap-vs-check)  
[Object Contracts](#objects)  
[A Lightweight Notation](#lightweight)  
[Contracts on Prototypes and Constructors](#constructors)  
[Undocumented Functionality](#undocumented)  
[Related Work](#related)  
[License](#license)  


<a name="installation"/>
## Installation

`npm install rho-contracts`

<a name="introduction"/>
## Introduction

*(scroll down to* Tutorial *to skip the intro)*

`rho-contracts.js` is an implementation of Racket's higher-order contracts library in
JavaScript. It is an attempt to bring to JavaScript the reliability benefits we
usually get from static types, namely:

* Types detect bugs early, loudly, and provide clear error messages with
   precise blame.

* Types establish powerful invariants that guarantee that certain kinds of bugs
   do not exists in certain sections of the code.

* Types act as a checked documentation for the expected input-output type of
   functions.

* Types provide a fulcrum against which we can leverage a refactoring.

Among the dynamic languages, JavaScript is suffering from the absence of static
types quite, because of it propensity for implicitly converting everything
into everything else, and its habit turning anything into a `null` at a moment's
notice. When I couldn't stand it anymore, I wrote this contract library.


<a name="runtime"/>
### Run-time vs Compile-time

`rho-contracts.js` is purely a run-time checker. It will never give a compile-time
error; it will never refuse to run your code. `rho-contracts.js` is an assert library
where the assertions are written in a style similar to that of a static type
system, and whose checking discipline is sufficiently strict to provide similar
guarantees as a type system (though not the same.)

<a name="higher-order"/>
### Higher-order contracts

`rho-contracts.js` is an *higher-order* contract library, as opposed to
run-of-the-mill assertion library, which means that it provides the ability to
check assertions on functions received as an arguments, and on function returned from
functions. When implementing `derive(fn, deltaX)`, it is trivial to add an assert
that checks that `deltaX` is a number. It is harder to check that `fn` is a
function that always returns a number. Without higher-order contracts, the only
way to implement this check is to pollute the code with `if (!isNumber(result_from_fn)) ...`
everywhere `fn` is called -- that's not great. Higher-order contracts make it
possible to place the specification next to the definition of `derive`, where it
belongs, like this:

```javascript
var c = require('rho-contracts')

// derive: returns a function that is the numerically-computed derivative
//         of the given function.
var derive =

  /* This is the specification: */
  c.fun( { fn:     c.fun( { x: c.number } ).returns(c.number) },
         { deltaX: c.number                                   } )
   .wrap(
         /* And the implementation goes here: */
         function(fn, deltaX) {
           return function(x) {
            return (fn(x+deltaX/2) - fn(x-deltaX/2))/deltaX
           }
         })
```

In this example, we use `c.fun` to instantiate a contract stating that `derive`
is a function of two arguments. The first argument, which is named `fn`, must be a
function of one argument, called `x`, which must be a number. The contract also
specifies that `derive`'s second argument is named `deltaX`, which must be a
number.

The `derive` function itself is created as an anonymous function using JavaScript's
own `function` keyword. The newly created anonymous function is then immediately
wrapped with a contract-checking shell, using `rho-contracts.js`' `.wrap()` method on
contracts. The result of `.wrap()` is a function that:

1. checks that the given arguments passes their contracts (aka, that `fn`
   is a function and that `deltaX` is a number),
2. calls the original function, then
3. checks that the result of calling the function matches the
   contract specified in the `.returns()` clause, then
4. passes the result through to the to the original caller.

In addition, at the moment of the call to the original function (Step 2 above),
`rho-contracts.js` will `.wrap()` the function passed-in for `fn`. This way `fn`
itself will be protected by a contract shell during the entire duration of the
execution of the body of `derive`, and all its invocations will be checked
against the contract.

Given the definition for `derive` above:
```javascript
  > function quadratic(x) { return 5*x*x + 3*x + 2 }

  // When `derive` is called correctly, there is no error:
  > var linear = derive(quadratic, 1.0)

  > linear(0)
  3
  > linear(1)
  13
  > linear(10)
  103

  // Error: calling with the arguments flipped:
  > derive(1.0, quadratic)
  ContractError: Expected fun, but got 1
  For the `fn` argument of the call.

  // Error: forgetting an argument:
  > derive(quadratic)
  ContractError: Wrong number of arguments, expected 2 but got 1

  // Error: calling with the wrong kind of function:
  > var fprime = derive(function(x) { return "**" + x + "**" }, 1.0)

  // There is now a contract-checking shell installed around `fprime` that
  // throws an error when `fprime` is called:
  > fprime(100)
  ContractError: `fn()` broke its contract
  Expected number, but got '**100.5**'
  for the return value of the call.
```

Note how these contract errors are triggered earlier than JavaScript's
native error, they provide clearer error messages, and they highlight the
exactly line where the error is, rather than some line deep inside the
implementation of `derive`.


<a name="blame"/>
### Blame, Blame-correctness, and Blame Tracking

In the last example, when `fn` fails to return a number, which code is
responsible for the failure? A normal assertion library used as desbribed
earlier would raise an exception: *assertion failed: expected a number for
variable `result_from_fn` but got a string*. This exception would contain a
stack trace whose first frame would be pointing the blame on the shoulders of
the implementation of `derive`. But that is incorrect. The error is not that
`derive` assigned a wrong value to the `result_from_fn` variable. Rather, `fn`
broke its contract -- or more precisely, the module calling `derive` was
contractually required to provide a function that would only return numbers when
called, but it failed to abide its responsibility. The error message should
make it clear that the failure comes from `fn`, not from `derive`. `rho-contracts.js`'s
error messages do indeed makes this clear. The error printed is:

      `fn()` broke its contract. Expected a number, but got '**100.5**'
      for the return value of the call.

`rho-contracts.js` is an implementation of the paper [*Contracts for higher-order
functions*](http://dl.acm.org/citation.cfm?id=581484), by Findler and Felleisen,
ICFP 2002.  The paper formalizes the notion of blame, describes the
blame-tracking algorithm necessary to report blame correctly, and proves the
algorithm correct.

This implementation follows the paper closely though without Racket's macro
system it was not possible to implement the report of blame in term of the name
of the module interacting. `rho-contracts.js` only reports the function names.


<a name="functions-as-values"/>
### Contracts on Functions-as-Values

`rho-contracts.js`'s higher-order contracts can also be used to check the correctness
of functions used as values (aka, stored inside data structures.) This is
clearly very useful in JavaScript where functions-in-data are used
everywhere. In JavaScript, objects are constructed by putting functions into a
hash table, then passing that hash table around. It would be impossible to check
these functions against their specification without higher-order contracts.

For example:

```javascript
// Define a contract for position objects with two methods, `moveX` and `moveY`:
> var posContract =
    c.object({
        x: c.number,
        y: c.number,
        moveX: c.fun({dx: c.number}),
        moveY: c.fun({dx: c.number})
    })

// Define a constructor for position objects. Objects returned
// will have their methods `.wrap()`-ed with contract-checking shells:
> var makePos = c.fun({x: c.number}, { y: c.number })
                 .returns(posContract)
                 .wrap(
                     function(x, y) {
                         return { x: x,
                                  y: y,
                                  moveX: function(dx) { return makePos(this.x + dx, this.y) }
                                  moveY: function(dy) { return makePos(this.x, this.y + dy) }
                     }
                 })

// Try to misuse the object:
> makePos(5, 7).moveX("left")

ContractError: on `moveX()`
Expected number, but got 'left'
for the `dx` argument of the call.
```

<a name="tutorial"/>
## Tutorial

*In a delightful instance of self-reference, the contract library is documented
 and checked using the contract library itself. If reading tutorials is not your thing,
 you may want to instead look at the contracts placed on `rho-contracts.js`'s functions
 and methods by reading [`contract.face.js`](https://github.com/sefaira/rho-contracts.js/blob/master/contract.face.js) directly.*

The contract library is typically `require`'d and bound to a variable called `c`:

```javascript
c = require('rho-contracts')
```

<a name="basic-value"/>
### Basic Value Contracts

Some fields of `c` are contract objects you can use directly, such as the
`c.number` contract:

```javascript
> c.number.toString()
'c.number'
> c.number.check(5)       // everything is fine, no error, returns the given value.
5
> c.number.check("five")  // boom, because a string is not a number.
ContractError: Expected number, but got 'five'
```

The `ContractError` being thrown is a normal JavaScript `Error`. It can be caught
and rethrown like normal exceptions.  Other useful basic contracts are
`c.string`, `c.integer`, `c.bool`, and `c.regexp`.

- `c.string` : accepts only strings, according to Underscore.js's `_.isString()`
- `c.integer` : accepts only numbers `v` that satisfy `Math.floor(v) === v`
- `c.bool` : accepts only booleans, according to Underscore.js's `_.isBoolean()`
- `c.regexp` : accepts only regular expressions, according to Underscore.js's `_.isRegExp()`

For completeness, there are also

- `c.falsy` : accepts only values that selects the `else` branch of a JavaScript
conditional
- `c.truthy` : accepts only values that select the `if` branch.
- `c.value()` : accepts only the given value and nothing else.
- `c.any` : the contract that accepts everything
- `c.nothing` : the contract that rejects everything

Other fields of `c` are functions that construct interesting
contracts, such as `c.oneOf()` which returns a contract that only accepts the values enumerated:

```javascript
> var anwserContract = c.oneOf("y", "yes", "n", "no")

> anwserContract.toString()
'c.oneOf(y, yes, n, no)'

> answerContract.check("yes")   // good, no error
'yes'

> answerContract.check("bunny")    // boom
ContractError: Expected oneOf(y, yes, n, no), but got 'bunny'
```

On particularly powerful contract is `c.or()`, which is a contract that takes
two or more contracts as argument, and returns a contract that accept a value if
it passes any one of the given contracts:

```javascript
> c.or(c.number, c.string).check(10)        // good
10
> c.or(c.number, c.string).check("ten")     // good
'ten'
> c.or(c.number, c.string).check( { x: 10 } )
ContractError: none of the contracts passed:
 - c.number
 - c.string
The failures were:
c.number: Expected number, but got { x: 10 }
c.string: Expected string, but got { x: 10 }
```

The `c.or()` contracts makes it possible to specify types for the kind of
heterogeneous functions that are common in idiomatic JavaScript, but that would
be refused outright by most static type systems (that is so awesome.)


<a name="storing"/>
### Storing Custom Contracts

The contract library provides a rich collection of contract function to
construct sophisticated contracts from simple one, such as:

- `c.or()` : as we just saw, accepts values that pass at least one of the given
  contracts.

- `c.and()` : accepts only values that pass all of the given contracts.

- `c.matches()` : accepts only strings that match the given regular expressions.

In all likelihood, you will be instantiating a large number of custom
contracts. It is customary to create a hash to contain the custom contract
created in an application or in a particular module:

```javascript
> var cc = {}  // custom contracts
> cc.numberAsAString = c.matches(/^[0-9]+(\.[0-9]+)?$/)
> cc.numberAsAString.check("42")            // ok
> cc.numberAsAString.check("10.7")          // ok
> cc.numberAsAString.check("10.")           // boom
ContractError: Expected matches(/^[0-9]+(\.[0-9]+)?$/), but got '10.'
```
Another option is to make a clone of the contract library at the top of
your node module and keep the contracts created and used in that module in the clone:

```javascript
> var _ = require('underscore')
> var c = _.clone(require('rho-contracts'));
> c.numberAsString = c.matches(/^[0-9]+(\.[0-9]+)?$/)
> c.or(c.falsy, c.numberAsString).check(null)     // ok, null is falsy
null
```

To prevent the `toString()` output of custom contracts from become unwieldy long and
render the `rho-contracts.js`'s error messages difficult to read, call `.rename()`
before storing them:

```javascript
> c.numberAsString = c.matches(/^[0-9]+(\.[0-9]+)?$/)
                      .rename('numberAsString')

> c.numberAsString.check("o_0.")           // boom
ContractError: Expected numberAsString, but got 'o_0.'
```


<a name="data-structure"/>
### Data Structure Contracts

A `c.array()` contract checks that all items in the array passes the given
contract:

```javascript
> c.array(c.integer).check([1, 2, 3, 45.2, 5, 6])
ContractError: Expected integer, but got 45.2
for the 4th element of the array.
The full value being checked was:
[ 1, 2, 3, 45.2, 5, 6 ]
```

A `c.tuple()` contract checks that the array has at least the given number of items
(having extra items is OK). Then it checks that each item passes its
corresponding contract:

```javascript
> c.tuple(c.number, c.string).check([10, "ten"])   // ok
[ 10, 'ten' ]

> c.tuple(c.number, c.string).check([10, 20])      // boom
ContractError: Expected string, but got 20
for the 2nd element of the tuple.
The full value being checked was:
[ 10, 20 ]

> c.tuple(c.number, c.string).check([10])          // boom
ContractError: Expected tuple of size 2, but got [ 10 ]
```

A `c.hash()` contract checks that all right-hand values of a hash table passes the
given contract:

```javascript
> c.hash(c.bool).check({ a: true, b: true, c: false, d: null, e: false })
ContractError: Expected bool, but got null
for the key `d` of the hash.
The full value being checked was:
{ a: true, b: true, c: false, d: null, e: false }
```

<a name="functions"/>
### Contracts on Functions

Contract on functions are implemented by wrapping the implementing
function with a contract-checking shell. This is achieved with the `.wrap()`
method on contracts:

```javascript
> function square_implementation(x) { return x * x }
> var square_contract = c.fun ( { x: c.number } )
> var square = square_contract.wrap(square_implementation)
> square(25)
625
```

The contract-checking shell checks all invocations of the `square` function. It
will raise an error if either the wrong number of arguments is provided, or if
any argument fails to check against its contract:

```javascript
> square(10, 11, 12)
ContractError: Wrong number of arguments, expected 1 but got 3

> square("cat")
ContractError:
Expected number, but got 'cat'
for the `x` argument of the call.
```

Usually, the implementation, the contract, and the wrapped function are all
created at once in one expression, like this:

```javascript
var square = c.fun( { x: c.number } )
              .wrap(
                function (x) { return x * x } )
```

Each argument's contract is specified in the call to `c.fun()` using a hash
table containing exactly one field. The name of that field is used by
`rho-contracts.js`'s error messages when the argument's check
fails. Note that the name of the argument in the contract can be different from the name
of the argument in the implementation. This is sometime useful -- at time
the implementation might want to uses a short name internally, yet still prefer to
give users a long-form variable name in the error messages:

```javascript
var normalizeTime = c.fun( { secondSinceEpoc: c.number } )
                     .wrap(
                       function (s) { return s % 60 } )
> normalizeTime(124526)
26
> normalizeTime(null)
ContractError: Expected number, but got null
for the `secondSinceEpoc` argument of the call.
```

Contracts for function of more than one arguments are specified by passing
additional one-field hashes, separated by commas:

```javascript
var area = c.fun( { x: c.number }, { y: c.number } )
            .wrap(
              function(x, y) { return x * y }
```

Attempting to pass all arguments as a single hash is an error:

```javascript
> var area = c.fun( { x: c.number,  y: c.number } )
>             .wrap(          // ^---- THIS IS WRONG
>               function(x, y) { return x * y }
ContractLibraryError: fun: expected exactly one
key to specify the name of the 1st arguments, but got 2
```

This style of specifying arguments names when calling `c.fun()` is necessary
because JavaScript does maintain the order of fields in hashes.

Contracts returned by `c.fun()` have three additional methods not found on other
contracts:

* `c.fun().returns(c.number)` : This will check that the function returns only numbers.

* `c.fun().extraArgs(c.array(c.number))` : This will allow a variable number of
  arguments, so long as they are all numbers. Generally, the contract passed to
  `.extraArgs()` will be matched against an array containing the extra arguments
  beyond those specified explicitly. This opens the possibility of checking
  overloaded function and other rich combinations of extra arguments by using
  `c.or()` contract along with `c.tuple()` contracts.

Like all other methods on contract, these thwo methods, `.returns()`
and `.extraArgs()` do not modify the original contract. Instead they
return a new contract which checks everything the original contract checks, plus
their additional check. They are used like this:

```javascript
> var triceWord = c.fun({s:c.any}).returns(c.string)
                    //     ^---- This is a bug, should be `c.string`
                   .wrap(
                      function (s) { return s + s + s })
> triceWord("bork")
'borkborkbork'
> triceWord(35)
ContractError: Expected string, but got 105
for the return value of the call.
```

* `c.fun().thisArg( ---- )` : We mention `.thisArg()` for completeness. This contract
  checks that the method was invoked on an object of the right form. (Note, this
  method name is not called `this` to avoid clashing with the JavaScript reserved
  word `this`). However, usages of `c.fun().thisArg` are rare. It is more customary
  to use the `.method()` method on object contacts (See *Contracts on Objects*
  below.) `c.fun().thisArg` is useful when using the *Apply Invocation Pattern*
  described in Chapter 4 of Douglas' Crockford' *JavaScript, The Good Parts*.

```javascript
> var makeStatus = function(string) { return { status:  string } }

> var get_status =
   c.fun().thisArg(c.object({status: c.string})).returns(c.string)
    .wrap(
       function() { return this.status })

> get_status.apply({ status: 'A-OK' }) // OK
'A-OK'

> get_status.apply({ statosstratos: 'I have a typo' }) // not OK
ContractError: Field `status` required, got { statosstratos: 'I have a typo' }
for this `this` argument of the call.
```



<a name="optargs"/>
### Contracts for Optional Arguments

Contracts can be marked optional using `c.optional()` When used for a function's
argument, a contract that has been marked optional makes that argument optional
(the contract itself is not affected otherwise). All arguments to the right of an optional
argument must be optional as well.

```javascript
> var c = require('rho-contracts')
> var util = require('util')

> var x = 0
> var incrementIt = c.fun({ i: c.optional(c.number) } ).returns(c.number)
    .wrap(
      function(i) { if (i) x+=i; else x++; return x })

> incrementIt(10)
10
> incrementIt()   // calling with the argument omitted
11
> incrementIt(10, 20) // too many arguments!
ContractError: Too many arguments, expected at most 1 but got 2
```



<a name="wrap-vs-check"/>
### Wrapping vs Checking

Recall, we cannot tell if a function will be miscalled until it is called, and
we cannot tell if a function will return a value of the wrong type until it
tries to return. Thus, function contracts cannot be checked without wrapping the
targeted function with a contract-checking shell. Concretely, this means it is
an error to call `.check()` on a function contract:

```javascript
> c.fun({ n: c.integer }).check(function(n) { return n+1 })
ContractLibraryError: check: This contract requires wrapping.
Call wrap() instead and retain the wrapped result.
```

The requirement to call `.wrap()` instead of `.check()` carries over to
contracts over data structures containing functions:

```javascript
> var operations = [function (x) { return x + 1 },
                    function (x) { return x * 2 },
                    function (x) { return x * x } ]

// Check whether `operations` is indeed an array of functions from number to number:
> c.array(c.fun({ x: c.number }).returns(c.number))
   .check(operations)
ContractLibraryError: check: This contract requires wrapping.
Call wrap() instead and retain the wrapped result.
```

By replacing `.check()` with `.wrap()`, `rho-contracts.js` will recur down the
array and wrap each function with the function contract:

```javascript
> var operations_wrapped =
    c.array(c.fun({ x: c.number }).returns(c.number))
     .wrap(operations)
```

Here, `.wrap()` returns a new array containing the wrapped functions. So
long as the array's functions are used correctly, the presence of the contract
checking-shells is unnoticeable:

```javascript
> operations_wrapped.foreach(function(fn) { util.debug(fn(5)) }
DEBUG: 6
DEBUG: 10
DEBUG: 25
```

But if we misuse one of the functions, the checking shell throws an
exception. The error provided clearly identifies the source of the fault:

```javascript
> operations_wrapped.foreach(function(fn) { fn("five") }
ContractError: Expected number, but got 'five'
for the `x` argument of the call.
The full value being checked was:
[ [Function], [Function], [Function] ]
```

Meanwhile, the original functions rest unmodified in the original `operations`
array, and continue to fail silently:

```javascript
> operations.foreach(function(fn) { util.debug(fn("five")) }
DEBUG: five1
DEBUG: NaN
DEBUG: NaN
```

The `.wrap()` method wraps recursively all JavaScript's data structures, array,
hashes, tuples, and objects.



<a name="objects"/>
### Object Contracts

Since objects in JavaScript are constructed out of normal hash tables containing
normal functions, contracts on objects follow the usage described in the previous
three sections *Data Structure Contracts*, *Contracts on Functions* and *Wrapping
vs Checking*.

```javascript
> String.prototype.repeat = function( num ) {   // A helper function on
                                                   String, just for fun.
    return new Array(num + 1).join(this);
  }

> c.animal = c.object({ nLegs: c.number,
                        name:  c.string,
                        speak: c.fun({n: c.number}).returns(c.string) })

> var makeCat = c.fun({ name: c.string }).returns(c.animal)
                .wrap(function (name) {
                  return {
                    nLegs: 4,
                    name: name,
                    speak: function(n) { return this.name + " says " + "meow".repeat(n) }
                  }
                })

> var makeBird = c.fun({ name: c.string }).returns(c.animal)
                .wrap(function (name) {
                  return {
                    nLegs: 2,
                    name: name,
                    speak: function(n) { return this.name + " says " + "tweet".repeat(n) }
                  }
                })

> var tweetie = makeBird("tweetie")
> tweetie.speak(3)
tweetie says tweettweettweet.
```

In this example, the contract on the `.speak()` method will correctly verify that the
method returns a string. However, it does not verify whether it was correctly invoked on an
animal -- an error could go undetected:

```javascript
> var speak = tweetie.speak
> speak(2)
undefined says tweettweet.     // Yikes!
```

The `.thisArg()` method on function contracts can be used to add this additional
check. In order to distinguish functions intended be used as methods,
`rho-contracts.js` provides `c.method()`, which is a variant of `c.fun()` that
takes the contract on `this` as its first argument:

```javascript
> c.animal = c.object({ nLegs: c.number,
                        name:  c.string,
                        speak: c.method(c.animal, { n: c.number}).returns(c.string) })
                                      // ^--- Ousp, this doesn't actually work.
```

However, this attempt fails due to the cyclic reference: the line of code
defining the contract for animals refers to the contract for animals. When the
`c.animal` is looked up on the third line the first line has not returned yet,
so `c.animal` is not defined and the lookup returns of `c.animal` returns
`undefined`.

`rho-contracts.js` provides a way to establish this cyclic reference in large part to
make it possible to fully specify such contract on objects. The function
`c.cyclic()` creates a temporary placeholder until we can close the cycle:

```javascript
> c.animal = c.cyclic()
```

The placeholder returned by `c.cyclic()` has only one useful method:
`.closeCycle()`, which must be called with the actual contract:

```javascript
> c.animal.closeCycle(c.object({ nLegs: c.number,
                                 name:  c.string,
                                 speak: c.method(c.animal, { n: c.number }).returns(c.string) }))
```

When using this better definition of `c.animal`, the error is caught as it should:

```javascript
 > var speak = tweetie.speak
 > speak(2)
 ContractError: on `speak()`
 Expected object, but got undefined
 for this `this` argument of the call.
```


`rho-contracts.js` provides three additional pieces of functionality made specifically for
object contracts.

- `c.optional()` : Contracts marked "optional" by the `c.optional()` function (as
  discussed earlier in the *Contracts for Optional Arguments* section) are also
  used to specify optional fields of objects. A field is considered missing if
  is not set, or if it is set to null. All these are OK.

<div>

```javascript
> c.car = c.object({ carModel: c.string,
                     trunkSize: c.optional(c.number) }) // missing to indicate a sport car with no trunk

> c.car.check({ carModel: "MINI Cooper Coupe",          // OK
                trunkSize: 9.8 })

> c.car.check({ carModel: "Infiniti IPL G Convertible", // OK
                trunkSize: null })
```

Or:

```javascript
> c.car.check({ carModel: "Infiniti IPL G Convertible" }) // Also OK
```

But not:

```javascript
> c.car.check({ trunkSize: 22.1 })
ContractError: Field `carModel` required, got { trunkSize: 9.8 }
```

- `.strict()` : By default, objects are allowed to have additional fields not
  specified in the contract. Calling `.strict()` returns a contract that
  disallows them.

<div>

```javascript
 > c.car.check({ carModel: "semitruck", towing: true }) // this is fine

 > c.car.strict().check({ carModel: "semitruck", towing: true }) // but this is not
 ContractError: Found the extra field `towing` in { carModel: 'semitruck', towing: true }
```

- `.extend` :

- .strict on tuples



<a name="lightweight"/>
### A Lightweight Notation ###

All `rho-contracts.js` functions will automatically promote simple values
to the corresponding contract when passed to a function that expects a
contract. This applies to arrays of one argument, non-functions, and
non-objects. Promoting these allows a simpler notation for
contracts. However, automatically promoting objects is too error prone,
so to use the lighter notation in the presence of object contracts,
call `toContract` explicitly, like this:

```javascript
cc.kidPark = toContract({
    name: c.string,
    acres: c.number,
    playunit: {
        junglebars: c.bool,
        slides: c.number,
        ladders: [{
            color: c.string,
            size: c.string
        }]
    }

})

```


<a name="constructors"/>

### Contracts on Prototypes and Constructors ###

To check functions that are intended to be invoked with `new`, aka
"constructor" functions, use the `constructs` method on function
contracts.

```javascript
function CounterImpl(x) {
  this.x = x;
  // return this; // return statement omitted
}

CounterImpl.prototype.inc = function (i) {
  this.x += i;
};

var Counter = c.fun({x: c.number})
               .constructs({
                 inc: c.fun({i: c.number})
               })
               .returns(c.object({x: c.number}))
               .wrap(CounterImpl);

var instance = new Counter(5);
instance.should.have.property('inc');
instance.should.not.have.ownProperty('inc');

// and also both of these hold:
instance.should.be.instanceof(Counter);
instance.should.be.instanceof(CounterImpl);
```

As expected, the method `inc` placed on `CounterImpl.prototype` is
present on the instance's prototype chain without occurring on the
instance itself. Prototype chaining (where one prototype itself is
receiving methods from its prototype and so forth) also works as
expected.

The argument to `constructs` specifies the contracts on the
`prototype` of the function. Unless a different `thisArg` has been set
on the contract, `constructs` threats these functions as methods of
class, meaning that it checks that the `this` argument is always bound
to an instance of the constructor. For example, `instance.inc.call({x:
5}, 1)` fails since `{x: 5}` is not `instanceof Counter`.

`constructs` is not strict, in the sense that additional fields on the
constructor's `prototype`, but not present in the contract, will
appear on the constructed objects' prototype without checks nor
wrapping. This means that private methods and fields can be omitted
from the contract.

Note that that contract-checking shells introduced by rho-contracts
disturb usages of the `constructor` property. Since the `constructor`
field of the prototype continue to point to the original unwrapped
function the equality `new Counter(5).constructor === Counter` no
longer holds.


Though not the best pattern, constructor functions can be wrapped
normally with function contracts, like this:

```javascript
function CounterImpl(x) {
  this.x = x;
  return this; // see below
}

CounterImpl.prototype.inc = function (i) {
  this.x += i;
};

var Counter = c.fun({x: c.number})
    .returns(c.object({
        inc: c.fun({i: c.number}),
        x: c.number
    }))
    .wrap(CounterImpl);

var instance = new Counter(5);
instance.x.should.eql(5);
instance.inc(2);
instance.x.should.eql(7);
```

However, this usage has two downsides:

* First, if the constructor function omits `return` and relies on
  the semantic of `new` invocations to automatically return the newly
  constructed object, contracts on return values (placed with
  `returns`) will fail.
* Second, the common pattern of placing methods on the prototype in
  order to share them across instances fails to achieve the intended
  memory savings since every newly constructed instance receives a
  contract-checking shells for the methods present on the prototype.

The `constructs` method shown above avoids both these problems.



<a name="undocumented"/>

## Undocumented Functionality ##

Additional functionality that's not documented yet:

- c.pred
- forwardRef/setRef
- Contracts on Whole Modules, `publish()`

- The partially documented documentation feature:
- .doc
- .theDoc
- documentType
- documentTable
- document category
- document module

And also

- anyFunction
- isA
- quacksLike
- silentAnd
- `c.fn()`
- setErrorMessageInspectionDepth


<a name="related"/>

## Related Work ##

- `rho-contracts.js` is an implementation of the paper [*Contracts for higher-order
functions*](http://dl.acm.org/citation.cfm?id=581484), by Findler and Felleisen,
ICFP 2002.

- The original and best implementation of the paper's ideas is
  [racket/contract](http://doc.racket-lang.org/reference/contracts.html?q=contract)

- [`contract.coffee`](http://disnetdev.com/contracts.coffee/) is a dialect of
  CoffeeScript that like `rho-contracts.js` also implements Racket's contracts.

- `contract.coffee` runs on top of a [contract-checking
  runtime](https://github.com/disnet/contracts.js) implemented in JavaScript
  using Proxies, that is currently only implemented in Firefox 4+ and chrome/V8
  with the experimental javascript flag enabled.

- [ristretto-js](https://code.google.com/p/ristretto-js/wiki/Documentation)
  implements a run-time checker for types written in Haskell syntax inside of
  specification strings. It suffers from the troubles of externally embedded
  languages, namely that it exists separate from its host language. It support only
  a limited number of basic type (Int, Num, String, Bool, Object, Array) with no
  possibility of extensions that's available and its type namespace is separate
  from the JavaScript namespace and module machinery.


- [jsContract](http://kinsey.no/blog/index.php/2010/02/03/jscontract-code-contracts-for-javascript/),
  [cerny.js](http://www.cerny-online.com/cerny.js/documentation/guides/contracts),
  are good-old (bad-old?) Eiffel-style contract libraries. True to their Eiffel
  roots, they require lots of code for little benefit, in particular, they cannot
  check higher-order functions, cannot separate specification from
  implementation. See Findler and Felleisen for a more thorough comparison.





<a name="license"/>

## License ##

This library was created at Sefaira.com, originally for internal use. We are
releasing it to the open source community under the Mozilla open-source license
(MPL).
