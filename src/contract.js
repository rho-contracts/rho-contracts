// -*- js-indent-level: 2 -*-
"use strict";

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint eqeqeq:true, bitwise:true, forin:true, immed:true, latedef:true, newcap:true, undef:true, strict:false, node:true */

var _ = require('underscore');
var c = require('./contract.impl');
var errors = require('./contract-errors');

_.extend(c, require('./function-contracts.js'));

var thisModuleName = 'Contracts';

c.documentModule(thisModuleName,
    "Example of how to use the contract library",
    "--------------------------------------------",
    "    ",
    "    var contracts = {",
    "    ",
    "      join: c.fun({ strings: c.array(c.string)         .doc('The strings to join') }, ",
    "                  { separator: c.optional().string     .doc('The separator to be used. If omitted, the elements are separated with a comma') })",
    "        .returns(c.string)                             .doc('All the `strings` concatenated in sequence, separated by the `separators`'))",
    "      ",
    "    ",
    "      push: fun().extraArgs({ items: c.array(c.any) })  .doc('The items to add to the end of the array') })",
    "        .returns(c.array(c.any))",
    "    }",
    "    ",
    "    var implementation = {",
    "      join: function (...) { ... },",
    "      push: function (...) { ... }",
    "    }",
    "    ",
    "    module.exports = c.publish(implementation, contracts);",
    "",
    "In general, contracts are any values that can be promoted to a",
    "`contractObject` by `toContract`. However, `contractObject` have additional useful",
    "functionality.",
    "",
    "Functions provided by the contract module that return contracts always return `contractObject`s.");


// ----

var contractObject = c.cyclic();

contractObject.closeCycle
(c.object({
  check: c.method(contractObject, { value: c.any }, { name: c.optional(c.string) }).returns(c.any)
    .doc("See: `check`"),

  wrap: c.method(contractObject, { value: c.any }, { name: c.optional(c.string) }).returns(c.any)
    .doc("See: `wrap`"),

  rename: c.method(contractObject, { name: c.string }).returns(contractObject)
    .doc("Returns `this` with the name `name`. The new name will be used by `toString`",
         "and in error messages."),

  optional: c.method(contractObject).returns(contractObject)
    .doc("See: `optional`"),

  doc: c.method(contractObject).extraArgs([c.string]).returns(contractObject)
    .doc("Returns `this` with zero or more strings set as the `theDoc` array.",
         "",
         "This is useful to document the function or argument `this` contract is",
         "being attached to with `publish` "),

  theDoc: c.array(c.string)
    .doc("An array of strings which will be used by `publish` to document the",
         "values being published.")
}).rename('contractObject')
 .doc("Contracts having following methods. Many values can be promoted to a `contractObject`",
      "with `toContract`. Functions in the contract library automatically promote their",
      "arguments."));

c.documentType(thisModuleName, contractObject);

// Contracts on tuples have one extra method:

var strictExtension = {
  strict: c.method(c.contract).returns(contractObject)
    .doc("Given a tuple contract or a object contract, returns a version of that",
         "contract which refuses tuples with extra elements or objects with",
         "extra fields. ")
};

var tupleContractObject = contractObject.extend(strictExtension).rename('tupleContractObject');


var objectContractObject = c.cyclic();

objectContractObject.closeCycle
(contractObject.extend({
  extend: c.method(objectContractObject, { fieldSpec: c.hash(c.contract)}).returns(contractObject)
    .doc("Returns a contract like `this` that in addition checks that the fields",
         "mentionned in `fieldSpec` match their contracts.")
})
 .extend(strictExtension)
 .rename('objectContractObject')
 .doc("Contracts on objects have two extra method, `extend` and `strict`"));

c.documentType(thisModuleName, objectContractObject);


var functionContract = c.cyclic();

functionContract.closeCycle(
  contractObject.extend({
    extraArgs: c.method(functionContract, { extraArgContract: c.optional(c.contract) }).returns(functionContract)
    .doc("Returns a contract like `this` that accepts a variable number of",
         "additional arguments. `extraArgContract` will be checked against an",
         "array containing the extra arugments, so it should be an array contract or a",
         "tuple contract."),

  thisArg: c.method(functionContract, { thisContract: c.contract }).returns(functionContract)
    .doc("Returns a contract like `this` that accepts only calls where the",
         "implicit `this` argument passes `thisContract`."),

  returns: c.method(functionContract, { resultContract: c.contract}).returns(functionContract)
    .doc("Returns a function contract like `this` that accepts only calls that returns a",
         "value that passes `resultContract`."),

  constructs: c.method(functionContract, {fieldContracts: c.hash(c.contract)}).returns(functionContract)
    .doc("Returns a function contract like `this` that accepts constructor functions.",
         "The constructor function's `prototype` field will be checked according to the",
         "`fieldContracts`. Its result will be check against any contract set with `returns`",
         "whether the contract returns it explicitly with `return` or only mutates",
         "its given `this` object.")

  }).rename('functionContract')
    .doc("Contracts on functions have three extra methods."));

c.documentType(thisModuleName, functionContract);

var contextContract = c.object({ thingName: c.string,
                                 data: c.any,
                                 stack: c.array(c.any),
                                 contract: c.contract
                               });

var contracts = {
  check: c.fun({contract: c.contract}, {data: c.any}, { name: c.optional(c.string) })
    .doc("Verifies that `data` satisfies `contract`, if it doesn't, throws a `ContractError`,",
         "otherwise it returns `data` unchanged.",
         "`check` throws an error if `contract` contains a function contract or any other contract",
         "that cannot be wrapped."),

  wrap: c.fun({contract: c.contract}, {data: c.any}, { name: c.optional(c.string) })
    .doc("Like `check`, verifies that `data` satisfies `contract`, if it doesn't, throws a `ContractError`.",
         "If `data` does not contains any function contracts (nor any custom contract types that require wrapping),",
         "`wrap` returns `data` unchanged. Otherwise, it returns `data` wrapped with the machinery",
         "necessary for further contract checking."),

  optional: c.fun({contract: c.contract}).returns(contractObject)
    .doc("Returns an optional version of `contract`. It will accept all falsy values in",
         "addition to all the values accepted by `this`. ",
         "",
         "When an optional contract is a field specification in `object`",
         "that field is optional, and the contract check on the object will not",
         "complain if the field is missing. When an optional contract is used as an",
         "argument in `fn`, `fun`, or `method`, that argument is",
         "optional. Optional arguments cannot have non-optional arguments to",
         "their right.",
         "",
         "See also: `contractObject.optional`"),

  any: c.contract
    .doc("Accepts any value."),

  pred: c.fun({pred: c.fn(c.any).returns(c.any)}).returns(contractObject)
    .doc("Given a function `pred`, accepts all values for which `pred` returns truthy."),

  nothing: c.contract
    .doc("Rejects all values."),

  falsy: c.contract
    .doc("Accepts only `false`, `null`, `undefined`, the empty string, the",
         "number 0, and the value NaN."),

  truthy: c.contract
    .doc("Accepts all values except `false`, `null`, `undefined`, the empty string, the",
         "number 0, and the value NaN."),

  value: c.fn(c.any).returns(contractObject)
    .doc("Returns a contract that accepts only the given value."),

  oneOf: c.fn().extraArgs().returns(contractObject)
    .doc("Return a contract that accepts any on of the given values."),

  string: c.contract
    .doc("Accepts strings."),

  number: c.contract
    .doc("Accepts numbers"),

  integer: c.contract
    .doc("Accepts integers"),

  bool: c.contract
    .doc("Accepts only the values `true` and `false`."),

  regexp: c.contract
    .doc("Accepts regexps"),

  date: c.contract
    .doc("Accepts `Date`"),

  error: c.contract
    .doc("Accepts `Error`"),

  anyFunction: c.contract
    .doc("Accepts any function. To put contract on the argument and return",
         "value, use `fn`, `fun`, or `method`."),

  isA: c.fun({parent: c.anyFunction}).returns(contractObject)
    .doc("Accepts only values `v` for which `v instanceof parent` returns true."),

  contract: c.contract
    .doc("Accept contract object and any values which can be promoted to a",
         "contract object by `toContract`."),

  toContract: c.fn(c.any).returns(contractObject)
    .doc("Promote the given value to a contract object. Arrays are promoted to an",
         "`array` contract. The array needs to have exactly one element specifying the",
         "contract on the items. Objects are promoted to an `object` contract. Functions",
         "are promoted to a `pred` contract. All other values (except undefined) are prototed to a",
         "`value` contract. The given value is promoted to a contract recursively."),

  quacksLike: c.fun({parent: c.any}, {name: c.string}).returns(contractObject)
    .doc("Accepts any object which has at least the same fields as `parent`, with the same",
         "types, as determined by `fromExample`. `name` is used to describe the",
         "contract by `toString` and in error messages."),

  and: c.fun().extraArgs([c.contract]).returns(contractObject)
    .doc("Accepts value which passes all the given contracts."),

  silentAnd: c.fun().extraArgs([c.contract]).returns(contractObject)
    .doc("Like `and`, but does not mention the presence of the `and` contract in",
         "the error messages."),

  matches: c.fn(c.regexp).returns(contractObject)
    .doc("Accepts strings which match the given regexp."),

  or: c.fun().extraArgs([c.contract]).returns(contractObject)
    .doc("Accepts values which passes at least one of the given contracts.",
         "`or` accepts at most one wrapping contract. `or` will test each of the",
         "contracts in the order they were given, except for the wrapping",
         "contract, which will be tested last. If the wrapping contract is the",
         "only contract that passes, the `or` contract will wrap its value."),

  cyclic: c.fun({needsWrapping: c.optional(c.bool)}).returns(contractObject)
    .doc("Returns an empty placeholder contract which can later be populated with .closeCycle(c).",
         "",
         "This is useful to create a forward reference when contructing a contract that refers to itself.",
         "This occurs, for instance, when describing the type of the `this` argument for methods.",
         "the `this` argument on methods on Class A is A, but the straitforward expression",
         "does not work because of the self reference:",
         "",
         "    var A = c.object({fn: c.fn().ths(A)})",
         "",
         "Instead, do:",
         "",
         "    var A = c.cyclic();",
         "    A.closeCycle(c.object({fn: c.fn().ths(A)}))",
         "",
         "`needsWrapping` much match the value of the `needsWrapping` in the contract used to",
         "close the cycle (defaults to `true`), otherwise `closeCycle` throws an error."),

  forwardRef: c.fun({needsWrapping: c.optional(c.bool)}).returns(contractObject)
    .doc("Synonym for cyclic(), with `needsWrapping` defaulting to `false`. Uses `setRef` instead of `closeCycle`"),

  array: c.fun({itemContract: c.contract}).returns(contractObject)
    .doc("Accepts arrays of any size whose elements are all accepted by `itemContract`."),

  tuple: c.fun().extraArgs([c.contract]).returns(tupleContractObject)
    .doc("Accepts array with as many elements as the number of given contract",
         "(or more) if the array's element are accepted by the corresponding",
         "contract. If the array has more element, they are accepted without any check.",
         "",
         "See also: `strict`"),

  object: c.fun({fieldContracts: c.optional(c.hash(c.contract))}).returns(objectContractObject)
    .doc("Accepts objects that have at least all the fields specified in",
         "`fieldContracts`, so long as the fields' value are accepted by the corresponding contract in",
         "`fieldContracts`. If the field contract was made optional by `optional`, the",
         "object will be accepted even if that field is missing.",
         "",
         "If `fieldContracts` is missing, `object` returns a contract that accepts",
         "any object",
         "",
         "See also: `strict`"),

  hash: c.fun({fieldContract: c.contract}).returns(contractObject)
    .doc("Accept objects whose fields are all accepted by `fieldContract`."),

  fn: c.fun().extraArgs([c.contract]).returns(functionContract)
    .doc("Accepts function that accepts as many arguments as the number of",
         "contracts given, so long as the argument passes the corresponding contract.",
         "Arguments can be optional, so long as there are no non-optional",
         "argument on the right of optional arguments",
         "",
         "See also: `fun`, `method`, `optional`, `returns`, `extraArgs`"),

  fun: c.fun().extraArgs([c.hash(c.contract)]).returns(functionContract)
    .doc("Accepts function that accepts as many arguments as the number of",
         "contracts given, so long as the argument passes the corresponding contract.",
         "",
         "Each arguments is specified with a one-field object. The name of the field",
         "will be used as the name of the argument in error messages.",
         "",
         "See also: `fn`, `method`, `returns`, `extraArgs`"),

  method: c.fun({ths: c.contract}).extraArgs([c.hash(c.contract)]).returns(functionContract)
    .doc("Accepts functions that accepts as many arguments as the number of",
         "contracts given in addition to the `ths` contract, so long as the argument",
         "passes the corresponding contract.",
         "",
         "Calls only passes if the `this` implicit argument passes the `ths` contract.",
         "",
         "Each non-this arguments is specified with a one-field object. The name of the field",
         "will be used as the name of the argument in error messages.",
         "",
         "See also: `fn, `fun`, `returns`, `extraArgs`"),

  /*
  ContractError: c.fun({ context: contextContract }, { message: c.string })
    .returns(c.object({ name: c.string,
                        context: contextContract,
                        message: c.string,
                        expected: c.optional(c.any) }))
    .doc("The errors thrown by the contract library"),
    */

  setErrorMessageInspectionDepth: c.fun({ depth : c.integer })
    .doc("Set a depth to pass to `util.inspect()` to limit the size of the data presented in",
         "the error messages. Default to `null` (unlimited)."),

  //--
  //
  // Functionality to write documentation
  //

  fromExample: c.fun({value: c.any}, { withQuestionMark: c.optional(c.bool) }).returns(contractObject)
    .doc("Returns a contract that accepts values of the same type as `value`.",
         "",
         "An array `value` will result in a contract that accepts arrays whose",
         "elements passes the contract obtained by calling `fromExample` on the array's",
         "first value.",
         "",
         "An object `value` will result in a contract that accepts objects",
         "whose fields passes the contract obtained by calling `fromExample` on all",
         "the fields. If `withQuestionsMark` is true, fields whose name begin with a",
         "question mark will be turned into optional fields with the question",
         "mark removed.",
         "",
         "When given a function, `fromExample` returns the `anyFunction` contract."),

  documentModule: c.fun({moduleName: c.string}).extraArgs(c.array(c.string))
    .doc("Documents the given module in the `documentationTable`.",
         "",
         "Use `documentModule` to give an overview of the module. Individual function",
         "should be documented with `doc` and `publish`.",
         "",
         "`documentModule` adds to the previous documentation, if any."),

  documentCategory: c.fun({moduleName: c.string}, {category: c.string}).extraArgs(c.array(c.string))
    .doc("Store the additional arguments in the `documentationTable` for `moduleName` and `category`,",
         "overwriting existing strings, if any. Sets the current category. All invocations for `doc`",
         "until the next call to `documentCategory` will be filled under this category. The default",
         "category is `false`."),

  documentType: c.fun({moduleName: c.string}, {contract: contractObject})
    .doc("Stores the content of the `theDoc` field of `contract` in the `documentationTable`",
         "for `contract.contractName` in `moduleName`. The given contract should have a been given",
         "a unique name, otherwise `documentType` throws an exception."),

  wrapAll: c.fun({ implementation: c.object() }, { contracts: c.hash(c.contract) })
    .doc("Returns an object like `implementation` where each element is wrapped using the",
         "correspoding contract in `contracts`. Notably, `wrapAll` hides the elements",
         "that are not mentioned in the contract, effectively making them private.",
         "",
         "`wrapAll` records the names of the items being wrapped in the wrapper. The names",
         "are then used to produce better error messages when the contracts fail."),

  publish: c.fun({ moduleName: c.string }, { implementation: c.object() }, { contracts: c.hash(c.contract) },
                 { additionalExports: c.optional(c.object()) })
    .doc("`publish` does the same wrapping as `wrapAll`, then records any documentation",
         "placed on the contract into the global `documentationTable` where a documentation",
         "tool can find them to produce module documentation. The `moduleName` argument",
         "specifies which subtable of `documentationTable` to send the documentation to."),

  documentationTable: c.hash(c.object({ doc: c.array(c.string),
                                        categories: c.array(c.object({name: c.string, doc: c.array(c.string)})),
                                        types: c.hash(contractObject),
                                        values: c.hash(contractObject) }))
    .doc("A table of module names containing the documentation and contracts of",
         "all items published with `publish`, all the types documented with `documentType`,",
         "and all the module documentation provide with `documentModule`."),

  // ---

  privates: c.any // private variables, to grant access to the test module

};

module.exports = c.publish(thisModuleName, c, contracts);

_.extend(module.exports,
         {
           functionContract: functionContract,
           contractObject: contractObject,
           strictExtension: strictExtension,
           tupleContractObject: tupleContractObject,
           objectContractObject: objectContractObject,
           Contract: c.Contract,
           ContractError: errors.ContractError
         });
